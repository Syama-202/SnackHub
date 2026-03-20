// identity.credentials: a password hash (Argon2id, never the password) and the lockout
// after repeated wrong passwords. Kept apart from the profile so a query for a person's
// name or email never touches it.
const TABLE = 'credentials';

export const credentialModel = {
  find: (db, userId) => db(TABLE).where({ user_id: userId }).first(),
  set: (db, userId, passwordHash) =>
    db(TABLE).insert({ user_id: userId, password_hash: passwordHash, changed_at: new Date(), failed_count: 0, locked_until: null }).onConflict('user_id').merge(),
  /** Counts a wrong password; the max-th locks the account until lockedUntil. Returns the row after. */
  failed: async (db, userId, { max, lockedUntil }) => {
    await db(TABLE)
      .where({ user_id: userId })
      // MySQL applies SET left to right, so locked_until must read failed_count before it changes
      .update({
        locked_until: db.raw('IF(failed_count + 1 >= ?, ?, locked_until)', [max, lockedUntil]),
        failed_count: db.raw('IF(failed_count + 1 >= ?, 0, failed_count + 1)', [max]),
      });
    return db(TABLE).where({ user_id: userId }).first('failed_count', 'locked_until');
  },
  passed: (db, userId) => db(TABLE).where({ user_id: userId }).update({ failed_count: 0, locked_until: null }),
};
