// Cash in hand (doc 8.5, 10.9). A rider's cash in hand is the pay-on-delivery cash they
// recorded at the door on delivered orders, minus what they handed in (dispatch.cash_deposits,
// append only; a reversal cancels one deposit). Above the policy's limit a rider gets no new
// pay-on-delivery offers until they deposit; prepaid orders still reach them.
import { AppError } from './AppError.js';
import { DEFAULT_POLICY } from '../../../shared/domain/policy.js';

export const cashLimitOf = (policy) => policy?.cashLimitPaise ?? DEFAULT_POLICY.cashLimitPaise;

const sums = (rows, key = 'rider_id') => new Map(rows.map((r) => [Number(r[key]), Number(r.total ?? 0)]));

/** { collected, deposited, held } in paise for each rider id. */
export async function cashInHand(dbs, riderIds) {
  const out = new Map(riderIds.map((id) => [id, { collected: 0, deposited: 0, held: 0 }]));
  if (!riderIds.length) return out;
  const [collected, deposits] = await Promise.all([
    dbs.ordering('orders').whereIn('rider_id', riderIds).where({ payment_mode: 'COD', status: 'DELIVERED' }).whereNotNull('collected_paise').groupBy('rider_id').select('rider_id', dbs.ordering.raw('SUM(collected_paise) AS total')),
    dbs.dispatch('cash_deposits').whereIn('rider_id', riderIds).groupBy('rider_id').select('rider_id', dbs.dispatch.raw("SUM(CASE kind WHEN 'DEPOSIT' THEN amount_paise ELSE -amount_paise END) AS total")),
  ]);
  const c = sums(collected);
  const d = sums(deposits);
  for (const id of riderIds) {
    const row = { collected: c.get(id) ?? 0, deposited: d.get(id) ?? 0 };
    out.set(id, { ...row, held: row.collected - row.deposited });
  }
  return out;
}

const depositView = (r) => ({ id: r.id, kind: r.kind, amountPaise: r.amount_paise, reversesId: r.reverses_id, note: r.note, at: new Date(r.created_at).getTime(), reversed: Boolean(r.reversed) });

/** The deposits of one rider, newest first, with whether each was reversed. */
export async function listDeposits(dbs, riderId, limit = 30) {
  const rows = await dbs.dispatch('cash_deposits as d')
    .leftJoin('cash_deposits as r', 'r.reverses_id', 'd.id')
    .where('d.rider_id', riderId)
    .orderBy('d.id', 'desc')
    .limit(limit)
    .select('d.*', dbs.dispatch.raw('r.id IS NOT NULL AS reversed'));
  return rows.map(depositView);
}

/**
 * Records cash a rider handed in. The rider's row is locked while the deposits are summed, so
 * two staff recording at once can never take the balance below zero.
 */
export async function recordDeposit(dbs, { riderId, amountPaise, note, staffId }) {
  return dbs.dispatch.transaction(async (trx) => {
    const rider = await trx('riders').where({ id: riderId }).forUpdate().first('id');
    if (!rider) throw new AppError(404, 'NOT_FOUND', 'Rider not found');
    const [{ collected }] = await dbs.ordering('orders').where({ rider_id: riderId, payment_mode: 'COD', status: 'DELIVERED' }).whereNotNull('collected_paise').sum({ collected: 'collected_paise' });
    const [{ deposited }] = await trx('cash_deposits').where({ rider_id: riderId }).select(trx.raw("COALESCE(SUM(CASE kind WHEN 'DEPOSIT' THEN amount_paise ELSE -amount_paise END), 0) AS deposited"));
    const held = Number(collected ?? 0) - Number(deposited);
    if (amountPaise > held) throw new AppError(409, 'MORE_THAN_HELD', `This rider holds ${held} paise; a deposit cannot be more than that`, { heldPaise: held });
    const [id] = await trx('cash_deposits').insert({ rider_id: riderId, kind: 'DEPOSIT', amount_paise: amountPaise, received_by: staffId, note: note ?? null });
    return { id, heldBefore: held, heldAfter: held - amountPaise };
  });
}

/** Cancels a deposit recorded by mistake, once. */
export async function reverseDeposit(dbs, { depositId, staffId, note }) {
  return dbs.dispatch.transaction(async (trx) => {
    const d = await trx('cash_deposits').where({ id: depositId, kind: 'DEPOSIT' }).forUpdate().first();
    if (!d) throw new AppError(404, 'NOT_FOUND', 'Deposit not found');
    try {
      const [id] = await trx('cash_deposits').insert({ rider_id: d.rider_id, kind: 'REVERSAL', amount_paise: d.amount_paise, reverses_id: d.id, received_by: staffId, note });
      return { id, deposit: d };
    } catch (err) {
      if (err.errno === 1062) throw new AppError(409, 'ALREADY_REVERSED', 'This deposit was already reversed');
      throw err;
    }
  });
}
