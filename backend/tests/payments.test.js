// Online payments and refunds on MySQL with a fake PhonePe that answers like the real API
// (utils/phonepe.js): success, failure, an abandoned payment, a late success, a wrong amount,
// the provider being down, repeated and forged webhooks, refunds full and partial, and cash
// on delivery recorded the same way. Nothing here trusts the browser or a webhook body.
import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHarness, beginTest, request } from './helpers/app.js';
import { staffToken } from './helpers/onboarding.js';
import { AppError } from '../src/utils/AppError.js';
import { createPhonePe } from '../src/utils/phonepe.js';
import { reconcilePayments, refundOrder } from '../src/utils/payments.js';
import * as H from './helpers/orders.js';

const h = await openHarness({ PAYMENT_WINDOW_MIN: '15' });
if (h.skip) console.warn(`payment tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

const HOOK = { PHONEPE_WEBHOOK_USERNAME: 'hook-user', PHONEPE_WEBHOOK_PASSWORD: 'hook-password-for-tests' };
const hookAuth = createHash('sha256').update(`${HOOK.PHONEPE_WEBHOOK_USERNAME}:${HOOK.PHONEPE_WEBHOOK_PASSWORD}`).digest('hex');

/** A PhonePe stand-in: payments and refunds the test moves by hand, every call recorded. */
function fakePhonePe() {
  const orders = new Map();
  const refunds = new Map();
  const calls = [];
  const real = createPhonePe({ ...HOOK, PHONEPE_CLIENT_ID: 'x', PHONEPE_CLIENT_SECRET: 'y' });
  return {
    name: 'PHONEPE',
    enabled: true,
    calls,
    orders,
    refunds,
    down: false,
    async createPayment({ merchantOrderId, amountPaise, redirectUrl, expireAfterSec }) {
      calls.push(['create', merchantOrderId, amountPaise, redirectUrl, expireAfterSec]);
      if (this.down) throw new AppError(503, 'PAYMENT_PROVIDER_DOWN', 'PhonePe is not answering');
      orders.set(merchantOrderId, { amount: amountPaise, state: 'PENDING' });
      return { providerOrderId: `OMO${calls.length}`, redirectUrl: `https://mercury-uat.phonepe.com/transact/uat_v2?token=t${calls.length}`, expiresAt: Date.now() + expireAfterSec * 1000 };
    },
    async orderStatus(id) {
      calls.push(['status', id]);
      const o = orders.get(id);
      return { state: o.state, amountPaise: o.paid ?? o.amount, mode: o.state === 'PAID' ? 'UPI_INTENT' : null, errorCode: o.state === 'FAILED' ? 'PAYMENT_DECLINED' : null };
    },
    async refund({ merchantRefundId, merchantOrderId, amountPaise }) {
      calls.push(['refund', merchantRefundId, merchantOrderId, amountPaise]);
      refunds.set(merchantRefundId, { amount: amountPaise, state: 'PENDING' });
      return { providerRefundId: `OMR-${merchantRefundId}`, state: 'PENDING' };
    },
    async refundStatus(id) {
      calls.push(['refundStatus', id]);
      return { providerRefundId: `OMR-${id}`, state: refunds.get(id).state, errorCode: null };
    },
    verifyWebhook: real.verifyWebhook,
    count: (kind) => calls.filter((c) => c[0] === kind).length,
  };
}

