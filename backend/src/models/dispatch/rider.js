// dispatch.riders: who is online, and where they last were.
const TABLE = 'riders';

export const riderModel = {
  findById: (db, id) => db(TABLE).where({ id }).first(),
  findByUser: (db, userId) => db(TABLE).where({ user_id: userId }).first(),
  listOnlineInCity: (db, city) => db(TABLE).where({ city, status: 'ONLINE' }).whereNotNull('last_lat').orderBy('id'),
  setStatus: (db, id, status) => db(TABLE).where({ id }).update({ status }),
  setPosition: (db, id, { lat, lng }) => db(TABLE).where({ id }).update({ last_lat: lat, last_lng: lng, last_seen_at: new Date() }),
};
