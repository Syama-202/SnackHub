// Razorpay Standard Checkout, test mode only (doc 10.9). One provider behind the
// PaymentProvider shape in utils/payments.js:
//   createPayment, orderStatus, refund, refundStatus, verifyWebhook, checkoutFor
// The server creates a Razorpay order for the total it computed; the customer pays in
// Razorpay's own window (UPI, cards, net banking, wallets), so no UPI PIN or card number ever
// reaches SnackHub. Whether it was paid is always read back from Razorpay's API; what the
// browser says and a webhook body alone never mark anything paid. Amounts are paise.
// Razorpay uses one address for test and live and tells them apart by the key, so only test
// keys (rzp_test_…) are accepted: with any other key the provider stays switched off.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from './AppError.js';

export const RAZORPAY_API = 'https://api.razorpay.com/v1';
export const TEST_KEY = /^rzp_test_[A-Za-z0-9]{6,40}$/;
const TIMEOUT_MS = 10_000;

const REFUND_STATE = { processed: 'DONE', failed: 'FAILED', pending: 'PENDING', created: 'PENDING' };
// money Razorpay holds for an order: captured, or captured and since refunded
const TAKEN = ['captured', 'refunded'];

const unavailable = () => new AppError(503, 'PAYMENT_PROVIDER_DOWN', 'Razorpay is not answering. Try again in a minute, or pay on delivery.');
const refused = (code) => {
  const err = new AppError(502, 'PAYMENT_PROVIDER_REFUSED', 'Razorpay did not accept this payment. Try again, or pay on delivery.');
  err.providerCode = code ?? null;
  return err;
};

