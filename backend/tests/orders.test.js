// The customer order flow end to end on PostgreSQL: a real approved shop and rider, the cart,
// pay-on-delivery checkout, the seller's board, rider offers, GPS pings, the delivery code
// and the clocks. Times are moved in the database instead of waiting.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHarness, beginTest } from './helpers/app.js';
import { readySeller, staffToken } from './helpers/onboarding.js';
import * as H from './helpers/orders.js';

const { SHOP, HOME, api, key, lerp, placeOrder } = H;
import { runOrderTimers } from '../src/jobs/orderTimers.js';

const h = await openHarness();
if (h.skip) console.warn(`order tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

// the shop in the onboarding helper stands at 16.3001, 80.4501 (Guntur), radius 3 km

describe.skipIf(h.skip)('the order flow', () => {
  let t;
  let staff;
  beforeEach(async () => {
    t = await beginTest(h);
    staff = await staffToken(t, 'reviewer');
  });
  afterEach(() => t.end());
  const openShop = (o) => H.openShop(t, staff, o);
  const onlineRider = (at) => H.onlineRider(t, staff, at);
  const ping = (rider, at, seconds) => H.ping(t, rider, at, seconds);
  const customerAt = (point) => H.customerAt(t, point);

  /** An approved shop with one listed snack and stock. */

  const stockOf = async (productId) => (await t.trx.catalog('stock').where({ product_id: productId }).first()).qty;
  const orderRow = (id) => t.trx.ordering('orders').where({ id }).first();

  describe('cart and checkout', () => {
    it('keeps one shop per cart, refuses demo shops, and re-prices from the catalogue', async () => {
      const a = await openShop();
      const b = await openShop();
      const c = await customerAt();
      const cart = (await c.api.put('/cart', { productId: a.product.id, qty: 2 }).expect(200)).body;
      expect(cart).toMatchObject({ sellerId: a.shop.id, subtotalPaise: 12000, items: [{ productId: a.product.id, qty: 2, pricePaise: 6000 }] });
      const other = await c.api.put('/cart', { productId: b.product.id, qty: 1 }).expect(409);
      expect(other.body.error).toMatchObject({ code: 'CART_OTHER_SELLER', details: { currentSellerId: a.shop.id } });
      expect((await c.api.put('/cart', { productId: b.product.id, qty: 1, replace: true }).expect(200)).body.sellerId).toBe(b.shop.id);

      // a seeded shop shows how SnackHub works but takes no real order
      await t.trx.catalog('sellers').where({ id: a.shop.id }).update({ is_demo: true });
      expect((await c.api.put('/cart', { productId: a.product.id, qty: 1, replace: true }).expect(409)).body.error).toMatchObject({ code: 'NOT_TAKING_ORDERS', message: expect.stringMatching(/isn't taking orders on SnackHub yet/) });

      // the price changes after it went in the cart: the quote and the order use the new one
      await b.api.patch(`/seller/products/${b.product.id}`, { pricePaise: 7000 }).expect(200);
      const quote = (await c.api.post('/orders/quote', { addressId: c.address.id }).expect(200)).body;
      expect(quote).toMatchObject({ subtotalPaise: 7000, paymentModes: ['COD'], promise: { serviceable: true } });
      // a total or a price in the body is refused outright
      await c.api.post('/orders', { addressId: c.address.id, paymentMode: 'COD', totalPaise: 1 }, { 'Idempotency-Key': key() }).expect(400);
      const { order } = (await c.api.post('/orders', { addressId: c.address.id, paymentMode: 'COD' }, { 'Idempotency-Key': key() }).expect(201)).body;
      expect(order).toMatchObject({ status: 'PLACED', subtotalPaise: 7000, deliveryFeePaise: quote.deliveryFeePaise, totalPaise: 7000 + quote.deliveryFeePaise, paymentStatus: 'COD_PENDING' });
      expect(JSON.stringify(order)).not.toMatch(/otp_?hash|idem_?key|order_?key/i);
      expect((await c.api.get('/cart').expect(200)).body.items).toEqual([]);
    });

    it('one tap is one order: a retry with the same key replays it and takes stock once', async () => {
      const s = await openShop({ stock: 5 });
      const c = await customerAt();
      await c.api.put('/cart', { productId: s.product.id, qty: 2 }).expect(200);
      const k = key();
      const first = await c.api.post('/orders', { addressId: c.address.id }, { 'Idempotency-Key': k }).expect(201);
      const again = await c.api.post('/orders', { addressId: c.address.id }, { 'Idempotency-Key': k }).expect(200);
      expect(again.body).toMatchObject({ replayed: true, order: { id: first.body.order.id } });
      expect(await stockOf(s.product.id)).toBe(3);
      await c.api.post('/orders', { addressId: c.address.id }).expect(400);
    });

    it('for the last unit exactly one of two buyers wins, and nobody is charged for the other', async () => {
      const s = await openShop({ stock: 1 });
      const [x, y] = [await customerAt(), await customerAt()];
      await x.api.put('/cart', { productId: s.product.id, qty: 1 }).expect(200);
      await y.api.put('/cart', { productId: s.product.id, qty: 1 }).expect(200);
      await x.api.post('/orders', { addressId: x.address.id }, { 'Idempotency-Key': key() }).expect(201);
      const lost = await y.api.post('/orders', { addressId: y.address.id }, { 'Idempotency-Key': key() }).expect(409);
      expect(lost.body.error).toMatchObject({ code: 'OUT_OF_STOCK', details: { available: 0 } });
      expect(await stockOf(s.product.id)).toBe(0);
      expect(await t.trx.ordering('orders').where({ customer_id: y.user.id }).first()).toBeUndefined();
    });

    it('refuses an address that is out of range, someone else’s address and online payment', async () => {
      const s = await openShop();
      const c = await customerAt({ lat: 16.5101, lng: 80.6431 }); // Vijayawada, about 30 km away
      await c.api.put('/cart', { productId: s.product.id, qty: 1 }).expect(200);
      expect((await c.api.post('/orders', { addressId: c.address.id }, { 'Idempotency-Key': key() }).expect(409)).body.error.code).toBe('NOT_SERVICEABLE');
      const near = await customerAt();
      expect((await c.api.post('/orders/quote', { addressId: near.address.id }).expect(422)).body.error.code).toBe('ADDRESS_REQUIRED');
      expect((await c.api.post('/orders', { addressId: c.address.id, paymentMode: 'ONLINE' }, { 'Idempotency-Key': key() }).expect(409)).body.error.code).toBe('ONLINE_PAYMENT_UNAVAILABLE');
    });
  });

  describe('ownership', () => {
    it('nobody reaches an order, a shop board or a delivery that is not theirs', async () => {
      const s = await openShop();
      const other = await openShop();
      const c = await customerAt();
      const order = await placeOrder(c, s);
      const stranger = await customerAt();
      await stranger.api.get(`/orders/${order.id}`).expect(404);
      await stranger.api.get(`/orders/${order.id}/track`).expect(404);
      await stranger.api.post(`/orders/${order.id}/cancel`).expect(404);
      await other.api.post(`/seller/orders/${order.id}/accept`).expect(404);
      expect((await other.api.get('/seller/orders').expect(200)).body).toEqual([]);
      await stranger.api.del(`/me/addresses/${c.address.id}`).expect(404);

      await s.api.post(`/seller/orders/${order.id}/accept`).expect(200);
      const intruder = await onlineRider();
      await intruder.api.post(`/rider/orders/${order.id}/picked-up`, { sealed: true }).expect(404);
      // the seller's view of an order has no drop point and no customer address
      const board = (await s.api.get('/seller/orders').expect(200)).body[0];
      expect(board).not.toHaveProperty('drop');
      expect(board).not.toHaveProperty('addressText');
    });
  });

  describe('inboxes', () => {
    it('one person with three roles sees only the messages of each portal there, and reading one portal leaves the others unread', async () => {
      const u = await t.makeUser({ roles: ['customer', 'seller', 'rider'], mfa: true });
      const at = new Date();
      await t.trx.notify('notifications').insert([
        { user_id: u.id, order_id: null, type: 'order.accepted', body: 'Your order was accepted (demo)', created_at: at },
        { user_id: u.id, order_id: null, type: 'shop.order_new', body: 'New order (demo)', created_at: at },
        { user_id: u.id, order_id: null, type: 'delivery.cancelled', body: 'Order cancelled (demo)', created_at: at },
      ]);
      const as = (role) => H.api(t, t.tokenFor(u, role));
      const typesFor = async (role) => (await as(role).get('/me/notifications').expect(200)).body.map((n) => n.type);
      expect(await typesFor('customer')).toEqual(['order.accepted']);
      expect(await typesFor('seller')).toEqual(['shop.order_new']);
      expect(await typesFor('rider')).toEqual(['delivery.cancelled']);

      await as('seller').post('/me/notifications/read').expect(200);
      const unread = async (role) => (await as(role).get('/me/notifications').expect(200)).body.filter((n) => !n.readAt).length;
      expect([await unread('customer'), await unread('seller'), await unread('rider')]).toEqual([1, 0, 1]);
    });
  });

  describe('the shop, the rider and the door', () => {
    it('runs from order to delivery, with the code shown only inside 500 m and entered at the door', async () => {
      const s = await openShop({ stock: 4 });
      const c = await customerAt();
      const order = await placeOrder(c, s, 2);
      expect(await stockOf(s.product.id)).toBe(2);
      // the shop hears about it in its own inbox, not the customer's
      await t.inbox();
      expect((await s.api.get('/me/notifications').expect(200)).body.map((n) => n.type)).toContain('shop.order_new');
      expect((await c.api.get('/me/notifications').expect(200)).body.map((n) => n.type)).not.toContain('shop.order_new');

      const r = await onlineRider(lerp(SHOP, HOME, -0.3));
      await s.api.post(`/seller/orders/${order.id}/accept`).expect(200);
      const offers = (await r.api.get('/rider/offers').expect(200)).body;
      expect(offers).toEqual([expect.objectContaining({ orderId: order.id, shop: s.shop.shop_name, items: 2 })]);
      expect(offers[0].expiresAt - offers[0].offeredAt).toBe(20_000);
      await r.api.post(`/rider/offers/${offers[0].id}/accept`).expect(200);
      expect((await t.trx.dispatch('riders').where({ id: r.row.id }).first()).status).toBe('BUSY');
      await r.api.put('/rider/status', { status: 'OFFLINE' }).expect(409);

      await s.api.post(`/seller/orders/${order.id}/start`).expect(200);
      // the rider cannot take it before it is packed
      await r.api.post(`/rider/orders/${order.id}/picked-up`, { sealed: true }).expect(409);
      await s.api.post(`/seller/orders/${order.id}/packed`).expect(200);
      // cancelling is free only until it is packed
      expect((await c.api.post(`/orders/${order.id}/cancel`).expect(409)).body.error.code).toBe('CANNOT_CANCEL');
      await ping(r, SHOP);
      await r.api.post(`/rider/orders/${order.id}/picked-up`, {}).expect(400);
      expect((await r.api.post(`/rider/orders/${order.id}/picked-up`, { sealed: true }).expect(200)).body.status).toBe('ON_THE_WAY');

      // 750 m out: no code yet, for anyone
      expect((await c.api.get(`/orders/${order.id}/otp`).expect(403)).body.error.code).toBe('OTP_LOCKED');
      expect((await c.api.get(`/orders/${order.id}/track`).expect(200)).body).toMatchObject({ stage: 'ON_THE_WAY', simulated: false, order: { otpRevealed: false } });
      // about 375 m out: the code shows, and the notification says so without containing it
      await ping(r, lerp(SHOP, HOME, 0.5));
      const { code } = (await c.api.get(`/orders/${order.id}/otp`).expect(200)).body;
      expect(code).toMatch(/^\d{4}$/);
      await t.inbox();
      const notes = (await c.api.get('/me/notifications').expect(200)).body;
      expect(notes.map((n) => n.type)).toEqual(expect.arrayContaining(['order.accepted', 'order.packed', 'order.picked_up', 'rider.nearby']));
      expect(notes.some((n) => n.body.includes(code))).toBe(false);
      // not at the door yet: the code is refused before it is even checked
      expect((await r.api.post(`/rider/orders/${order.id}/deliver`, { code, collectedPaise: order.totalPaise }).expect(409)).body.error.code).toBe('NOT_ARRIVED');

      // inside 150 m: arrived
      await ping(r, lerp(SHOP, HOME, 0.95));
      expect((await orderRow(order.id)).status).toBe('ARRIVED');
      const active = (await r.api.get('/rider/active').expect(200)).body;
      expect(active).toMatchObject({ id: order.id, insideGeofence: true, addressText: expect.stringContaining('Flat 2') });
      expect(JSON.stringify(active)).not.toContain(code);
      const wrong = code === '1234' ? '4321' : '1234';
      expect((await r.api.post(`/rider/orders/${order.id}/deliver`, { code: wrong, collectedPaise: order.totalPaise }).expect(422)).body.error.message).toMatch(/2 tries left/);
      const done = (await r.api.post(`/rider/orders/${order.id}/deliver`, { code, collectedPaise: order.totalPaise }).expect(200)).body;
      expect(done.status).toBe('DELIVERED');

      // afterwards: the code is gone, the rider is paid and free, the customer can rate once
      expect((await c.api.get(`/orders/${order.id}/otp`).expect(410)).body.error.code).toBe('OTP_USED');
      const pay = (await r.api.get('/rider/earnings').expect(200)).body;
      expect(pay).toEqual([expect.objectContaining({ orderId: order.id, basePaise: expect.any(Number), netPaise: expect.any(Number) })]);
      expect((await t.trx.dispatch('riders').where({ id: r.row.id }).first()).status).toBe('ONLINE');
      expect((await c.api.get(`/orders/${order.id}`).expect(200)).body).toMatchObject({ paymentStatus: 'COD_COLLECTED', events: expect.arrayContaining([expect.objectContaining({ to: 'DELIVERED', role: 'rider' })]) });
      await c.api.post(`/orders/${order.id}/review`, { rating: 5 }).expect(201);
      expect((await c.api.post(`/orders/${order.id}/review`, { rating: 1 }).expect(409)).body.error.code).toBe('ALREADY_REVIEWED');
      expect(await stockOf(s.product.id)).toBe(2);
      const board = (await s.api.get('/seller/shop').expect(200)).body;
      expect(board.stats).toMatchObject({ delivered: 1, salesPaise: order.subtotalPaise });
    });

    it('three wrong codes lock the handover and alert an admin', async () => {
      const s = await openShop();
      const c = await customerAt();
      const order = await placeOrder(c, s, 1);
      const r = await onlineRider();
      await s.api.post(`/seller/orders/${order.id}/accept`).expect(200);
      const [offer] = (await r.api.get('/rider/offers').expect(200)).body;
      await r.api.post(`/rider/offers/${offer.id}/accept`).expect(200);
      await s.api.post(`/seller/orders/${order.id}/start`).expect(200);
      await s.api.post(`/seller/orders/${order.id}/packed`).expect(200);
      await r.api.post(`/rider/orders/${order.id}/picked-up`, { sealed: true }).expect(200);
      await ping(r, HOME);
      const { code } = (await c.api.get(`/orders/${order.id}/otp`).expect(200)).body;
      const wrong = code === '1234' ? '4321' : '1234';
      await r.api.post(`/rider/orders/${order.id}/deliver`, { code: wrong, collectedPaise: order.totalPaise }).expect(422);
      await r.api.post(`/rider/orders/${order.id}/deliver`, { code: wrong, collectedPaise: order.totalPaise }).expect(422);
      expect((await r.api.post(`/rider/orders/${order.id}/deliver`, { code: wrong, collectedPaise: order.totalPaise }).expect(423)).body.error.code).toBe('OTP_LOCKED_ATTEMPTS');
      // even the right code is refused now
      await r.api.post(`/rider/orders/${order.id}/deliver`, { code, collectedPaise: order.totalPaise }).expect(423);
      expect((await orderRow(order.id)).otp_locked_at).not.toBeNull();
      const alert = await t.trx.ordering('outbox').where({ type: 'admin.alert' }).orderBy('id', 'desc').first();
      expect(typeof alert.payload === 'string' ? JSON.parse(alert.payload) : alert.payload).toEqual({ type: 'delivery_code_locked', userId: r.user.id, orderId: order.id });
    });

    it('two riders accepting at once: exactly one gets the order', async () => {
      const s = await openShop();
      const c = await customerAt();
      const order = await placeOrder(c, s, 1);
      const a = await onlineRider();
      const b = await onlineRider(lerp(SHOP, HOME, -0.5));
      await s.api.post(`/seller/orders/${order.id}/accept`).expect(200);
      // the nearer rider gets the first offer; give the other one too, as a second process might
      const [first] = (await a.api.get('/rider/offers').expect(200)).body;
      const [{ id: second }] = await t.trx.dispatch('assignments').insert({ order_id: order.id, rider_id: b.row.id, status: 'OFFERED', offered_at: new Date() }).returning('id');
      const results = await Promise.all([a.api.post(`/rider/offers/${first.id}/accept`), b.api.post(`/rider/offers/${second}/accept`)]);
      const [won, lost] = results.map((x) => x.status).sort();
      expect(won).toBe(200);
      // the loser hears either that the order is taken or that the offer closed
      expect([409, 410]).toContain(lost);
      expect((await orderRow(order.id)).rider_id).toBe(results[0].status === 200 ? a.row.id : b.row.id);
    });

    it('refuses impossible GPS jumps', async () => {
      const r = await onlineRider();
      expect((await r.api.post('/rider/location', { lat: 17.385, lng: 78.4867 }).expect(422)).body.error.code).toBe('GPS_JUMP');
    });
  });

  describe('the clocks', () => {
    it('cancels an order the shop has not accepted in 2 minutes and puts the stock back', async () => {
      const s = await openShop({ stock: 3 });
      const c = await customerAt();
      const order = await placeOrder(c, s, 2);
      expect(await stockOf(s.product.id)).toBe(1);
      await t.trx.ordering('orders').where({ id: order.id }).update({ placed_at: new Date(Date.now() - 3 * 60_000) });
      expect((await runOrderTimers({ dbs: t.trx })).sellerTimeouts).toBe(1);
      expect(await orderRow(order.id)).toMatchObject({ status: 'CANCELLED', cancel_reason: 'The shop did not accept in 2 minutes' });
      expect(await stockOf(s.product.id)).toBe(3);
      await s.api.post(`/seller/orders/${order.id}/accept`).expect(409);
    });

    it('the same action sent twice at once happens once: accept, and cancel', async () => {
      const s = await openShop();
      const c = await customerAt();
      const order = await placeOrder(c, s, 1);
      const accepts = await Promise.all([s.api.post(`/seller/orders/${order.id}/accept`), s.api.post(`/seller/orders/${order.id}/accept`)]);
      expect(accepts.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await t.trx.ordering('order_events').where({ order_id: order.id, to_status: 'ACCEPTED' }).count({ n: '*' }).first()).toEqual({ n: 1 });

      const other = await placeOrder(c, s, 1);
      const cancels = await Promise.all([c.api.post(`/orders/${other.id}/cancel`), c.api.post(`/orders/${other.id}/cancel`)]);
      expect(cancels.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await t.trx.ordering('order_events').where({ order_id: other.id, to_status: 'CANCELLED' }).count({ n: '*' }).first()).toEqual({ n: 1 });
      expect(await stockOf(s.product.id)).toBe(4);
    });

    it('an offer nobody answers in 20 seconds goes to the next rider; a decline does at once', async () => {
      const s = await openShop();
      const c = await customerAt();
      const order = await placeOrder(c, s, 1);
      const near = await onlineRider(SHOP);
      const far = await onlineRider(lerp(SHOP, HOME, -1));
      await s.api.post(`/seller/orders/${order.id}/accept`).expect(200);
      const [first] = (await near.api.get('/rider/offers').expect(200)).body;
      expect(first).toBeTruthy();
      expect((await far.api.get('/rider/offers').expect(200)).body).toEqual([]);
      await t.trx.dispatch('assignments').where({ id: first.id }).update({ offered_at: new Date(Date.now() - 25_000) });
      await runOrderTimers({ dbs: t.trx });
      expect((await near.api.get('/rider/offers').expect(200)).body).toEqual([]);
      const [next] = (await far.api.get('/rider/offers').expect(200)).body;
      expect(next.orderId).toBe(order.id);
      // too late for the first rider
      await near.api.post(`/rider/offers/${first.id}/accept`).expect(410);
      await far.api.post(`/rider/offers/${next.id}/decline`).expect(200);
      // nobody else is left to ask: the order waits, and the shop sees it is still looking
      expect((await orderRow(order.id)).rider_id).toBeNull();
    });

    it('the shop rejecting returns the stock and tells the customer', async () => {
      const s = await openShop({ stock: 2 });
      const c = await customerAt();
      const order = await placeOrder(c, s, 2);
      await s.api.post(`/seller/orders/${order.id}/reject`).expect(200);
      expect(await stockOf(s.product.id)).toBe(2);
      await t.inbox();
      expect((await c.api.get('/me/notifications').expect(200)).body.map((n) => n.type)).toContain('order.rejected');
    });
  });

  describe('the menu', () => {
    it('stock moves by adjustments with a reason, never below zero; unapproved shops cannot list', async () => {
      const s = await openShop({ stock: 0 });
      const p = s.product;
      expect((await s.api.patch(`/seller/products/${p.id}/stock`, { delta: -1, reason: 'manual correction' }).expect(422)).body.error.code).toBe('NEGATIVE_STOCK');
      await s.api.patch(`/seller/products/${p.id}/stock`, { delta: 3, reason: 'not a reason' }).expect(400);
      const after = (await s.api.patch(`/seller/products/${p.id}/stock`, { delta: 3, reason: 'new batch' }).expect(200)).body;
      expect(after).toMatchObject({ stock: 3, lastAdjust: { delta: 3, reason: 'new batch' } });
      await s.api.patch(`/seller/products/${p.id}`, { pricePaise: 100 }).expect(400);
      await s.api.patch(`/seller/products/${p.id}`, { mrpPaise: 5000 }).expect(422);

      const pending = await readySeller(t);
      const draft = (await api(t, pending.token).post('/seller/products', { title: 'Test murukku (demo)', category: 'namkeen', servingTemp: 'AMBIENT', prepMinutes: 3, pricePaise: 4000 }).expect(201)).body;
      expect((await api(t, pending.token).patch(`/seller/products/${draft.id}`, { active: true }).expect(403)).body.error.code).toBe('NOT_ELIGIBLE');
      // a pending shop is not in any listing, so it cannot get an order either
      const c = await customerAt();
      expect((await c.api.put('/cart', { productId: draft.id, qty: 1 }).expect(404)).body.error.code).toBe('NOT_FOUND');
    });
  });

  it('pages the order history: the newest first, then older pages after the last one shown', async () => {
    const shop = await H.openShop(t, staff, { stock: 10 });
    const c = await H.customerAt(t);
    const ids = [];
    for (let i = 0; i < 3; i += 1) ids.push((await H.placeOrder(c, shop, 1)).id);
    const newestFirst = [...ids].reverse();
    expect((await c.api.get('/orders').expect(200)).body.map((o) => o.id)).toEqual(newestFirst);
    const first = (await c.api.get('/orders?limit=2').expect(200)).body.map((o) => o.id);
    expect(first).toEqual(newestFirst.slice(0, 2));
    expect((await c.api.get(`/orders?before=${first[1]}&limit=2`).expect(200)).body.map((o) => o.id)).toEqual(newestFirst.slice(2));
    // someone else's order is no cursor; nonsense is refused
    const other = await H.customerAt(t);
    expect((await other.api.get(`/orders?before=${ids[0]}`).expect(200)).body).toEqual([]);
    await c.api.get('/orders?limit=500').expect(400);
    await c.api.get('/orders?role=admin').expect(400);
  });
});
