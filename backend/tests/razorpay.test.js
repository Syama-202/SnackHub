// Razorpay client (utils/razorpay.js) against a fake of its API: test keys only, the order the
// customer pays created for the server's total, PAID only from the payments Razorpay lists (one
// left authorized is captured), refunds sent once per receipt, refusals turned into clear
// answers, and webhook signatures checked in constant time. No network and no database.
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createRazorpay, RAZORPAY_API } from '../src/utils/razorpay.js';
import { createPaymentProvider } from '../src/utils/payments.js';
import { loadEnv } from '../src/config/env.js';

const KEYS = { RAZORPAY_KEY_ID: 'rzp_test_AbC123xyz', RAZORPAY_KEY_SECRET: 'not-a-real-secret', RAZORPAY_WEBHOOK_SECRET: 'hook-secret-for-tests' };
const reply = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body });
const refusal = (reason, code = 'BAD_REQUEST_ERROR') => reply({ error: { code, description: 'Refused', reason } }, 400);

/** A fake Razorpay API: answers by "METHOD /path" (query left out), every call recorded. */
function fakeApi(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const call = { key: `${init.method} ${u.pathname.replace(/^\/v1/, '')}`, url: String(url), auth: init.headers.Authorization, body: init.body ? JSON.parse(init.body) : null };
    calls.push(call);
    const route = routes[call.key];
    if (!route) return refusal('NA');
    if (typeof route === 'function') return route(call);
    return typeof route.then === 'function' ? route : reply(route);
  };
  return { calls, fetchImpl, count: (key) => calls.filter((c) => c.key === key).length };
}

const order = 'order_T1';
const payment = (status, extra = {}) => ({ id: 'pay_1', entity: 'payment', amount: 12900, currency: 'INR', status, order_id: order, method: 'upi', created_at: 1700000000, ...extra });

