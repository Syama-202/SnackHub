// Seller payouts: the statement rules, the 24-hour hold, commission and fines, one open
// statement per shop, every order and fine paid or deducted once, paying with a bank
// reference, cancelling (the orders become payable again) and fines given back after a reversal.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHarness, beginTest } from './helpers/app.js';
import { staffToken, admin } from './helpers/onboarding.js';
import { ER, expectError } from './helpers/db.js';
import { commissionOn, statement } from '../../shared/domain/payouts.js';
import * as H from './helpers/orders.js';

const h = await openHarness();
if (h.skip) console.warn(`payout tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

describe('payout statement rules', () => {
  it('takes commission per order, deducts fines and gives back reversed ones', () => {
    expect(commissionOn(12345, 10)).toBe(1235); // half up, per order
    const s = statement({ orders: [{ id: 1, subtotalPaise: 12000 }, { id: 2, subtotalPaise: 4500 }], fines: [{ id: 9, amountPaise: 1000 }], returned: [{ id: 7, amountPaise: 500 }] }, 10);
    expect(s).toMatchObject({ grossPaise: 16500, commissionPaise: 1650, finesPaise: 1000, returnedPaise: 500, netPaise: 14350 });
    expect(s.lines.map((l) => l.kind)).toEqual(['ORDER', 'ORDER', 'FINE', 'FINE_RETURNED']);
  });
});

describe.skipIf(h.skip)('seller payouts', () => {
  let t;
  let staff;
  beforeEach(async () => {
    t = await beginTest(h);
    staff = await staffToken(t, 'reviewer');
  });
  afterEach(() => t.end());

  /** A delivered order whose complaint window has passed. */
  async function payableOrder() {
    const d = await H.deliveredOrder(t, staff);
    await t.trx.ordering('orders').where({ id: d.order.id }).update({ delivered_at: new Date(Date.now() - 25 * 3_600_000) });
    return d;
  }
  const fine = async (order, sellerId, amount, status = 'APPLIED') => {
    const [{ id }] = await t.trx.ordering('fines').insert({ order_id: order.id, target_type: 'SELLER', target_id: sellerId, reason: 'Missing item (test)', amount_paise: amount, status, created_at: new Date() }).returning('id');
    return id;
  };

  it('holds new orders for the complaint window, then pays food value less commission and fines, once', async () => {
    const d = await H.deliveredOrder(t, staff);
    const boss = await staffToken(t, 'admin');
    const a = admin(t, boss.token);
    const sellerId = d.shop.shop.id;

    // just delivered: waiting, nothing payable yet
    let mine = (await d.shop.api.get('/seller/payouts').expect(200)).body;
    expect(mine).toMatchObject({ commissionPct: 10, holdHours: 24, due: { netPaise: 0, ordersCount: 0, waitingCount: 1, waitingGrossPaise: d.order.subtotalPaise } });
    expect(mine.due.nextPayableAt).toBeGreaterThan(Date.now());
    expect((await a.post('/payouts', { sellerId }).expect(409)).body.error.code).toBe('NOTHING_TO_PAY');

    await t.trx.ordering('orders').where({ id: d.order.id }).update({ delivered_at: new Date(Date.now() - 25 * 3_600_000) });
    await fine(d.order, sellerId, 1000);
    const commission = commissionOn(d.order.subtotalPaise, 10);
    const net = d.order.subtotalPaise - commission - 1000;
    const board = (await a.get('/payouts').expect(200)).body;
    expect(board.sellers.find((s) => s.sellerId === sellerId)).toMatchObject({ due: { netPaise: net, ordersCount: 1, finesPaise: 1000 }, openPayoutId: null });

    // a reviewer cannot touch payouts; a seller cannot reach the admin side
    await admin(t, staff.token).get('/payouts').expect(403);
    await H.api(t, d.shop.token).get('/admin/payouts').expect(404); // the admin side does not exist off the admin host

    const draft = (await a.post('/payouts', { sellerId }).expect(201)).body;
    expect(draft).toMatchObject({ status: 'PENDING', ordersCount: 1, grossPaise: d.order.subtotalPaise, commissionPaise: commission, finesPaise: 1000, netPaise: net, commissionPct: 10 });
    expect((await a.post('/payouts', { sellerId }).expect(409)).body.error.code).toBe('PAYOUT_OPEN');
    const detail = (await a.get(`/payouts/${draft.id}`).expect(200)).body;
    // orders first, then fines (the order the kinds are declared in)
    expect(detail.lines).toEqual([
      { kind: 'ORDER', refId: d.order.id, grossPaise: d.order.subtotalPaise, commissionPaise: commission, amountPaise: 0 },
      { kind: 'FINE', refId: expect.any(Number), grossPaise: 0, commissionPaise: 0, amountPaise: 1000 },
    ]);
    // the database itself refuses the same order on a second statement
    await expectError(t.trx.payment('payout_lines').insert({ payout_id: draft.id, kind: 'ORDER', ref_id: d.order.id }), ER.DUP_ENTRY);

    await a.post(`/payouts/${draft.id}/paid`, { reference: 'not a ref!' }).expect(400);
    const done = (await a.post(`/payouts/${draft.id}/paid`, { reference: 'UTR123456789' }).expect(200)).body;
    expect(done).toMatchObject({ status: 'PAID', reference: 'UTR123456789' });
    await a.post(`/payouts/${draft.id}/paid`, { reference: 'UTR999999999' }).expect(409);
    mine = (await d.shop.api.get('/seller/payouts').expect(200)).body;
    expect(mine).toMatchObject({ due: { netPaise: 0, ordersCount: 0 }, payouts: [{ id: draft.id, status: 'PAID', netPaise: net }] });
    expect(await t.trx.ordering('outbox').where('dedupe_key', 'like', `inbox:null:shop.payout.${draft.id}:%`).first()).toBeTruthy();
    const audit = await t.trx.identity('audit_log').where('target', `payout:${draft.id}`).orderBy('id').pluck('action');
    expect(audit).toEqual(['payout.draft', 'payout.paid']);
  });

  it('a cancelled statement frees its orders; a fine reversed after payment is given back on the next one', async () => {
    const d = await payableOrder();
    const sellerId = d.shop.shop.id;
    const fineId = await fine(d.order, sellerId, 1500);
    const a = admin(t, (await staffToken(t, 'admin')).token);

    const first = (await a.post('/payouts', { sellerId }).expect(201)).body;
    await a.post(`/payouts/${first.id}/cancel`, { reason: 'Bank details being checked' }).expect(200);
    expect(await t.trx.payment('payout_lines').where({ payout_id: first.id }).count({ n: '*' }).then(([r]) => Number(r.n))).toBe(0);
    await a.post(`/payouts/${first.id}/paid`, { reference: 'UTR000000001' }).expect(409);

    const second = (await a.post('/payouts', { sellerId }).expect(201)).body;
    expect(second).toMatchObject({ ordersCount: 1, finesPaise: 1500 });
    await a.post(`/payouts/${second.id}/paid`, { reference: 'UTR000000002' }).expect(200);

    // the fine is reversed after it was deducted: the next statement gives it back
    await t.trx.ordering('fines').where({ id: fineId }).update({ status: 'REVERSED' });
    const third = (await a.post('/payouts', { sellerId }).expect(201)).body;
    expect(third).toMatchObject({ ordersCount: 0, grossPaise: 0, returnedPaise: 1500, netPaise: 1500 });
    await a.post(`/payouts/${third.id}/paid`, { reference: 'UTR000000003' }).expect(200);
    expect((await a.post('/payouts', { sellerId }).expect(409)).body.error.code).toBe('NOTHING_TO_PAY');
  });
});
