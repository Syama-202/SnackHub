// identity.refresh_tokens: one live token per device, stored hashed (doc 16.1). Using a
// token marks it used and issues the next one in the same family. A token that is used
// twice means it was stolen or replayed, so the whole family is revoked.
const TABLE = 'refresh_tokens';

export const refreshTokenModel = {
  // kind: "web" (customer site) or "admin" (admin console); mfaAt: when the admin passed the second factor
  create: (db, { kind = 'web', userId, familyId, deviceId, tokenHash, expiresAt, mfaAt = null }) =>
    db(TABLE)
      .insert({ kind, user_id: userId, family_id: familyId, device_id: deviceId, token_hash: tokenHash, created_at: new Date(), expires_at: expiresAt, mfa_at: mfaAt })
      .then(([id]) => id),
  findByHash: (db, tokenHash) => db(TABLE).where({ token_hash: tokenHash }).first(),
  /** Marks a live token used; false if it was already used, revoked or expired. */
  use: (db, id) =>
    db(TABLE)
      .where({ id })
      .whereNull('used_at')
      .whereNull('revoked_at')
      .andWhere('expires_at', '>', new Date())
      .update({ used_at: new Date() })
      .then((n) => n === 1),
  revokeFamily: (db, familyId) => db(TABLE).where({ family_id: familyId }).whereNull('revoked_at').update({ revoked_at: new Date() }),
  /** A new sign-in on a device ends that device's older sessions, never other devices'. */
  revokeDevice: (db, userId, deviceId, kind = 'web') => db(TABLE).where({ user_id: userId, device_id: deviceId, kind }).whereNull('revoked_at').update({ revoked_at: new Date() }),
  /** Every session of the user ("sign out everywhere"); kind limits it to one app. */
  revokeUser: (db, userId, kind) =>
    db(TABLE)
      .where({ user_id: userId })
      .modify((q) => kind && q.where({ kind }))
      .whereNull('revoked_at')
      .update({ revoked_at: new Date() }),
  /** A step-up code renews the second-factor time for the live token of a family. */
  setMfaAt: (db, familyId, mfaAt) => db(TABLE).where({ family_id: familyId }).whereNull('used_at').whereNull('revoked_at').update({ mfa_at: mfaAt }),
  purgeExpired: (db, batch = 5000) => db.raw(`DELETE FROM ${TABLE} WHERE expires_at < NOW(3) LIMIT ?`, [batch]).then(([r]) => r.affectedRows),
};
