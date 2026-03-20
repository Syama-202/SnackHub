// identity.recovery_codes: ten single-use codes per person with an authenticator app,
// stored only as hashes and shown once, when they are made.
const TABLE = 'recovery_codes';

export const recoveryCodeModel = {
  /** A new set replaces the old one. */
  replace: async (db, userId, hashes) => {
    await db(TABLE).where({ user_id: userId }).del();
    await db(TABLE).insert(hashes.map((code_hash) => ({ user_id: userId, code_hash, created_at: new Date() })));
  },
  /** Uses a code once; false if it does not exist, belongs to someone else or was used. */
  use: (db, userId, hash) => db(TABLE).where({ user_id: userId, code_hash: hash }).whereNull('used_at').update({ used_at: new Date() }).then((n) => n === 1),
  countLeft: (db, userId) => db(TABLE).where({ user_id: userId }).whereNull('used_at').count('* as n').first().then((r) => Number(r.n)),
  removeAll: (db, userId) => db(TABLE).where({ user_id: userId }).del(),
};