describe.skipIf(h.skip)('online payment', () => {
  let t;
  let pp;
  let staff;
  beforeEach(async () => {
    pp = fakePhonePe();
    t = await beginTest(h, { paymentProvider: pp });
    staff = await staffToken(t, 'reviewer');
  });
  afterEach(() => t.end());

  const stockOf = async (productId) => (await t.trx.catalog('stock').where({ product_id: productId }).first()).qty;
  const paymentOf = (orderId) => t.trx.payment('payments').where({ order_id: orderId }).first();
  const ledgerOf = async (orderId) => t.trx.payment('ledger_entries').where({ payment_id: (await paymentOf(orderId)).id }).orderBy('id').select('entry_type', 'amount_paise');
  const orderStatus = async (id) => (await t.trx.ordering('orders').where({ id }).first()).status;

  /** A shop with stock 5, a customer near it, and an online order for 2 units. */
  async function onlineOrder({ key = H.key() } = {}) {
    const s = await H.openShop(t, staff);
    const c = await H.customerAt(t);
    await c.api.put('/cart', { productId: s.product.id, qty: 2 }).expect(200);
    const res = await c.api.post('/orders', { addressId: c.address.id, paymentMode: 'ONLINE' }, { 'Idempotency-Key': key }).expect(201);
    const { order } = res.body;
    const merchantOrderId = (await paymentOf(order.id)).provider_order_id;
    return { s, c, order, key, merchantOrderId };
  }

  const webhook = (body, auth = hookAuth) => request(t.app).post('/api/v1/webhooks/phonepe').set('Authorization', auth).set('Content-Type', 'application/json').send(JSON.stringify(body));
  const until = async (fn, ms = 3000) => {
    for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 50))) if (await fn()) return true;
    return false;
  };

  it('offers online payment, holds the stock, and sends the customer to PhonePe without telling the shop yet', async () => {
    const s = await H.openShop(t, staff);
    const c = await H.customerAt(t);
    await c.api.put('/cart', { productId: s.product.id, qty: 2 }).expect(200);
    const quote = (await c.api.post('/orders/quote', { addressId: c.address.id }).expect(200)).body;
    expect(quote).toMatchObject({ paymentModes: ['ONLINE', 'COD'], onlineProvider: 'PHONEPE' });

    const key = H.key();
    const { order } = (await c.api.post('/orders', { addressId: c.address.id, paymentMode: 'ONLINE' }, { 'Idempotency-Key': key }).expect(201)).body;
    expect(order).toMatchObject({ status: 'PENDING_PAYMENT', paymentMode: 'ONLINE', paymentStatus: 'CREATED', payment: { status: 'CREATED', redirectUrl: expect.stringContaining('mercury-uat.phonepe.com') } });
    expect(await stockOf(s.product.id)).toBe(3);
    // the provider got the server's total and a return page on our own site
    const [, merchantOrderId, amount, redirectUrl, expireAfter] = pp.calls[0];
    expect(merchantOrderId).toMatch(/^SH-\d+-[0-9a-f]{10}$/);
    expect(amount).toBe(order.totalPaise);
    expect(redirectUrl).toBe(`${h.env.APP_URL}/orders/${order.id}?payment=return`);
    expect(expireAfter).toBe(900);
    // the shop does not see an unpaid order
    expect((await s.api.get('/seller/orders').expect(200)).body.map((o) => o.id)).not.toContain(order.id);

    // a double tap: the same order and the same pay page, one PhonePe payment
    const again = (await c.api.post('/orders', { addressId: c.address.id, paymentMode: 'ONLINE' }, { 'Idempotency-Key': key }).expect(200)).body;
    expect(again).toMatchObject({ replayed: true, order: { id: order.id, payment: { redirectUrl: order.payment.redirectUrl } } });
    expect(pp.count('create')).toBe(1);
  });

  it('places the order only when the status API says paid, once, however many times it is asked', async () => {
    const { s, c, order, merchantOrderId } = await onlineOrder();
    // back from the pay page without paying: still waiting
    expect((await c.api.post(`/orders/${order.id}/payment/check`).expect(200)).body.status).toBe('PENDING_PAYMENT');

    pp.orders.get(merchantOrderId).state = 'PAID';
    // the page asks PhonePe at most every 3 seconds: as if those had passed
    await t.trx.payment('payments').where({ order_id: order.id }).update({ checked_at: new Date(Date.now() - 5000) });
    const [a, b] = await Promise.all([c.api.post(`/orders/${order.id}/payment/check`), c.api.post(`/orders/${order.id}/payment/check`)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const paid = (await c.api.get(`/orders/${order.id}`).expect(200)).body;
    expect(paid).toMatchObject({ status: 'PLACED', paymentStatus: 'CAPTURED', payment: { status: 'CAPTURED', payMode: 'UPI_INTENT', redirectUrl: null } });
    await reconcilePayments(t.trx);
    await c.api.post(`/orders/${order.id}/payment/check`).expect(200);
    expect(await ledgerOf(order.id)).toEqual([{ entry_type: 'CHARGE', amount_paise: order.totalPaise }]);
    // now the shop has it, with a fresh accept clock
    expect((await s.api.get('/seller/orders').expect(200)).body.map((o) => o.id)).toContain(order.id);
    const inbox = await t.trx.ordering('outbox').where('dedupe_key', 'like', `inbox:${order.id}:%`).pluck('dedupe_key');
    expect(inbox).toEqual(expect.arrayContaining([expect.stringContaining(':shop.order_new:'), expect.stringContaining(':order.paid:')]));
  });

  it('acts on a webhook only through the status API, refuses forged ones, and handles a repeat once', async () => {
    const { c, order, merchantOrderId } = await onlineOrder();
    const body = { event: 'checkout.order.completed', payload: { merchantOrderId, state: 'COMPLETED', amount: order.totalPaise } };

    await webhook(body, 'not-the-secret').expect(401);
    await webhook(body, '').expect(401);
    // a genuine webhook says completed, but PhonePe's status API still says pending: nothing moves
    await webhook(body).expect(200);
    await until(async () => (await t.trx.payment('webhook_events').whereNotNull('processed_at').count({ n: '*' }))[0].n > 0);
    expect(await orderStatus(order.id)).toBe('PENDING_PAYMENT');

    pp.orders.get(merchantOrderId).state = 'PAID';
    const again = { ...body, payload: { ...body.payload, at: 2 } };
    await webhook(again).expect(200);
    await webhook(again).expect(200); // the same delivery twice
    expect(await until(async () => (await orderStatus(order.id)) === 'PLACED')).toBe(true);
    expect(await ledgerOf(order.id)).toHaveLength(1);
    expect(await t.trx.payment('webhook_events').count({ n: '*' }).then(([r]) => Number(r.n))).toBe(2);
    expect((await c.api.get(`/orders/${order.id}`).expect(200)).body.paymentStatus).toBe('CAPTURED');
  });

  it('a failed payment cancels the order and puts the stock back; nothing is charged', async () => {
    const { s, c, order, merchantOrderId } = await onlineOrder();
    pp.orders.get(merchantOrderId).state = 'FAILED';
    const after = (await c.api.post(`/orders/${order.id}/payment/check`).expect(200)).body;
    expect(after).toMatchObject({ status: 'CANCELLED', paymentStatus: 'FAILED' });
    expect(await stockOf(s.product.id)).toBe(5);
    expect(await ledgerOf(order.id)).toEqual([]);
  });

  it('an abandoned payment expires; a success that arrives after that is refunded in full', async () => {
    const { s, order, merchantOrderId } = await onlineOrder();
    // the window and the grace period are over, PhonePe still says pending
    await t.trx.payment('payments').where({ order_id: order.id }).update({ expires_at: new Date(Date.now() - 11 * 60_000), created_at: new Date(Date.now() - 30 * 60_000) });
    await t.trx.ordering('orders').where({ id: order.id }).update({ placed_at: new Date(Date.now() - 30 * 60_000) });
    await reconcilePayments(t.trx);
    expect(await orderStatus(order.id)).toBe('CANCELLED');
    expect((await paymentOf(order.id)).status).toBe('EXPIRED');
    expect(await stockOf(s.product.id)).toBe(5);

    // the customer finished paying on their phone anyway
    pp.orders.get(merchantOrderId).state = 'PAID';
    await webhook({ event: 'checkout.order.completed', payload: { merchantOrderId } }).expect(200);
    expect(await until(async () => (await paymentOf(order.id)).status === 'REFUND_PENDING')).toBe(true);
    const [refundCall] = pp.calls.filter((x) => x[0] === 'refund');
    expect(refundCall[3]).toBe(order.totalPaise);
    // PhonePe completes the refund and says so
    pp.refunds.get(refundCall[1]).state = 'DONE';
    await webhook({ event: 'pg.refund.completed', payload: { merchantRefundId: refundCall[1], originalMerchantOrderId: merchantOrderId, state: 'COMPLETED' } }).expect(200);
    expect(await until(async () => (await paymentOf(order.id)).status === 'REFUNDED')).toBe(true);
    expect(await ledgerOf(order.id)).toEqual([
      { entry_type: 'CHARGE', amount_paise: order.totalPaise },
      { entry_type: 'REFUND', amount_paise: order.totalPaise },
    ]);
    expect(await orderStatus(order.id)).toBe('CANCELLED');
  });

  it('never places an order paid with a different amount', async () => {
    const { order, merchantOrderId } = await onlineOrder();
    Object.assign(pp.orders.get(merchantOrderId), { state: 'PAID', paid: order.totalPaise - 100 });
    await reconcilePayments(t.trx);
    await t.trx.payment('payments').where({ order_id: order.id }).update({ checked_at: null });
    await t.trx.ordering('orders').where({ id: order.id }).update({ placed_at: new Date(Date.now() - 60_000) });
    await reconcilePayments(t.trx);
    expect(await orderStatus(order.id)).toBe('CANCELLED');
    const p = await paymentOf(order.id);
    expect(p).toMatchObject({ status: 'REFUND_PENDING', failure_code: 'AMOUNT_MISMATCH' });
    // the refund is what PhonePe actually took, not the order total
    expect(pp.calls.filter((x) => x[0] === 'refund').map((x) => x[3])).toEqual([order.totalPaise - 100]);
  });

  it('refunds a paid order that closed without its refund starting (a crash between the two steps)', async () => {
    const { c, order, merchantOrderId } = await onlineOrder();
    pp.orders.get(merchantOrderId).state = 'PAID';
    await c.api.post(`/orders/${order.id}/payment/check`).expect(200);
    // the order closed, then the process stopped before the refund: no refund row exists
    await t.trx.ordering('orders').where({ id: order.id }).update({ status: 'CANCELLED', closed_at: new Date(Date.now() - 5 * 60_000) });
    await reconcilePayments(t.trx);
    expect(pp.calls.filter((x) => x[0] === 'refund').map((x) => x[3])).toEqual([order.totalPaise]);
    expect((await paymentOf(order.id)).status).toBe('REFUND_PENDING');
    // later passes do not send it again
    await reconcilePayments(t.trx);
    expect(pp.count('refund')).toBe(1);
  });

  it('when PhonePe is down at checkout, the order is cancelled, the stock returned and the customer told', async () => {
    const s = await H.openShop(t, staff);
    const c = await H.customerAt(t);
    await c.api.put('/cart', { productId: s.product.id, qty: 2 }).expect(200);
    pp.down = true;
    const res = await c.api.post('/orders', { addressId: c.address.id, paymentMode: 'ONLINE' }, { 'Idempotency-Key': H.key() }).expect(503);
    expect(res.body.error.code).toBe('PAYMENT_PROVIDER_DOWN');
    expect(await stockOf(s.product.id)).toBe(5);
    const [o] = (await c.api.get('/orders').expect(200)).body;
    expect(o).toMatchObject({ status: 'CANCELLED', paymentStatus: 'FAILED' });
  });

  it('a cancelled paid order is refunded in full; refunds never add up to more than was paid', async () => {
    const { c, order, merchantOrderId } = await onlineOrder();
    pp.orders.get(merchantOrderId).state = 'PAID';
    await c.api.post(`/orders/${order.id}/payment/check`).expect(200);
    // a partial refund first (a complaint, say), then the order is cancelled
    await refundOrder(t.trx, order.id, 1000, 'Missing item');
    await expect(refundOrder(t.trx, order.id, order.totalPaise, 'Too much')).rejects.toMatchObject({ code: 'REFUND_TOO_LARGE' });
    await c.api.post(`/orders/${order.id}/cancel`).expect(200);
    const sent = pp.calls.filter((x) => x[0] === 'refund').map((x) => x[3]);
    expect(sent).toEqual([1000, order.totalPaise - 1000]);
    expect(new Set(pp.calls.filter((x) => x[0] === 'refund').map((x) => x[1])).size).toBe(2);
    for (const r of pp.refunds.values()) r.state = 'DONE';
    await t.trx.payment('refunds').update({ created_at: new Date(Date.now() - 60_000) });
    await reconcilePayments(t.trx);
    const view = (await c.api.get(`/orders/${order.id}`).expect(200)).body;
    expect(view.payment).toMatchObject({ status: 'REFUNDED', refundedPaise: order.totalPaise, refundPendingPaise: 0 });
  });

  it('a refund PhonePe refuses is marked failed, the payment goes back to captured, and the customer is told', async () => {
    const { c, order, merchantOrderId } = await onlineOrder();
    pp.orders.get(merchantOrderId).state = 'PAID';
    await c.api.post(`/orders/${order.id}/payment/check`).expect(200);
    await refundOrder(t.trx, order.id, 1000, 'Missing item');
    for (const r of pp.refunds.values()) r.state = 'FAILED';
    await t.trx.payment('refunds').update({ created_at: new Date(Date.now() - 60_000) });
    await reconcilePayments(t.trx);
    expect((await paymentOf(order.id)).status).toBe('CAPTURED');
    expect((await t.trx.payment('refunds').first()).status).toBe('FAILED');
    expect(await t.trx.ordering('outbox').where('dedupe_key', 'like', `inbox:${order.id}:refund.delayed:%`).first()).toBeTruthy();
    // the failed one does not count: the whole amount can still be refunded
    expect(await refundOrder(t.trx, order.id, order.totalPaise, 'Retry')).toBeTruthy();
  });
});

