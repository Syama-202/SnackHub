// identity.addresses: saved delivery addresses. Every query is scoped to the owner, so one
// customer can never read, change or delete another customer's address. Changes to one
// customer's addresses run one at a time (the account row is locked), which keeps exactly one
// default and the address limit true even when two tabs save at once.
const TABLE = 'addresses';
const FIELDS = ['kind', 'label', 'line', 'house', 'floor', 'landmark', 'instructions', 'city', 'lat', 'lng'];

const pick = (fields) => Object.fromEntries(FIELDS.filter((k) => fields[k] !== undefined).map((k) => [k, fields[k]]));

// every change for one customer waits for the one before it
const lockOwner = (trx, userId) => trx('users').where({ id: userId }).forUpdate().first('id');

async function makeDefault(trx, id, userId) {
  // clear first: the unique key allows one default per customer at any moment
  await trx(TABLE).where({ user_id: userId, is_default: true }).whereNot({ id }).update({ is_default: false });
  await trx(TABLE).where({ id, user_id: userId }).update({ is_default: true });
}

export const addressModel = {
  listByUser: (db, userId) => db(TABLE).where({ user_id: userId }).orderBy([{ column: 'is_default', order: 'desc' }, 'id']),
  findForUser: (db, id, userId) => db(TABLE).where({ id, user_id: userId }).first(),

  /** Adds an address; the first one, or one asked for, becomes the default. Null when the limit is reached. */
  create: (db, userId, fields, { max, makeItDefault = false }) =>
    db.transaction(async (trx) => {
      await lockOwner(trx, userId);
      const [{ n }] = await trx(TABLE).where({ user_id: userId }).count({ n: '*' });
      if (Number(n) >= max) return null;
      const [id] = await trx(TABLE).insert({ user_id: userId, ...pick(fields), is_default: false });
      if (Number(n) === 0 || makeItDefault) await makeDefault(trx, id, userId);
      return id;
    }),

  /** Changes the given fields; false when the address is not this customer's. */
  update: (db, id, userId, fields, { makeItDefault = false } = {}) =>
    db.transaction(async (trx) => {
      await lockOwner(trx, userId);
      const row = await trx(TABLE).where({ id, user_id: userId }).first('id');
      if (!row) return false;
      const set = pick(fields);
      if (Object.keys(set).length) await trx(TABLE).where({ id, user_id: userId }).update({ ...set, updated_at: new Date() });
      if (makeItDefault) await makeDefault(trx, id, userId);
      return true;
    }),

  /** Deletes one; when it was the default, the oldest remaining address takes over. */
  removeForUser: (db, id, userId) =>
    db.transaction(async (trx) => {
      await lockOwner(trx, userId);
      const row = await trx(TABLE).where({ id, user_id: userId }).first('id', 'is_default');
      if (!row) return 0;
      await trx(TABLE).where({ id, user_id: userId }).delete();
      if (row.is_default) {
        const next = await trx(TABLE).where({ user_id: userId }).orderBy('id').first('id');
        if (next) await makeDefault(trx, next.id, userId);
      }
      return 1;
    }),
};
