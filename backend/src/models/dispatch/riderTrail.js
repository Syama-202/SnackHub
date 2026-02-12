// dispatch.rider_trail: GPS points during a delivery (doc 12.1b). Kept for two days only,
// which also protects rider privacy; the cleanup deletes in small batches.
const TABLE = 'rider_trail';

export const riderTrailModel = {
  append: (db, { orderId, riderId, lat, lng, at = new Date() }) => db(TABLE).insert({ order_id: orderId, rider_id: riderId, lat, lng, at }),
  listByOrder: (db, orderId) => db(TABLE).where({ order_id: orderId }).orderBy('at'),
  purgeOlderThan: (db, days = 2, batch = 5000) => db.raw(`DELETE FROM ${TABLE} WHERE at < NOW() - INTERVAL ? DAY LIMIT ?`, [days, batch]).then(([r]) => r.affectedRows),
};
