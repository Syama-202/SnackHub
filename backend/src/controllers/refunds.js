// Refunds the payment provider (Razorpay or PhonePe) refused (doc 10.9). The customer was told
// their refund is delayed; an admin sees each one here and sends it again once the cause is
// sorted (for example the account's balance was topped up and the provider now allows it):
//   GET  /admin/refunds/failed           refused refunds nobody has sent again yet
//   POST /admin/refunds/:id/retry        send it again (a new refund id; fresh second factor)
import { failedRefunds, gateway, retryRefund } from '../utils/payments.js';
import { AppError } from '../utils/AppError.js';
import { auditLogModel } from '../models/identity/auditLog.js';

export function refundsController({ dbs }) {
  async function failed(req, res) {
    res.json({ providerEnabled: gateway.enabled, provider: gateway.enabled ? gateway.provider.name : null, refunds: await failedRefunds(dbs) });
  }

  async function retry(req, res) {
    if (!gateway.enabled) throw new AppError(503, 'PAYMENT_PROVIDER_OFF', 'Online payments are not set up, so a refund cannot be sent');
    const newId = await retryRefund(dbs, req.params.id);
    await auditLogModel.append(dbs.identity, { actorId: req.user.userId, action: 'refund.retry', target: `refund:${req.params.id}`, before: { status: 'FAILED' }, after: { newRefundId: newId } });
    const sent = newId ? await dbs.payment('refunds').where({ id: newId }).first() : null;
    res.json({ refundId: newId, status: sent?.status ?? null, amountPaise: sent?.amount_paise ?? 0 });
  }

  return { failed, retry };
}
