// ordering.customer_credits: credit given after a valid complaint, spent on a later order.
const TABLE = 'customer_credits';

export const customerCreditModel = {
  listUsable: (db, customerId) => db(TABLE).where({ customer_id: customerId }).whereNull('used_order_id').andWhere('expires_at', '>=', db.raw('CURRENT_DATE')).orderBy('expires_at'),
  create: (db, { customerId, complaintId = null, amountPaise, expiresAt }) =>
    db(TABLE).insert({ customer_id: customerId, complaint_id: complaintId, amount_paise: amountPaise, expires_at: expiresAt }).returning('id').then(([r]) => r.id),
  /** Spends one credit on an order; false if it was already used. */
  use: (db, id, orderId) => db(TABLE).where({ id }).whereNull('used_order_id').update({ used_order_id: orderId }).then((n) => n === 1),
};
