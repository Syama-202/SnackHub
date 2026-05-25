// POST /api/v1/webhooks/phonepe: a nudge from PhonePe that an order or refund changed.
// 1. The Authorization header must match the dashboard credentials, or 401.
// 2. The exact body is recorded once (its SHA-256 is the event id: PhonePe sends no id of its
//    own and may deliver the same event more than once); a repeat is answered 200 and ignored.
// 3. It is answered at once (PhonePe wants 2xx within a few seconds), then the payment or
//    refund is settled from the status API, never from the body.
import { createHash } from 'node:crypto';
import { gateway, settlePayment, settleRefund } from '../utils/payments.js';
import { paymentModel } from '../models/payment/payment.js';
import { webhookEventModel } from '../models/payment/webhookEvent.js';

export function webhooksController({ dbs, logger }) {
  async function phonepe(req, res) {
    const provider = gateway.provider;
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const hook = provider?.name === 'PHONEPE' ? provider.verifyWebhook(req.headers, raw) : null;
    if (!hook) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Not a PhonePe webhook' } });
    const eventId = createHash('sha256').update(raw).digest('hex');
    const fresh = await webhookEventModel.record(dbs.payment, { eventId, type: hook.event.slice(0, 60) || 'unknown', payload: { merchantOrderId: hook.merchantOrderId, merchantRefundId: hook.merchantRefundId } });
    res.json({ ok: true });
    if (!fresh) return;
    try {
      if (hook.merchantRefundId) await settleRefund(dbs, hook.merchantRefundId);
      else if (hook.merchantOrderId) {
        const p = await paymentModel.findByProviderOrder(dbs.payment, hook.merchantOrderId);
        if (p) await settlePayment(dbs, p);
      }
      await webhookEventModel.markProcessed(dbs.payment, eventId);
    } catch (err) {
      // left unprocessed; the reconciler settles the payment from the status API anyway
      logger?.warn({ webhook: 'phonepe', reason: err.code ?? err.message }, 'webhook not settled');
    }
  }
  return { phonepe };
}
