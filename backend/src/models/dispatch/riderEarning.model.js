// dispatch.rider_earnings: one pay row per delivered order (doc 8.4). The amounts come from
// the shared penalty rules; the table refuses a negative total.
const TABLE = 'rider_earnings';

export const riderEarningModel = {
  findByOrder: (db, orderId) => db(TABLE).where({ order_id: orderId }).first(),
  listByRider: (db, riderId, limit = 50) => db(TABLE).where({ rider_id: riderId }).orderBy('created_at', 'desc').limit(limit),
  create: (db, e) => db(TABLE).insert({ ...e, created_at: new Date() }).then(([id]) => id),
  setStatus: (db, id, status) => db(TABLE).where({ id }).update({ status }),
};
