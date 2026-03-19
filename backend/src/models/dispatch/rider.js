// dispatch.riders: who is online, and where they last were.
const TABLE = 'riders';

export const riderModel = {
  findById: (db, id) => db(TABLE).where({ id }).first(),
  findByUser: (db, userId) => db(TABLE).where({ user_id: userId }).first(),
  listOnlineInCity: (db, city) => db(TABLE).where({ city, status: 'ONLINE' }).whereNotNull('last_lat').orderBy('id'),
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
  setPosition: (db, id, { lat, lng }) => db(TABLE).where({ id }).update({ last_lat: lat, last_lng: lng, last_seen_at: new Date() }),
};
