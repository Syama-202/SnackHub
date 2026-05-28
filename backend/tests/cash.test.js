// Cash in hand: what a rider holds after pay-on-delivery orders, deposits recorded by staff
// (never more than held, append only, reversible once), and the limit above which a rider
// gets no new cash orders.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHarness, beginTest } from './helpers/app.js';
import { staffToken, admin } from './helpers/onboarding.js';
import { ER, expectError } from './helpers/db.js';
import { runOrderTimers } from '../src/jobs/orderTimers.js';
import * as H from './helpers/orders.js';

const h = await openHarness();
if (h.skip) console.warn(`cash tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

describe.skipIf(h.skip)('cash in hand', () => {
  let t;
  let staff;
  beforeEach(async () => {
    t = await beginTest(h);
    staff = await staffToken(t, 'reviewer');
  });
  afterEach(() => t.end());

  it('a rider holds the cash they collected; staff record deposits, never more than held, and can reverse one once', async () => {
    const { rider, order } = await H.deliveredOrder(t, staff);
    const mine = (await rider.api.get('/rider/cash').expect(200)).body;
    expect(mine).toMatchObject({ heldPaise: order.totalPaise, collectedPaise: order.totalPaise, depositedPaise: 0, limitPaise: 200000, overLimit: false, collections: [{ orderId: order.id, collectedPaise: order.totalPaise }], deposits: [] });

    const boss = await staffToken(t, 'admin');
    const a = admin(t, boss.token);
    const board = (await a.get('/cash').expect(200)).body;
    expect(board.riders.find((r) => r.riderId === rider.row.id)).toMatchObject({ heldPaise: order.totalPaise, overLimit: false });

    // more than held is refused; a reviewer may not record cash at all
    expect((await a.post('/cash/deposits', { riderId: rider.row.id, amountPaise: order.totalPaise + 100 }).expect(409)).body.error.code).toBe('MORE_THAN_HELD');
    await admin(t, staff.token).post('/cash/deposits', { riderId: rider.row.id, amountPaise: 100 }).expect(403);
    await a.post('/cash/deposits', { riderId: rider.row.id, amountPaise: 50 }).expect(400); // under Rs 1
    await a.post('/cash/deposits', { riderId: rider.row.id, amountPaise: 1000, riderName: 'x' }).expect(400);

    const dep = (await a.post('/cash/deposits', { riderId: rider.row.id, amountPaise: 1000, note: 'Handed in at the hub' }).expect(201)).body;
    expect(dep.heldPaise).toBe(order.totalPaise - 1000);
    expect((await rider.api.get('/rider/cash').expect(200)).body).toMatchObject({ heldPaise: order.totalPaise - 1000, deposits: [{ id: dep.id, kind: 'DEPOSIT', amountPaise: 1000, reversed: false }] });
    const inbox = await t.trx.ordering('outbox').where('dedupe_key', 'like', `inbox:null:delivery.cash_deposit.${dep.id}:%`).first();
    expect(inbox).toBeTruthy();

    await a.post(`/cash/deposits/${dep.id}/reverse`, { reason: 'Recorded on the wrong rider' }).expect(201);
    await a.post(`/cash/deposits/${dep.id}/reverse`, { reason: 'Again' }).expect(409);
    expect((await rider.api.get('/rider/cash').expect(200)).body).toMatchObject({ heldPaise: order.totalPaise, deposits: [{ kind: 'REVERSAL' }, { kind: 'DEPOSIT', reversed: true }] });

    // the table cannot be edited or emptied, for anyone
    await expectError(t.trx.dispatch('cash_deposits').where({ id: dep.id }).update({ amount_paise: 1 }), ER.SIGNAL);
    await expectError(t.trx.dispatch('cash_deposits').where({ id: dep.id }).del(), ER.SIGNAL);
    const audit = await t.trx.identity('audit_log').whereIn('action', ['cash.deposit', 'cash.reverse']).orderBy('id');
    expect(audit.map((r) => r.action)).toEqual(['cash.deposit', 'cash.reverse']);
  });

  it('a rider at the cash limit gets no new cash orders until they hand it in', async () => {
    const { shop, rider, order } = await H.deliveredOrder(t, staff, { stock: 6 });
    const boss = await staffToken(t, 'admin');
    const a = admin(t, boss.token);
    // a limit just under what the rider now holds
    await a.put('/policy', { cashLimitPaise: Math.max(10_000, order.totalPaise - 1000) }).expect(200);
    if (order.totalPaise < 10_000) await t.trx.ordering('orders').where({ id: order.id }).update({ collected_paise: 12_000 });
    expect((await rider.api.get('/rider/cash').expect(200)).body.overLimit).toBe(true);

    const c = await H.customerAt(t);
    const next = await H.placeOrder(c, shop, 1);
    await shop.api.post(`/seller/orders/${next.id}/accept`).expect(200);
    expect((await rider.api.get('/rider/offers').expect(200)).body).toEqual([]);

    // the rider hands everything in: the next pass offers the order
    const held = (await rider.api.get('/rider/cash').expect(200)).body.heldPaise;
    await a.post('/cash/deposits', { riderId: rider.row.id, amountPaise: held }).expect(201);
    await runOrderTimers({ dbs: t.trx });
    const [offer] = (await rider.api.get('/rider/offers').expect(200)).body;
    expect(offer).toMatchObject({ orderId: next.id });
  });
});