describe.skipIf(h.skip)('cash on delivery', () => {
  let t;
  beforeEach(async () => {
    t = await beginTest(h);
  });
  afterEach(() => t.end());

  it('is recorded as expected at checkout and collected at the door, with one ledger row', async () => {
    const staff = await staffToken(t, 'reviewer');
    const { order } = await H.deliveredOrder(t, staff);
    const p = await t.trx.payment('payments').where({ order_id: order.id }).first();
    expect(p).toMatchObject({ method: 'COD', status: 'COD_COLLECTED', amount_paise: order.totalPaise });
    expect(await t.trx.payment('ledger_entries').where({ payment_id: p.id }).select('entry_type', 'amount_paise')).toEqual([{ entry_type: 'CHARGE', amount_paise: order.totalPaise }]);
  });

  it('online payment is refused when no provider is set up', async () => {
    const staff = await staffToken(t, 'reviewer');
    const s = await H.openShop(t, staff);
    const c = await H.customerAt(t);
    await c.api.put('/cart', { productId: s.product.id, qty: 1 }).expect(200);
    expect((await c.api.post('/orders/quote', { addressId: c.address.id }).expect(200)).body.paymentModes).toEqual(['COD']);
    expect((await c.api.post('/orders', { addressId: c.address.id, paymentMode: 'ONLINE' }, { 'Idempotency-Key': H.key() }).expect(409)).body.error.code).toBe('ONLINE_PAYMENT_UNAVAILABLE');
  });
});

