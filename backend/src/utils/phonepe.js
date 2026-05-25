// PhonePe Standard Checkout v2, sandbox only (doc 10.9). One provider behind the
// PaymentProvider shape in utils/payments.js:
//   createPayment, orderStatus, refund, refundStatus, verifyWebhook
// The customer pays on PhonePe's own page (UPI apps, UPI QR, cards), so no UPI PIN or card
// number ever reaches SnackHub. The result is always read back from PhonePe's order-status
// API; a redirect or a webhook body alone never marks anything paid. Amounts are paise.
// The production host is deliberately absent: this app cannot take live payments.
import { createHash, timingSafeEqual } from 'node:crypto';
import { AppError } from './AppError.js';

export const PHONEPE_SANDBOX = 'https://api-preprod.phonepe.com/apis/pg-sandbox';
const TIMEOUT_MS = 10_000;

// PhonePe's order and refund states to ours
const ORDER_STATE = { COMPLETED: 'PAID', FAILED: 'FAILED', PENDING: 'PENDING' };
const REFUND_STATE = { COMPLETED: 'DONE', FAILED: 'FAILED', PENDING: 'PENDING' };

const unavailable = () => new AppError(503, 'PAYMENT_PROVIDER_DOWN', 'PhonePe is not answering. Try again in a minute, or pay on delivery.');

export function createPhonePe(env, { fetchImpl = globalThis.fetch, logger, base = PHONEPE_SANDBOX } = {}) {
  const enabled = Boolean(env.PHONEPE_CLIENT_ID && env.PHONEPE_CLIENT_SECRET);
  let token = null; // { value, expiresAt } in ms

  async function call(path, { method = 'GET', body, form, auth = true } = {}) {
    const headers = { Accept: 'application/json' };
    if (auth) headers.Authorization = `O-Bearer ${await accessToken()}`;
    if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    else if (body) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetchImpl(`${base}${path}`, { method, headers, body: form ? new URLSearchParams(form).toString() : body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      logger?.warn({ phonepe: 'unreachable', reason: err.name }, 'phonepe call failed');
      throw unavailable();
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && auth) token = null; // a revoked token: the next call fetches another
    if (!res.ok) {
      logger?.warn({ phonepe: 'error', status: res.status, code: data.code }, 'phonepe refused a call');
      const err = res.status >= 500 ? unavailable() : new AppError(502, 'PAYMENT_PROVIDER_REFUSED', 'PhonePe did not accept this payment. Try again, or pay on delivery.');
      err.providerCode = data.code ?? null;
      throw err;
    }
    return data;
  }

  /** The OAuth token, reused until five minutes before it expires. */
  async function accessToken() {
    if (token && token.expiresAt - 5 * 60_000 > Date.now()) return token.value;
    const data = await call('/v1/oauth/token', {
      method: 'POST',
      auth: false,
      form: { client_id: env.PHONEPE_CLIENT_ID, client_version: String(env.PHONEPE_CLIENT_VERSION), client_secret: env.PHONEPE_CLIENT_SECRET, grant_type: 'client_credentials' },
    });
    if (!data.access_token) throw unavailable();
    // expires_at is epoch seconds; without it, an hour
    token = { value: data.access_token, expiresAt: data.expires_at ? Number(data.expires_at) * 1000 : Date.now() + 3600_000 };
    return token.value;
  }

  const attemptOf = (details = []) => {
    const last = details.at(-1);
    return last ? { mode: last.paymentMode ?? null, transactionId: last.transactionId ?? null, errorCode: last.errorCode ?? null } : { mode: null, transactionId: null, errorCode: null };
  };

  return {
    name: 'PHONEPE',
    enabled,

    /** Starts a payment; returns PhonePe's order id and the page to send the customer to. */
    async createPayment({ merchantOrderId, amountPaise, redirectUrl, expireAfterSec }) {
      const data = await call('/checkout/v2/pay', {
        method: 'POST',
        body: { merchantOrderId, amount: amountPaise, expireAfter: expireAfterSec, paymentFlow: { type: 'PG_CHECKOUT', merchantUrls: { redirectUrl } } },
      });
      if (!data.redirectUrl || !data.orderId) throw unavailable();
      return { providerOrderId: data.orderId, redirectUrl: data.redirectUrl, expiresAt: data.expireAt ? Number(data.expireAt) : null };
    },

    /** PAID, FAILED or PENDING, with the amount PhonePe holds and how it was paid. */
    async orderStatus(merchantOrderId) {
      const data = await call(`/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status?details=false&errorContext=true`);
      const attempt = attemptOf(data.paymentDetails);
      return { state: ORDER_STATE[data.state] ?? 'PENDING', amountPaise: Number(data.amount), providerOrderId: data.orderId ?? null, ...attempt, errorCode: data.errorCode ?? attempt.errorCode };
    },

    async refund({ merchantRefundId, merchantOrderId, amountPaise }) {
      const data = await call('/payments/v2/refund', { method: 'POST', body: { merchantRefundId, originalMerchantOrderId: merchantOrderId, amount: amountPaise } });
      return { providerRefundId: data.refundId ?? null, state: REFUND_STATE[data.state] ?? 'PENDING' };
    },

    async refundStatus(merchantRefundId) {
      const data = await call(`/payments/v2/refund/${encodeURIComponent(merchantRefundId)}/status`);
      return { providerRefundId: data.refundId ?? null, state: REFUND_STATE[data.state] ?? 'PENDING', errorCode: data.errorCode ?? null };
    },

    /**
     * A webhook is PhonePe's when its Authorization header is SHA256("username:password") of
     * the credentials set on the dashboard. Even then it is only a nudge: the caller asks the
     * status API before changing anything. Returns the event and its ids, or null.
     */
    verifyWebhook(headers, rawBody) {
      if (!env.PHONEPE_WEBHOOK_USERNAME || !env.PHONEPE_WEBHOOK_PASSWORD) return null;
      const expected = createHash('sha256').update(`${env.PHONEPE_WEBHOOK_USERNAME}:${env.PHONEPE_WEBHOOK_PASSWORD}`).digest('hex');
      const got = String(headers.authorization ?? '').replace(/^SHA256\s*/i, '').trim().toLowerCase();
      if (got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) return null;
      let body;
      try {
        body = JSON.parse(rawBody.toString('utf8'));
      } catch {
        return null;
      }
      const p = body.payload ?? body;
      return { event: String(body.event ?? ''), merchantOrderId: p.merchantOrderId ?? p.originalMerchantOrderId ?? null, merchantRefundId: p.merchantRefundId ?? null };
    },
  };
}
