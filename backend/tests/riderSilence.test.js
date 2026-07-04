// A rider who holds an order but has sent no position for 5 minutes: staff get one alert and
// the live board marks the order. The customer's note to the shop is checked here too.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHarness, beginTest } from './helpers/app.js';
import { staffToken, admin } from './helpers/onboarding.js';
import * as H from './helpers/orders.js';
import { runOrderTimers } from '../src/jobs/orderTimers.js';
import { riderSilent } from '../../shared/domain/riderSilence.js';

const h = await openHarness();
if (h.skip) console.warn(`rider silence tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

describe('the rule', () => {
  const now = Date.now();
  it('counts only a rider who holds the order and should be moving', () => {
    expect(riderSilent({ status: 'ON_THE_WAY', hasRider: true, lastSeenAt: now - 6 * 60_000, now })).toBe(true);
    expect(riderSilent({ status: 'ON_THE_WAY', hasRider: true, lastSeenAt: now - 4 * 60_000, now })).toBe(false);
    expect(riderSilent({ status: 'PACKED', hasRider: true, lastSeenAt: null, now })).toBe(true);
    expect(riderSilent({ status: 'PACKED', hasRider: false, lastSeenAt: null, now })).toBe(false);
    expect(riderSilent({ status: 'ARRIVED', hasRider: true, lastSeenAt: now - 20 * 60_000, now })).toBe(false);
    expect(riderSilent({ status: 'DELIVERED', hasRider: true, lastSeenAt: now - 20 * 60_000, now })).toBe(false);
  });
});

describe.skipIf(h.skip)('on a live order', () => {
  let t;
  let staff;
  let boss;
  beforeEach(async () => {
    t = await beginTest(h);
    staff = await staffToken(t, 'reviewer');
    boss = await staffToken(t, 'admin');
  });
  afterEach(() => t.end());

  it('alerts staff once and marks the order on the live board', async () => {
    const s = await H.openShop(t, staff);
    const c = await H.customerAt(t);
    const order = await H.placeOrder(c, s);
    const r = await H.onlineRider(t, staff);
    await s.api.post(`/seller/orders/${order.id}/accept`).expect(200);
    const [offer] = (await r.api.get('/rider/offers').expect(200)).body;
    await r.api.post(`/rider/offers/${offer.id}/accept`).expect(200);

    const alerts = () => t.trx.ordering('outbox').where({ type: 'admin.alert', dedupe_key: `rider-silent:${order.id}` });
    const onBoard = async () => (await admin(t, boss.token).get('/orders').expect(200)).body.find((o) => o.id === order.id);
    // the rider is sending positions: nothing happens
    await runOrderTimers({ dbs: t.trx });
    expect(await alerts()).toHaveLength(0);
    expect((await onBoard()).riderSilent).toBe(false);

    await t.trx.dispatch('riders').where({ id: (await t.trx.ordering('orders').where({ id: order.id }).first('rider_id')).rider_id }).update({ last_seen_at: new Date(Date.now() - 6 * 60_000) });
    expect((await runOrderTimers({ dbs: t.trx })).silentRiders).toBeGreaterThanOrEqual(1);
    expect(await alerts()).toHaveLength(1);
    expect((await onBoard()).riderSilent).toBe(true);
    // the next run does not alert again
    await runOrderTimers({ dbs: t.trx });
    expect(await alerts()).toHaveLength(1);
  });

  it('carries the customer’s note to the shop and staff, never to the rider', async () => {
    const s = await H.openShop(t, staff);
    const c = await H.customerAt(t);
    await c.api.put('/cart', { productId: s.product.id, qty: 1 }).expect(200);
    await c.api.post('/orders', { addressId: c.address.id, paymentMode: 'COD', note: '<b>hi</b>' }, { 'Idempotency-Key': H.key() }).expect(400);
    await c.api.post('/orders', { addressId: c.address.id, paymentMode: 'COD', note: 'x'.repeat(201) }, { 'Idempotency-Key': H.key() }).expect(400);
    const order = (await c.api.post('/orders', { addressId: c.address.id, paymentMode: 'COD', note: '  Less spicy, no onion  ' }, { 'Idempotency-Key': H.key() }).expect(201)).body.order;
    expect(order.note).toBe('Less spicy, no onion');
    expect((await s.api.get('/seller/orders').expect(200)).body.find((o) => o.id === order.id).note).toBe('Less spicy, no onion');
    expect((await admin(t, boss.token).get('/orders').expect(200)).body.find((o) => o.id === order.id).note).toBe('Less spicy, no onion');

    const r = await H.onlineRider(t, staff);
    await s.api.post(`/seller/orders/${order.id}/accept`).expect(200);
    const [offer] = (await r.api.get('/rider/offers').expect(200)).body;
    await r.api.post(`/rider/offers/${offer.id}/accept`).expect(200);
    expect(JSON.stringify((await r.api.get('/rider/active').expect(200)).body)).not.toContain('Less spicy');
  });
});
