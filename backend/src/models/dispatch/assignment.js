import { attempt, isUniqueViolation } from '../../db/errors.js';
// dispatch.assignments: offers to riders (doc 10.2). The table allows one ACCEPTED row per
// order, so if two riders accept at once the second accept fails and that rider is told.
const TABLE = 'assignments';

export const assignmentModel = {
  offer: (db, orderId, riderId) => db(TABLE).insert({ order_id: orderId, rider_id: riderId, status: 'OFFERED', offered_at: new Date() }).returning('id').then(([r]) => r.id),
  listOpenForRider: (db, riderId) => db(TABLE).where({ rider_id: riderId, status: 'OFFERED' }).orderBy('offered_at'),
  /** Accepts an open offer; false if it is no longer open or another rider took the order. */
  accept: async (db, id, riderId) => {
    try {
      // in its own savepoint: losing the race must not spoil the caller's transaction
      const n = await attempt(db, (d) => d(TABLE).where({ id, rider_id: riderId, status: 'OFFERED' }).update({ status: 'ACCEPTED', responded_at: new Date() }));
      return n === 1;
    } catch (err) {
      if (isUniqueViolation(err)) return false;
      throw err;
    }
  },
  decline: (db, id, riderId) => db(TABLE).where({ id, rider_id: riderId, status: 'OFFERED' }).update({ status: 'DECLINED', responded_at: new Date() }),
  /** Closes every other open offer once an order has its rider, or when it ends. */
  expireOthers: (db, orderId) => db(TABLE).where({ order_id: orderId, status: 'OFFERED' }).update({ status: 'EXPIRED', responded_at: new Date() }),
  findAccepted: (db, orderId) => db(TABLE).where({ order_id: orderId, status: 'ACCEPTED' }).first(),
  findForRider: (db, id, riderId) => db(TABLE).where({ id, rider_id: riderId }).first(),
  hasOpen: (db, orderId) => db(TABLE).where({ order_id: orderId, status: 'OFFERED' }).first('id').then(Boolean),
  /** Riders already asked about this order: nobody is asked twice. */
  riderIdsAsked: (db, orderId) => db(TABLE).where({ order_id: orderId }).pluck('rider_id'),
  /** Offers declined in the last day, per rider (each one costs 500 m in the ranking). */
  declinesToday: async (db, riderIds) => {
    if (!riderIds.length) return new Map();
    const rows = await db(TABLE).whereIn('rider_id', riderIds).where({ status: 'DECLINED' }).andWhere('responded_at', '>=', new Date(Date.now() - 86_400_000)).groupBy('rider_id').select('rider_id', db.raw('COUNT(*) AS n'));
    return new Map(rows.map((r) => [r.rider_id, Number(r.n)]));
  },
  /** Open offers made before the cutoff: they have timed out. */
  listOpenBefore: (db, before, limit = 50) => db(TABLE).where({ status: 'OFFERED' }).andWhere('offered_at', '<', before).orderBy('offered_at').limit(limit),
  expire: (db, id) => db(TABLE).where({ id, status: 'OFFERED' }).update({ status: 'EXPIRED', responded_at: new Date() }).then((n) => n === 1),
};
