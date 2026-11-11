// ordering.favourites: snacks a customer saved. Every query is scoped to the customer.
const TABLE = 'favourites';

export const favouriteModel = {
  listIds: (db, customerId) => db(TABLE).where({ customer_id: customerId }).orderBy('created_at', 'desc').pluck('product_id').then((ids) => ids.map(Number)),
  count: (db, customerId) => db(TABLE).where({ customer_id: customerId }).count({ n: '*' }).then(([r]) => Number(r.n)),
  /** Adds once; saving the same snack again changes nothing. */
  add: (db, customerId, productId) => db(TABLE).insert({ customer_id: customerId, product_id: productId, created_at: new Date() }).onConflict(['customer_id', 'product_id']).ignore(),
  remove: (db, customerId, productId) => db(TABLE).where({ customer_id: customerId, product_id: productId }).delete(),
};
