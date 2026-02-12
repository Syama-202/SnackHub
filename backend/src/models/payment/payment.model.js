// payment.payments: one payment per order (doc 10.9). A status changes only from the
// status the caller expects, so a late or repeated webhook cannot move it backwards.
const TABLE = 'payments';

export const paymentModel = {
  findByOrder: (db, orderId) => db(TABLE).where({ order_id: orderId }).first(),
  findByProviderOrder: (db, providerOrderId) => db(TABLE).where({ provider_order_id: providerOrderId }).first(),
  create: (db, p) => {
    const now = new Date();
    return db(TABLE).insert({ ...p, created_at: now, updated_at: now }).then(([id]) => id);
  },
  /** from may be one status or a list; returns false if the payment was not in it. */
  moveStatus: (db, id, from, to, set = {}) =>
    db(TABLE)
      .where({ id })
      .whereIn('status', [].concat(from))
      .update({ ...set, status: to, updated_at: new Date() })
      .then((n) => n === 1),
};
