// identity.mfa_totp: a person's authenticator secret (AES-256-GCM encrypted), the last time
// step used, so a code works once, and the lockout after five wrong codes. Any role can
// enrol; admins and reviewers must (shared/domain/permissions.js).
const TABLE = 'mfa_totp';

export const mfaTotpModel = {
  find: (db, userId) => db(TABLE).where({ user_id: userId }).first(),
  /** Replaces any earlier secret: enrolment and a reset both end here. */
  enrol: (db, userId, secretEnc) =>
    db(TABLE).insert({ user_id: userId, secret_enc: secretEnc, enrolled_at: new Date(), last_step: null, failed_count: 0, locked_until: null }).onConflict('user_id').merge(),
  remove: (db, userId) => db(TABLE).where({ user_id: userId }).del(),
  /** Records a good code: the step can never be used again, and the failure count resets. */
  passed: (db, userId, step) =>
    db(TABLE).where({ user_id: userId }).andWhere((q) => q.whereNull('last_step').orWhere('last_step', '<', step)).update({ last_step: step, failed_count: 0, locked_until: null }).then((n) => n === 1),
  passedWithRecovery: (db, userId) => db(TABLE).where({ user_id: userId }).update({ failed_count: 0, locked_until: null }),
  /** Counts a wrong code; the fifth locks the account until lockedUntil. Returns the new count. */
  failed: async (db, userId, { maxFailures, lockedUntil }) => {
    await db(TABLE)
      .where({ user_id: userId })
      // MySQL applies SET left to right, so locked_until must read failed_count before it changes
      .update({
        locked_until: db.raw('IF(failed_count + 1 >= ?, ?, locked_until)', [maxFailures, lockedUntil]),
        failed_count: db.raw('IF(failed_count + 1 >= ?, 0, failed_count + 1)', [maxFailures]),
      });
    return db(TABLE).where({ user_id: userId }).first('failed_count', 'locked_until');
  },
};
