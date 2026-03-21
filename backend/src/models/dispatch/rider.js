// dispatch.riders: who is online, and where they last were. Being online is separate from
// being verified: docs_valid_until (the earliest expiry among the rider's required approved
// documents) keeps an online rider out of every assignment once a licence or insurance lapses.
const TABLE = 'riders';
const today = () => new Date().toISOString().slice(0, 10);
const docsValid = (q) => q.whereNull('docs_valid_until').orWhere('docs_valid_until', '>=', today());

export const riderModel = {
  findById: (db, id) => db(TABLE).where({ id }).first(),
  findByUser: (db, userId) => db(TABLE).where({ user_id: userId }).first(),
  /** Riders an order may be offered to: online, with a known position and valid documents. */
  listOnlineInCity: (db, city) => db(TABLE).where({ city, status: 'ONLINE' }).whereNotNull('last_lat').andWhere(docsValid).orderBy('id'),
  /**
   * The rider row for an approved application. riders.id has no auto-increment (the seed
   * fixes ids), so the next id is taken under a lock inside the approval transaction.
   */
  createApproved: async (trx, { userId, name, city, vehicle }) => {
    const [[{ next }]] = await trx.raw(`SELECT COALESCE(MAX(id), 0) + 1 AS next FROM ${TABLE} FOR UPDATE`);
    await trx(TABLE).insert({ id: next, user_id: userId, name, city, vehicle, status: 'OFFLINE' });
    return next;
  },
  setStatus: (db, id, status) => db(TABLE).where({ id }).update({ status }),
  /**
   * Riders a real order may be offered to: online or on a delivery, with a position and valid
   * documents. Demo riders from the seed never get a real order.
   */
  listDispatchable: (db) => db(TABLE).whereIn('status', ['ONLINE', 'BUSY']).where({ is_demo: false }).whereNotNull('last_lat').andWhere(docsValid).orderBy('id'),
  listByIds: (db, ids) => (ids.length ? db(TABLE).whereIn('id', ids) : Promise.resolve([])),
  setDocsValidUntil: (db, id, date) => db(TABLE).where({ id }).update({ docs_valid_until: date }),
  /** Expired documents take a rider offline at once (the daily expiry job). */
  offlineWithExpiredDocs: (db) => db(TABLE).whereIn('status', ['ONLINE']).andWhere('docs_valid_until', '<', today()).update({ status: 'OFFLINE' }),
  setPosition: (db, id, { lat, lng }) => db(TABLE).where({ id }).update({ last_lat: lat, last_lng: lng, last_seen_at: new Date() }),
};
