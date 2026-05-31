// Seller payouts (doc 8.5):
//   GET  /admin/payouts                  shops with money due or an open statement, and recent statements
//   GET  /admin/payouts/:id              one statement with its lines
//   POST /admin/payouts                  { sellerId } draft a statement of everything payable
//   POST /admin/payouts/:id/paid         { reference } the bank transfer was made
//   POST /admin/payouts/:id/cancel       { reason } drop it; its orders become payable again
//   GET  /seller/payouts                 the shop's own: what is due next and past statements
// Bank account numbers are never shown in full: holder, IFSC and the last four digits.
import { AppError } from '../utils/AppError.js';
import { currentPolicy, inbox } from '../utils/orders.js';
import { realtime } from '../utils/realtime.js';
import { cancelPayout, commissionPctOf, draftPayout, holdHoursOf, markPaid, payableFor, payoutView } from '../utils/payouts.js';
import { sellerModel } from '../models/catalog/seller.js';
import { sellerBusinessModel } from '../models/catalog/sellerBusiness.js';
import { auditLogModel } from '../models/identity/auditLog.js';

const rupees = (p) => `Rs ${(p / 100).toFixed(2)}`;
const dueView = (d) => ({ netPaise: d.netPaise, grossPaise: d.grossPaise, commissionPaise: d.commissionPaise, finesPaise: d.finesPaise, returnedPaise: d.returnedPaise, ordersCount: d.ordersCount, waitingCount: d.waitingCount, waitingGrossPaise: d.waitingGrossPaise, nextPayableAt: d.nextPayableAt });

export function payoutsController({ dbs }) {
  const policy = async () => (await currentPolicy(dbs)).config;
  const bankOf = async (seller) => {
    const b = seller ? await sellerBusinessModel.find(dbs.catalog, seller.user_id) : null;
    return b?.bankAccountLast4 ? { holder: b.bankHolder, ifsc: b.bankIfsc, last4: b.bankAccountLast4 } : null;
  };

  async function overview(req, res) {
    const pol = await policy();
    const ids = (await dbs.ordering('orders').where({ status: 'DELIVERED' }).distinct('seller_id').pluck('seller_id')).map(Number);
    const open = await dbs.payment('payouts').where({ status: 'PENDING' }).select('id', 'seller_id');
    const openBy = new Map(open.map((p) => [Number(p.seller_id), p.id]));
    const sellers = await sellerModel.listByIds(dbs.catalog, ids);
    const rows = [];
    for (const s of sellers) {
      const due = await payableFor(dbs, s.id, pol);
      if (due.netPaise <= 0 && !due.waitingCount && !openBy.has(s.id)) continue;
      rows.push({ sellerId: s.id, shopName: s.shop_name, demo: Boolean(s.is_demo), due: dueView(due), openPayoutId: openBy.get(s.id) ?? null, bank: await bankOf(s) });
    }
    const recent = await dbs.payment('payouts').orderBy('id', 'desc').limit(50);
    const names = new Map((await sellerModel.listByIds(dbs.catalog, [...new Set(recent.map((p) => Number(p.seller_id)))])).map((s) => [s.id, s.shop_name]));
    res.json({
      commissionPct: commissionPctOf(pol),
      holdHours: holdHoursOf(pol),
      sellers: rows.sort((a, b) => b.due.netPaise - a.due.netPaise),
      payouts: recent.map((p) => ({ ...payoutView(p), shopName: names.get(Number(p.seller_id)) ?? null })),
    });
  }

  async function show(req, res) {
    const p = await dbs.payment('payouts').where({ id: req.params.id }).first();
    if (!p) throw new AppError(404, 'NOT_FOUND', 'Statement not found');
    const lines = await dbs.payment('payout_lines').where({ payout_id: p.id }).orderBy('kind').orderBy('ref_id');
    const seller = await sellerModel.findById(dbs.catalog, p.seller_id);
    res.json({ ...payoutView(p), shopName: seller?.shop_name ?? null, bank: await bankOf(seller), lines: lines.map((l) => ({ kind: l.kind, refId: Number(l.ref_id), grossPaise: l.gross_paise, commissionPaise: l.commission_paise, amountPaise: l.amount_paise })) });
  }

  async function draft(req, res) {
    const staffId = req.user.userId;
    const seller = await sellerModel.findById(dbs.catalog, req.body.sellerId);
    if (!seller) throw new AppError(404, 'NOT_FOUND', 'Shop not found');
    const id = await draftPayout(dbs, { sellerId: seller.id, staffId, policy: await policy() });
    const p = await dbs.payment('payouts').where({ id }).first();
    await auditLogModel.append(dbs.identity, { actorId: staffId, action: 'payout.draft', target: `payout:${id}`, before: null, after: { sellerId: seller.id, netPaise: p.net_paise, orders: p.orders_count } });
    res.status(201).json(payoutView(p));
  }

  async function paid(req, res) {
    const staffId = req.user.userId;
    await markPaid(dbs, { id: req.params.id, reference: req.body.reference, staffId });
    const p = await dbs.payment('payouts').where({ id: req.params.id }).first();
    const seller = await sellerModel.findById(dbs.catalog, p.seller_id);
    await auditLogModel.append(dbs.identity, { actorId: staffId, action: 'payout.paid', target: `payout:${p.id}`, before: { status: 'PENDING' }, after: { status: 'PAID', reference: p.reference, netPaise: p.net_paise } });
    if (seller) await dbs.ordering.transaction((trx) => inbox(trx, { userId: seller.user_id, orderId: null, type: `shop.payout.${p.id}`, body: `Payout of ${rupees(p.net_paise)} for ${p.orders_count} orders sent to your bank. Reference ${p.reference}.` }));
    realtime.publish([{ userId: seller?.user_id, role: 'seller' }], 'shop', {});
    res.json(payoutView(p));
  }

  async function cancel(req, res) {
    const staffId = req.user.userId;
    await cancelPayout(dbs, { id: req.params.id, reason: req.body.reason, staffId });
    const p = await dbs.payment('payouts').where({ id: req.params.id }).first();
    await auditLogModel.append(dbs.identity, { actorId: staffId, action: 'payout.cancel', target: `payout:${p.id}`, before: { status: 'PENDING' }, after: { status: 'CANCELLED', reason: req.body.reason } });
    res.json(payoutView(p));
  }

  async function mine(req, res) {
    const seller = await sellerModel.findByUser(dbs.catalog, req.user.userId);
    if (!seller) throw new AppError(404, 'NOT_FOUND', 'Shop not found');
    const pol = await policy();
    const list = await dbs.payment('payouts').where({ seller_id: seller.id }).whereNot({ status: 'CANCELLED' }).orderBy('id', 'desc').limit(30);
    res.json({ commissionPct: commissionPctOf(pol), holdHours: holdHoursOf(pol), due: dueView(await payableFor(dbs, seller.id, pol)), bank: await bankOf(seller), payouts: list.map(payoutView) });
  }

  return { overview, show, draft, paid, cancel, mine };
}
