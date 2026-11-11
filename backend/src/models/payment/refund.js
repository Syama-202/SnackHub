// payment.refunds: money going back to the customer, full or partial (doc 10.9, 10.7).
const TABLE = 'refunds';

export const refundModel = {
  listByPayment: (db, paymentId) => db(TABLE).where({ payment_id: paymentId }).orderBy('id'),
  create: (db, { paymentId, complaintId = null, amountPaise }) =>
    db(TABLE).insert({ payment_id: paymentId, complaint_id: complaintId, amount_paise: amountPaise, status: 'PENDING', created_at: new Date() }).returning('id').then(([r]) => r.id),
  markProcessed: (db, id, providerRefundId) => db(TABLE).where({ id, status: 'PENDING' }).update({ status: 'PROCESSED', provider_refund_id: providerRefundId }),
  markFailed: (db, id) => db(TABLE).where({ id, status: 'PENDING' }).update({ status: 'FAILED' }),
};
