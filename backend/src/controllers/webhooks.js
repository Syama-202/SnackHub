// POST /api/v1/webhooks/razorpay and /api/v1/webhooks/phonepe: a nudge from the payment
// provider that an order, payment or refund changed.
// 1. The signature (Razorpay: X-Razorpay-Signature over the body; PhonePe: the Authorization
//    header) must match the secret set on the provider's dashboard, or 401.
// 2. The event is recorded once: by Razorpay's event id, or by the SHA-256 of the exact body
//    when the provider sends no id of its own. A repeat is answered 200 and ignored.
// 3. It is answered at once (providers want 2xx within a few seconds), then the payment or
//    refund is settled from the provider's API, never from the body.
import { createHash } from 'node:crypto';
import { gateway, settlePayment, settleRefund } from '../utils/payments.js';
import { paymentModel } from '../models/payment/payment.js';
import { webhookEventModel } from '../models/payment/webhookEvent.js';

export function webhooksController({ dbs, logger }) {
  /** The receiver for one provider; it answers 401 while another provider is in use. */
  function receiver(name, label) {
    return async (req, res) => {
      const provider = gateway.provider;
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
      const hook = provider?.name === name ? provider.verifyWebhook(req.headers, raw) : null;
      if (!hook) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: `Not a ${label} webhook` } });
      const eventId = hook.eventId ? `${name.toLowerCase()}:${hook.eventId}`.slice(0, 64) : createHash('sha256').update(raw).digest('hex');
      const ids = { merchantOrderId: hook.merchantOrderId ?? null, providerOrderId: hook.providerOrderId ?? null, merchantRefundId: hook.merchantRefundId ?? null, providerRefundId: hook.providerRefundId ?? null };
      const fresh = await webhookEventModel.record(dbs.payment, { eventId, type: hook.event.slice(0, 60) || 'unknown', payload: ids });
      res.json({ ok: true });
      if (!fresh) return;
      try {
        if (ids.merchantRefundId || ids.providerRefundId) await settleRefund(dbs, ids.merchantRefundId, ids.providerRefundId);
        else {
          const p = (ids.merchantOrderId && (await paymentModel.findByProviderOrder(dbs.payment, ids.merchantOrderId))) || (ids.providerOrderId && (await paymentModel.findByProviderPayment(dbs.payment, ids.providerOrderId)));
          if (p) await settlePayment(dbs, p);
        }
        await webhookEventModel.markProcessed(dbs.payment, eventId);
      } catch (err) {
        // left unprocessed; the reconciler settles the payment from the provider's API anyway
        logger?.warn({ webhook: name.toLowerCase(), reason: err.code ?? err.message }, 'webhook not settled');
      }
    };
  }
  return { razorpay: receiver('RAZORPAY', 'Razorpay'), phonepe: receiver('PHONEPE', 'PhonePe') };
}
