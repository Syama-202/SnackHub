// ordering.order_reviews: one rating (1 to 5) per order, by its customer.
const TABLE = 'order_reviews';

export const orderReviewModel = {
  findByOrder: (db, orderId) => db(TABLE).where({ order_id: orderId }).first(),
  create: (db, { orderId, customerId, rating, tags = [], comment = null }) =>
    db(TABLE).insert({ order_id: orderId, customer_id: customerId, rating, tags: JSON.stringify(tags), comment, created_at: new Date() }),
};
