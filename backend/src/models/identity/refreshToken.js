// identity.refresh_tokens: one live token per device, stored hashed (doc 16.1). Using a
// token marks it used and issues the next one in the same family. A token that is used
// twice means it was stolen or replayed, so the whole family is revoked.
const TABLE = 'refresh_tokens';

export const refreshTokenModel = {
  create: (db, { userId, familyId, deviceId, tokenHash, expiresAt }) =>
    db(TABLE).insert({ user_id: userId, family_id: familyId, device_id: deviceId, token_hash: tokenHash, created_at: new Date(), expires_at: expiresAt }).then(([id]) => id),
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
  revokeDevice: (db, userId, deviceId) => db(TABLE).where({ user_id: userId, device_id: deviceId }).whereNull('revoked_at').update({ revoked_at: new Date() }),
  revokeUser: (db, userId) => db(TABLE).where({ user_id: userId }).whereNull('revoked_at').update({ revoked_at: new Date() }),
  purgeExpired: (db, batch = 5000) => db.raw(`DELETE FROM ${TABLE} WHERE expires_at < NOW(3) LIMIT ?`, [batch]).then(([r]) => r.affectedRows),
};
