// dispatch.assignments: offers to riders (doc 10.2). The table allows one ACCEPTED row per
// order, so if two riders accept at once the second accept fails and that rider is told.
const TABLE = 'assignments';
const DUPLICATE = 1062;

export const assignmentModel = {
  offer: (db, orderId, riderId) => db(TABLE).insert({ order_id: orderId, rider_id: riderId, status: 'OFFERED', offered_at: new Date() }).then(([id]) => id),
  listOpenForRider: (db, riderId) => db(TABLE).where({ rider_id: riderId, status: 'OFFERED' }).orderBy('offered_at'),
  /** Accepts an open offer; false if it is no longer open or another rider took the order. */
  accept: async (db, id, riderId) => {
    try {
      const n = await db(TABLE).where({ id, rider_id: riderId, status: 'OFFERED' }).update({ status: 'ACCEPTED', responded_at: new Date() });
      return n === 1;
    } catch (err) {
      if (err.errno === DUPLICATE) return false;
      throw err;
    }
  },
  decline: (db, id, riderId) => db(TABLE).where({ id, rider_id: riderId, status: 'OFFERED' }).update({ status: 'DECLINED', responded_at: new Date() }),
  /** Closes every other open offer once an order has its rider, or when it ends. */
  expireOthers: (db, orderId) => db(TABLE).where({ order_id: orderId, status: 'OFFERED' }).update({ status: 'EXPIRED', responded_at: new Date() }),
  findAccepted: (db, orderId) => db(TABLE).where({ order_id: orderId, status: 'ACCEPTED' }).first(),
};