export function createRazorpay(env, { fetchImpl = globalThis.fetch, logger, base = RAZORPAY_API } = {}) {
  const keyId = env.RAZORPAY_KEY_ID ?? '';
  const enabled = TEST_KEY.test(keyId) && Boolean(env.RAZORPAY_KEY_SECRET);
  const auth = `Basic ${Buffer.from(`${keyId}:${env.RAZORPAY_KEY_SECRET ?? ''}`).toString('base64')}`;

  async function call(path, { method = 'GET', body } = {}) {
    if (!enabled) throw unavailable();
    const headers = { Accept: 'application/json', Authorization: auth };
    if (body) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetchImpl(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      logger?.warn({ razorpay: 'unreachable', reason: err.name }, 'razorpay call failed');
      throw unavailable();
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // the reason ("insufficient_balance") says more than the code ("BAD_REQUEST_ERROR")
      const reason = data.error?.reason && data.error.reason !== 'NA' ? data.error.reason : data.error?.code;
      logger?.warn({ razorpay: 'error', status: res.status, code: data.error?.code, reason: data.error?.reason }, 'razorpay refused a call');
      throw res.status >= 500 ? unavailable() : refused(reason);
    }
    return data;
  }

  /** Every payment attempt on a Razorpay order, newest first. */
  async function paymentsOf(providerOrderId) {
    const data = await call(`/orders/${encodeURIComponent(providerOrderId)}/payments`);
    return [...(data.items ?? [])].sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
  }

  /** The payment that took the money for an order, or a refusal when there is none. */
  async function takenPayment(providerOrderId) {
    if (!providerOrderId) throw refused('NO_RAZORPAY_ORDER');
    const paid = (await paymentsOf(providerOrderId)).find((p) => TAKEN.includes(p.status));
    if (!paid) throw refused('NO_CAPTURED_PAYMENT');
    return paid;
  }

  /** The refund made for one of our refund ids (the receipt), if Razorpay has it. */
  async function refundByReceipt(paymentId, merchantRefundId) {
    const data = await call(`/payments/${encodeURIComponent(paymentId)}/refunds?count=100`);
    return (data.items ?? []).find((r) => r.receipt === merchantRefundId) ?? null;
  }

  const refundAnswer = (r) => ({ providerRefundId: r.id ?? null, state: REFUND_STATE[r.status] ?? 'PENDING', errorCode: r.status === 'failed' ? 'REFUND_FAILED' : null });

  return {
    name: 'RAZORPAY',
    enabled,

    /** Creates the Razorpay order the customer pays; there is no page to send them to. */
    async createPayment({ merchantOrderId, amountPaise }) {
      const data = await call('/orders', { method: 'POST', body: { amount: amountPaise, currency: 'INR', receipt: merchantOrderId, notes: { merchant_order_id: merchantOrderId } } });
      if (!data.id) throw unavailable();
      return { providerOrderId: data.id, redirectUrl: null, expiresAt: null };
    },

    /**
     * PAID or PENDING, with the amount Razorpay took and how it was paid. A failed attempt is
     * not the end: the customer can try again in the same window, so only the payment window
     * running out closes the order. A payment left authorized (when the account does not
     * capture by itself) is captured here, or Razorpay would hand it back after three days.
     */
    async orderStatus(merchantOrderId, { providerOrderId } = {}) {
      // the Razorpay order was never saved (a crash at checkout): nobody could have paid it
      if (!providerOrderId) return { state: 'PENDING', amountPaise: null, mode: null, errorCode: null };
      const attempts = await paymentsOf(providerOrderId);
      let taken = attempts.filter((p) => TAKEN.includes(p.status));
      if (!taken.length) {
        const held = attempts.find((p) => p.status === 'authorized');
        if (held) {
          try {
            const captured = await call(`/payments/${encodeURIComponent(held.id)}/capture`, { method: 'POST', body: { amount: held.amount, currency: held.currency ?? 'INR' } });
            if (TAKEN.includes(captured.status)) taken = [captured];
          } catch {
            // asked again on the next check
          }
        }
      }
      if (taken.length) {
        return { state: 'PAID', amountPaise: taken.reduce((s, p) => s + Number(p.amount), 0), mode: taken[0].method ?? null, transactionId: taken[0].id ?? null, errorCode: null };
      }
      const failed = attempts.find((p) => p.status === 'failed');
      return { state: 'PENDING', amountPaise: null, mode: null, errorCode: failed?.error_code ?? null };
    },

    /**
     * Refunds part of what an order's payment took. Our refund id goes as the receipt, which
     * Razorpay keeps unique per payment: a refund already made for it is answered, not
     * repeated. A refusal (no balance, nothing captured) is final, so it comes back as FAILED
     * with Razorpay's reason for the admins; only "not answering" is tried again later.
     */
    async refund({ merchantRefundId, amountPaise, providerOrderId }) {
      try {
        const paid = await takenPayment(providerOrderId);
        const known = await refundByReceipt(paid.id, merchantRefundId);
        if (known) return refundAnswer(known);
        const data = await call(`/payments/${encodeURIComponent(paid.id)}/refund`, { method: 'POST', body: { amount: amountPaise, speed: 'normal', receipt: merchantRefundId, notes: { merchant_refund_id: merchantRefundId } } });
        return refundAnswer(data);
      } catch (err) {
        if (err.code !== 'PAYMENT_PROVIDER_REFUSED') throw err;
        return { providerRefundId: null, state: 'FAILED', errorCode: String(err.providerCode ?? 'REFUSED') };
      }
    },

    async refundStatus(merchantRefundId, { providerRefundId, providerOrderId } = {}) {
      if (providerRefundId) return refundAnswer(await call(`/refunds/${encodeURIComponent(providerRefundId)}`));
      const paid = await takenPayment(providerOrderId);
      const known = await refundByReceipt(paid.id, merchantRefundId);
      // Razorpay never made it (it was refused before it existed): an admin looks at it
      return known ? refundAnswer(known) : { providerRefundId: null, state: 'FAILED', errorCode: 'REFUND_NOT_CREATED' };
    },

    /**
     * A webhook is Razorpay's when X-Razorpay-Signature is the HMAC-SHA256 (hex) of the exact
     * body with the webhook secret set on the dashboard. Even then it is only a nudge: the
     * caller asks the API before changing anything. Returns the event and its ids, or null.
     */
    verifyWebhook(headers, rawBody) {
      const secret = env.RAZORPAY_WEBHOOK_SECRET;
      if (!secret) return null;
      const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
      const got = String(headers['x-razorpay-signature'] ?? '').trim().toLowerCase();
      if (got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) return null;
      let body;
      try {
        body = JSON.parse(rawBody.toString('utf8'));
      } catch {
        return null;
      }
      const payment = body.payload?.payment?.entity;
      const order = body.payload?.order?.entity;
      const refund = body.payload?.refund?.entity;
      const eventId = String(headers['x-razorpay-event-id'] ?? '').trim();
      return {
        event: String(body.event ?? ''),
        eventId: /^[\w-]{1,60}$/.test(eventId) ? eventId : null,
        merchantOrderId: order?.receipt ?? null,
        providerOrderId: payment?.order_id ?? order?.id ?? null,
        merchantRefundId: refund?.receipt ?? null,
        providerRefundId: refund?.id ?? null,
      };
    },

    /** What the browser needs to open Razorpay's window for an order still waiting to be paid. */
    checkoutFor(payment) {
      if (!enabled || payment.method !== 'RAZORPAY' || payment.status !== 'CREATED' || !payment.provider_payment_id) return null;
      return { provider: 'RAZORPAY', key: keyId, orderId: payment.provider_payment_id, amountPaise: payment.amount_paise, currency: 'INR' };
    },
  };
}
