// identity.addresses: saved delivery addresses. Every query is scoped to the owner, so one
// customer can never read or delete another customer's address.
const TABLE = 'addresses';

export const addressModel = {
  listByUser: (db, userId) => db(TABLE).where({ user_id: userId }).orderBy('id'),
  findForUser: (db, id, userId) => db(TABLE).where({ id, user_id: userId }).first(),
  create: (db, userId, { label, line, city = null, lat, lng }) => db(TABLE).insert({ user_id: userId, label, line, city, lat, lng }).then(([id]) => id),
  removeForUser: (db, id, userId) => db(TABLE).where({ id, user_id: userId }).delete(),
};
