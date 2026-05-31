// Seller payouts (doc 8.5): what a shop is owed, drafted into a statement, then marked paid
// with the bank transfer reference or cancelled. The rules are in shared/domain/payouts.js;
// this file finds what is payable and keeps every order and fine on one statement at most
// (payout_lines' unique key). Money is recorded, not sent: the transfer happens at the bank.
import { AppError } from './AppError.js';
import { MIN_PAYOUT_PAISE, statement } from '../../../shared/domain/payouts.js';
import { DEFAULT_POLICY } from '../../../shared/domain/policy.js';

export const commissionPctOf = (policy) => policy?.commissionPct ?? DEFAULT_POLICY.commissionPct;
export const holdHoursOf = (policy) => policy?.payoutHoldHours ?? DEFAULT_POLICY.payoutHoldHours;

const onLines = async (dbs, kind, ids) => (ids.length ? new Set((await dbs.payment('payout_lines').where({ kind }).whereIn('ref_id', ids).pluck('ref_id')).map(Number)) : new Set());

/**
 * What one shop can be paid now: delivered orders past the hold not on any statement, applied
 * fines not yet deducted, and reversed fines that were deducted and not given back yet.
 * Also the next time an order in the hold becomes payable.
 */
export async function payableFor(dbs, sellerId, policy, now = Date.now()) {
  const cutoff = new Date(now - holdHoursOf(policy) * 3_600_000);
  const delivered = await dbs.ordering('orders').where({ seller_id: sellerId, status: 'DELIVERED' }).select('id', 'subtotal_paise', 'delivered_at').orderBy('delivered_at');
  const paidOrders = await onLines(dbs, 'ORDER', delivered.map((o) => o.id));
  const open = delivered.filter((o) => !paidOrders.has(Number(o.id)));
  const ready = open.filter((o) => new Date(o.delivered_at) <= cutoff);
  const waiting = open.filter((o) => new Date(o.delivered_at) > cutoff);

  const fines = await dbs.ordering('fines').where({ target_type: 'SELLER', target_id: sellerId }).whereIn('status', ['APPLIED', 'REVERSED']).select('id', 'amount_paise', 'status');
  const deducted = await onLines(dbs, 'FINE', fines.map((f) => f.id));
  const givenBack = await onLines(dbs, 'FINE_RETURNED', fines.map((f) => f.id));
  const toDeduct = fines.filter((f) => f.status === 'APPLIED' && !deducted.has(Number(f.id)));
  const toReturn = fines.filter((f) => f.status === 'REVERSED' && deducted.has(Number(f.id)) && !givenBack.has(Number(f.id)));

  const s = statement(
    {
      orders: ready.map((o) => ({ id: Number(o.id), subtotalPaise: o.subtotal_paise })),
      fines: toDeduct.map((f) => ({ id: Number(f.id), amountPaise: f.amount_paise })),
      returned: toReturn.map((f) => ({ id: Number(f.id), amountPaise: f.amount_paise })),
    },
    commissionPctOf(policy),
  );
  return {
    ...s,
    ordersCount: ready.length,
    firstDeliveredAt: ready[0]?.delivered_at ?? null,
    lastDeliveredAt: ready.at(-1)?.delivered_at ?? null,
    waitingCount: waiting.length,
    waitingGrossPaise: waiting.reduce((t, o) => t + o.subtotal_paise, 0),
    nextPayableAt: waiting.length ? new Date(waiting[0].delivered_at).getTime() + holdHoursOf(policy) * 3_600_000 : null,
  };
}

/** Drafts a statement for one shop. One open statement per shop at a time. */
export async function draftPayout(dbs, { sellerId, staffId, policy }) {
  const openNow = await dbs.payment('payouts').where({ seller_id: sellerId, status: 'PENDING' }).first('id');
  if (openNow) throw new AppError(409, 'PAYOUT_OPEN', `Statement #${openNow.id} for this shop is still open. Mark it paid or cancel it first.`);
  const due = await payableFor(dbs, sellerId, policy);
  if (due.netPaise < MIN_PAYOUT_PAISE) throw new AppError(409, 'NOTHING_TO_PAY', 'Nothing is payable to this shop right now', { netPaise: due.netPaise });
  try {
    return await dbs.payment.transaction(async (trx) => {
      const open = await trx('payouts').where({ seller_id: sellerId, status: 'PENDING' }).forUpdate().first('id');
      if (open) throw new AppError(409, 'PAYOUT_OPEN', `Statement #${open.id} for this shop is still open. Mark it paid or cancel it first.`);
      const [id] = await trx('payouts').insert({
        seller_id: sellerId,
        commission_pct: commissionPctOf(policy),
        orders_count: due.ordersCount,
        gross_paise: due.grossPaise,
        commission_paise: due.commissionPaise,
        fines_paise: due.finesPaise,
        returned_paise: due.returnedPaise,
        net_paise: due.netPaise,
        first_delivered_at: due.firstDeliveredAt,
        last_delivered_at: due.lastDeliveredAt,
        created_by: staffId,
      });
      await trx('payout_lines').insert(due.lines.map((l) => ({ payout_id: id, kind: l.kind, ref_id: l.refId, gross_paise: l.grossPaise ?? 0, commission_paise: l.commissionPaise ?? 0, amount_paise: l.amountPaise ?? 0 })));
      return id;
    });
  } catch (err) {
    // another statement took some of these lines a moment ago
    if (err.errno === 1062) throw new AppError(409, 'PAYOUT_CHANGED', 'Some of these orders were just put on another statement. Refresh and try again.');
    throw err;
  }
}

/** The transfer was made: record its bank reference. Only an open statement can be paid. */
export async function markPaid(dbs, { id, reference, staffId }) {
  const n = await dbs.payment('payouts').where({ id, status: 'PENDING' }).update({ status: 'PAID', reference, closed_by: staffId, closed_at: new Date() });
  if (!n) throw new AppError(409, 'NOT_OPEN', 'Only an open statement can be marked paid');
}

/** Drops an open statement; its orders and fines become payable again. */
export async function cancelPayout(dbs, { id, reason, staffId }) {
  await dbs.payment.transaction(async (trx) => {
    const n = await trx('payouts').where({ id, status: 'PENDING' }).update({ status: 'CANCELLED', cancel_reason: reason, closed_by: staffId, closed_at: new Date() });
    if (!n) throw new AppError(409, 'NOT_OPEN', 'Only an open statement can be cancelled');
    await trx('payout_lines').where({ payout_id: id }).delete();
  });
}

const ms = (d) => (d ? new Date(d).getTime() : null);

export const payoutView = (p) => ({
  id: p.id,
  sellerId: p.seller_id,
  status: p.status,
  commissionPct: Number(p.commission_pct),
  ordersCount: p.orders_count,
  grossPaise: p.gross_paise,
  commissionPaise: p.commission_paise,
  finesPaise: p.fines_paise,
  returnedPaise: p.returned_paise,
  netPaise: p.net_paise,
  firstDeliveredAt: ms(p.first_delivered_at),
  lastDeliveredAt: ms(p.last_delivered_at),
  reference: p.reference,
  cancelReason: p.cancel_reason,
  createdAt: ms(p.created_at),
  closedAt: ms(p.closed_at),
});