describe('Razorpay client', () => {
  it('works with test keys only: a live key switches it off and stops the server at start', () => {
    expect(createRazorpay(KEYS).enabled).toBe(true);
    expect(createRazorpay({ ...KEYS, RAZORPAY_KEY_ID: 'rzp_live_AbC123xyz' }).enabled).toBe(false);
    expect(createRazorpay({ ...KEYS, RAZORPAY_KEY_SECRET: '' }).enabled).toBe(false);
    expect(createPaymentProvider(KEYS).name).toBe('RAZORPAY');
    // without a Razorpay key: PhonePe's sandbox, switched off without its own keys
    expect(createPaymentProvider({})).toMatchObject({ name: 'PHONEPE', enabled: false });

    const VALID = {
      CORS_ORIGINS: 'http://localhost:5173',
      DB_HOST: '127.0.0.1',
      DB_MIGRATOR_USER: 'sh_migrator',
      DB_MIGRATOR_PASSWORD: 'not-a-real-secret',
      DB_MODULE_PASSWORD: 'not-a-real-secret',
      JWT_SECRET: 'test-only-secret-that-is-at-least-32-characters',
      MFA_KEY: 'dGVzdC1vbmx5LW1mYS1rZXktMzItYnl0ZXMtbG9uZyE',
    };
    expect(loadEnv({ ...VALID, ...KEYS }).RAZORPAY_KEY_ID).toBe(KEYS.RAZORPAY_KEY_ID);
    expect(() => loadEnv({ ...VALID, ...KEYS, RAZORPAY_KEY_ID: 'rzp_live_AbC123xyz' })).toThrow(/test key.*Live keys are not allowed/);
    expect(() => loadEnv({ ...VALID, RAZORPAY_KEY_ID: KEYS.RAZORPAY_KEY_ID })).toThrow(/RAZORPAY_KEY_SECRET/);
  });

  it("creates the order for the server's total, talks only to api.razorpay.com, and gives the browser what it needs", async () => {
    const api = fakeApi({ 'POST /orders': { id: order, entity: 'order', amount: 12900, currency: 'INR', status: 'created' } });
    const rp = createRazorpay(KEYS, { fetchImpl: api.fetchImpl });
    const started = await rp.createPayment({ merchantOrderId: 'SH-1-abcdef0123', amountPaise: 12900, redirectUrl: 'http://localhost:5180/orders/1?payment=return', expireAfterSec: 900 });
    expect(started).toEqual({ providerOrderId: order, redirectUrl: null, expiresAt: null });
    const [call] = api.calls;
    expect(call.url).toBe(`${RAZORPAY_API}/orders`);
    expect(call.auth).toBe(`Basic ${Buffer.from(`${KEYS.RAZORPAY_KEY_ID}:${KEYS.RAZORPAY_KEY_SECRET}`).toString('base64')}`);
    expect(call.body).toEqual({ amount: 12900, currency: 'INR', receipt: 'SH-1-abcdef0123', notes: { merchant_order_id: 'SH-1-abcdef0123' } });

    // only the public key id and the order id reach the browser, and only while it can be paid
    const row = { method: 'RAZORPAY', status: 'CREATED', provider_payment_id: order, amount_paise: 12900 };
    expect(rp.checkoutFor(row)).toEqual({ provider: 'RAZORPAY', key: KEYS.RAZORPAY_KEY_ID, orderId: order, amountPaise: 12900, currency: 'INR' });
    expect(JSON.stringify(rp.checkoutFor(row))).not.toContain(KEYS.RAZORPAY_KEY_SECRET);
    expect(rp.checkoutFor({ ...row, status: 'CAPTURED' })).toBeNull();
    expect(rp.checkoutFor({ ...row, method: 'PHONEPE' })).toBeNull();
    expect(rp.checkoutFor({ ...row, provider_payment_id: null })).toBeNull();
  });

  it('says PAID only from the payments Razorpay lists, and captures one left authorized', async () => {
    let attempts = [];
    const api = fakeApi({
      [`GET /orders/${order}/payments`]: () => reply({ entity: 'collection', count: attempts.length, items: attempts }),
      'POST /payments/pay_1/capture': (call) => reply(payment('captured', { amount: call.body.amount })),
    });
    const rp = createRazorpay(KEYS, { fetchImpl: api.fetchImpl });

    // the Razorpay order was never saved: nobody could have paid it, and Razorpay is not asked
    expect(await rp.orderStatus('SH-1-abcdef0123')).toMatchObject({ state: 'PENDING', amountPaise: null });
    expect(api.calls).toHaveLength(0);
    // a failed attempt is not the end: the customer can try again in the same window
    attempts = [payment('failed', { error_code: 'BAD_REQUEST_ERROR' })];
    expect(await rp.orderStatus('SH-1-abcdef0123', { providerOrderId: order })).toMatchObject({ state: 'PENDING', errorCode: 'BAD_REQUEST_ERROR' });
    attempts = [payment('failed', { id: 'pay_0', created_at: 1 }), payment('captured')];
    expect(await rp.orderStatus('SH-1-abcdef0123', { providerOrderId: order })).toMatchObject({ state: 'PAID', amountPaise: 12900, mode: 'upi' });
    expect(api.count('POST /payments/pay_1/capture')).toBe(0);
    // the account does not capture by itself: captured here for the amount authorized
    attempts = [payment('authorized')];
    expect(await rp.orderStatus('SH-1-abcdef0123', { providerOrderId: order })).toMatchObject({ state: 'PAID', amountPaise: 12900 });
    expect(api.calls.at(-1)).toMatchObject({ key: 'POST /payments/pay_1/capture', body: { amount: 12900, currency: 'INR' } });
    // a capture Razorpay refuses leaves it pending for the next check
    const refusing = createRazorpay(KEYS, { fetchImpl: fakeApi({ [`GET /orders/${order}/payments`]: reply({ items: [payment('authorized')] }), 'POST /payments/pay_1/capture': () => refusal('NA') }).fetchImpl });
    expect(await refusing.orderStatus('SH-1-abcdef0123', { providerOrderId: order })).toMatchObject({ state: 'PENDING' });
  });

  it('sends a refund once per receipt, reads it back, and turns a refusal into a failed refund with the reason', async () => {
    let refunds = [];
    const api = fakeApi({
      [`GET /orders/${order}/payments`]: reply({ items: [payment('captured')] }),
      'GET /payments/pay_1/refunds': () => reply({ entity: 'collection', count: refunds.length, items: refunds }),
      'POST /payments/pay_1/refund': (call) => {
        const r = { id: 'rfnd_1', entity: 'refund', amount: call.body.amount, payment_id: 'pay_1', receipt: call.body.receipt, status: 'pending' };
        refunds = [...refunds, r];
        return reply(r);
      },
      'GET /refunds/rfnd_1': () => reply({ ...refunds[0], status: 'processed' }),
    });
    const rp = createRazorpay(KEYS, { fetchImpl: api.fetchImpl });
    const ask = { merchantRefundId: 'SHR-7-1-def0123', merchantOrderId: 'SH-1-abcdef0123', amountPaise: 1000, providerOrderId: order };
    expect(await rp.refund(ask)).toEqual({ providerRefundId: 'rfnd_1', state: 'PENDING', errorCode: null });
    expect(api.calls.find((c) => c.key === 'POST /payments/pay_1/refund').body).toEqual({ amount: 1000, speed: 'normal', receipt: 'SHR-7-1-def0123', notes: { merchant_refund_id: 'SHR-7-1-def0123' } });
    // sent again (the first answer was lost): Razorpay already has it, so it is not repeated
    expect(await rp.refund(ask)).toMatchObject({ providerRefundId: 'rfnd_1' });
    expect(api.count('POST /payments/pay_1/refund')).toBe(1);

    expect(await rp.refundStatus('SHR-7-1-def0123', { providerRefundId: 'rfnd_1', providerOrderId: order })).toMatchObject({ state: 'DONE' });
    expect(await rp.refundStatus('SHR-7-1-def0123', { providerOrderId: order })).toMatchObject({ providerRefundId: 'rfnd_1', state: 'PENDING' });
    expect(await rp.refundStatus('SHR-7-2-def0123', { providerOrderId: order })).toEqual({ providerRefundId: null, state: 'FAILED', errorCode: 'REFUND_NOT_CREATED' });

    // refused: final, with Razorpay's reason for the admins
    const broke = createRazorpay(KEYS, { fetchImpl: fakeApi({ [`GET /orders/${order}/payments`]: reply({ items: [payment('captured')] }), 'GET /payments/pay_1/refunds': reply({ items: [] }), 'POST /payments/pay_1/refund': () => refusal('insufficient_balance') }).fetchImpl });
    expect(await broke.refund(ask)).toEqual({ providerRefundId: null, state: 'FAILED', errorCode: 'insufficient_balance' });
    const unpaid = createRazorpay(KEYS, { fetchImpl: fakeApi({ [`GET /orders/${order}/payments`]: reply({ items: [payment('failed')] }) }).fetchImpl });
    expect(await unpaid.refund(ask)).toMatchObject({ state: 'FAILED', errorCode: 'NO_CAPTURED_PAYMENT' });
  });

  it('turns errors into clear answers and never calls out with a live key', async () => {
    const down = createRazorpay(KEYS, { fetchImpl: () => Promise.reject(new Error('offline')) });
    await expect(down.createPayment({ merchantOrderId: 'SH-1-x', amountPaise: 100 })).rejects.toMatchObject({ status: 503, code: 'PAYMENT_PROVIDER_DOWN' });
    const failing = createRazorpay(KEYS, { fetchImpl: () => reply({ error: { code: 'SERVER_ERROR' } }, 500) });
    await expect(failing.orderStatus('SH-1-x', { providerOrderId: order })).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_DOWN' });
    const refused = createRazorpay(KEYS, { fetchImpl: () => refusal('input_validation_failed') });
    await expect(refused.createPayment({ merchantOrderId: 'SH-1-x', amountPaise: 100 })).rejects.toMatchObject({ status: 502, code: 'PAYMENT_PROVIDER_REFUSED', providerCode: 'input_validation_failed' });
    // a refund that cannot be sent now (not refused) stays pending for the reconciler
    await expect(down.refund({ merchantRefundId: 'SHR-1-1-x', amountPaise: 100, providerOrderId: order })).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_DOWN' });

    let called = 0;
    const live = createRazorpay({ ...KEYS, RAZORPAY_KEY_ID: 'rzp_live_AbC123xyz' }, { fetchImpl: () => { called += 1; return reply({}); } });
    await expect(live.createPayment({ merchantOrderId: 'SH-1-x', amountPaise: 100 })).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_DOWN' });
    expect(called).toBe(0);
  });

  it('checks webhook signatures in constant time and takes only ids from the body', () => {
    const rp = createRazorpay(KEYS);
    const sign = (raw, secret = KEYS.RAZORPAY_WEBHOOK_SECRET) => createHmac('sha256', secret).update(raw).digest('hex');
    const paid = Buffer.from(JSON.stringify({ event: 'order.paid', payload: { payment: { entity: { id: 'pay_1', order_id: order, status: 'captured', amount: 99 } }, order: { entity: { id: order, receipt: 'SH-1-abcdef0123', status: 'paid' } } } }));
    expect(rp.verifyWebhook({ 'x-razorpay-signature': sign(paid), 'x-razorpay-event-id': 'evt_1' }, paid)).toEqual({
      event: 'order.paid',
      eventId: 'evt_1',
      merchantOrderId: 'SH-1-abcdef0123',
      providerOrderId: order,
      merchantRefundId: null,
      providerRefundId: null,
    });
    const refund = Buffer.from(JSON.stringify({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_1', receipt: 'SHR-7-1-def0123', status: 'processed' } }, payment: { entity: { id: 'pay_1', order_id: order } } } }));
    expect(rp.verifyWebhook({ 'x-razorpay-signature': sign(refund) }, refund)).toMatchObject({ event: 'refund.processed', eventId: null, merchantRefundId: 'SHR-7-1-def0123', providerRefundId: 'rfnd_1' });

    expect(rp.verifyWebhook({ 'x-razorpay-signature': sign(paid, 'another-secret') }, paid)).toBeNull();
    expect(rp.verifyWebhook({ 'x-razorpay-signature': 'x'.repeat(64) }, paid)).toBeNull();
    expect(rp.verifyWebhook({}, paid)).toBeNull();
    // the body changed after signing
    expect(rp.verifyWebhook({ 'x-razorpay-signature': sign(paid) }, Buffer.from(paid.toString().replace('99', '1')))).toBeNull();
    // no secret set: every webhook is refused
    expect(createRazorpay({ ...KEYS, RAZORPAY_WEBHOOK_SECRET: '' }).verifyWebhook({ 'x-razorpay-signature': sign(paid) }, paid)).toBeNull();
  });
});