describe('PhonePe client', () => {
  const env = { PHONEPE_CLIENT_ID: 'TEST-M1', PHONEPE_CLIENT_SECRET: 'sec', PHONEPE_CLIENT_VERSION: 1, ...HOOK };
  const reply = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body });

  it('talks only to the sandbox, reuses its token, and maps the states', async () => {
    const calls = [];
    const fetchImpl = (url, init) => {
      calls.push({ url, auth: init.headers.Authorization, body: init.body });
      if (url.endsWith('/v1/oauth/token')) return reply({ access_token: 'tok', token_type: 'O-Bearer', expires_at: Math.floor(Date.now() / 1000) + 3600 });
      if (url.endsWith('/checkout/v2/pay')) return reply({ orderId: 'OMO1', state: 'PENDING', expireAt: Date.now() + 900_000, redirectUrl: 'https://mercury-uat.phonepe.com/transact/uat_v2?token=abc' });
      return reply({ orderId: 'OMO1', state: 'COMPLETED', amount: 12900, paymentDetails: [{ paymentMode: 'UPI_QR', transactionId: 'OM1', state: 'COMPLETED' }] });
    };
    const pp = createPhonePe(env, { fetchImpl });
    const started = await pp.createPayment({ merchantOrderId: 'SH-1-abc', amountPaise: 12900, redirectUrl: 'http://localhost:5180/orders/1', expireAfterSec: 900 });
    expect(started).toMatchObject({ providerOrderId: 'OMO1', redirectUrl: expect.stringContaining('mercury-uat') });
    expect(await pp.orderStatus('SH-1-abc')).toMatchObject({ state: 'PAID', amountPaise: 12900, mode: 'UPI_QR' });
    expect(calls.every((c) => c.url.startsWith('https://api-preprod.phonepe.com/apis/pg-sandbox/'))).toBe(true);
    expect(calls.filter((c) => c.url.endsWith('/oauth/token'))).toHaveLength(1);
    expect(calls[1].auth).toBe('O-Bearer tok');
    expect(JSON.parse(calls[1].body)).toEqual({ merchantOrderId: 'SH-1-abc', amount: 12900, expireAfter: 900, paymentFlow: { type: 'PG_CHECKOUT', merchantUrls: { redirectUrl: 'http://localhost:5180/orders/1' } } });
  });

  it('turns errors into clear answers and checks webhook credentials in constant time', async () => {
    const down = createPhonePe(env, { fetchImpl: () => Promise.reject(new Error('offline')) });
    await expect(down.orderStatus('x')).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_DOWN' });
    const refused = createPhonePe(env, { fetchImpl: (url) => (url.endsWith('/token') ? reply({ access_token: 't', expires_at: 9e9 }) : reply({ code: 'BAD_REQUEST' }, 400)) });
    await expect(refused.refund({ merchantRefundId: 'r', merchantOrderId: 'o', amountPaise: 100 })).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_REFUSED', providerCode: 'BAD_REQUEST' });

    const pp = createPhonePe(env);
    const body = Buffer.from(JSON.stringify({ event: 'checkout.order.failed', payload: { merchantOrderId: 'SH-9-x' } }));
    expect(pp.verifyWebhook({ authorization: hookAuth }, body)).toEqual({ event: 'checkout.order.failed', merchantOrderId: 'SH-9-x', merchantRefundId: null });
    expect(pp.verifyWebhook({ authorization: 'x'.repeat(64) }, body)).toBeNull();
    expect(createPhonePe({ ...env, PHONEPE_WEBHOOK_PASSWORD: '' }).verifyWebhook({ authorization: hookAuth }, body)).toBeNull();
    expect(createPhonePe({ PHONEPE_CLIENT_ID: '', PHONEPE_CLIENT_SECRET: '' }).enabled).toBe(false);
  });
});
