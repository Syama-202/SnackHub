// identity.refresh_tokens: one live token per device and app, stored hashed (doc 16.1).
// Using a token marks it used and issues the next one in the same family. A token that is
// used twice means it was stolen or replayed, so the whole family is revoked. Each row
// remembers its portal, so a refreshed access token never carries a different role.
const TABLE = 'refresh_tokens';

export const refreshTokenModel = {
  // kind: "web" (customer, seller and rider portals) or "admin" (admin console);
  // mfaAt: when the person passed the second factor; amr: how they signed in ("pwd,totp")
  create: (db, { kind = 'web', portal, userId, familyId, deviceId, userAgent = null, tokenHash, expiresAt, mfaAt = null, amr = null }) =>
    db(TABLE)
      .insert({
        kind,
        portal,
        user_id: userId,
        family_id: familyId,
        device_id: deviceId,
        user_agent: userAgent ? String(userAgent).slice(0, 160) : null,
        token_hash: tokenHash,
        created_at: new Date(),
        expires_at: expiresAt,
        mfa_at: mfaAt,
        amr,
      })
      .returning('id').then(([r]) => r.id),
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
  /** Ends one of a person's sessions by its family; false if it is not theirs or already over. */
  revokeFamilyOf: (db, userId, familyId) =>
    db(TABLE).where({ family_id: familyId, user_id: userId }).whereNull('revoked_at').update({ revoked_at: new Date() }).then((n) => n > 0),
  /** A new sign-in on a device ends that device's older sessions, never other devices'. */
  revokeDevice: (db, userId, deviceId, kind = 'web') => db(TABLE).where({ user_id: userId, device_id: deviceId, kind }).whereNull('revoked_at').update({ revoked_at: new Date() }),
  /** Every session of the user ("sign out everywhere"); kind limits it to one app. */
  revokeUser: (db, userId, kind) =>
    db(TABLE)
      .where({ user_id: userId })
      .modify((q) => kind && q.where({ kind }))
      .whereNull('revoked_at')
      .update({ revoked_at: new Date() }),
  /**
   * The person's live sessions, one per family: when it started, when it was last refreshed,
   * the portal and the browser. Never the token.
   */
  listLive: (db, userId) =>
    db(TABLE)
      .where({ user_id: userId })
      .whereNull('revoked_at')
      .andWhere('expires_at', '>', new Date())
      .groupBy('family_id')
      .select('family_id', db.raw('MIN(created_at) AS started_at'), db.raw('MAX(created_at) AS last_used_at'), db.raw('MIN(portal) AS portal'), db.raw('MIN(kind) AS kind'), db.raw('MIN(device_id) AS device_id'), db.raw('MIN(user_agent) AS user_agent'))
      .havingRaw('COUNT(*) FILTER (WHERE used_at IS NULL) > 0')
      .orderBy('last_used_at', 'desc'),
  /** A step-up code renews the second-factor time for the live token of a family. */
  setMfaAt: (db, familyId, mfaAt) => db(TABLE).where({ family_id: familyId }).whereNull('used_at').whereNull('revoked_at').update({ mfa_at: mfaAt }),
  purgeExpired: (db, batch = 5000) => db(TABLE).whereIn('id', db(TABLE).select('id').where('expires_at', '<', new Date()).limit(batch)).del(),
};
