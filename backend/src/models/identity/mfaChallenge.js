// identity.mfa_challenges: the step between a correct password (or Google) and a session.
// A random token (stored hashed) for one portal and one device, valid for five minutes,
// usable once, and dead after five wrong codes. No API that needs a session accepts it.
const TABLE = 'mfa_challenges';

export const mfaChallengeModel = {
  create: (db, { userId, portal, purpose, firstFactor, tokenHash, deviceId, expiresAt }) =>
    db(TABLE)
      .insert({ user_id: userId, portal, purpose, first_factor: firstFactor, token_hash: tokenHash, device_id: deviceId, created_at: new Date(), expires_at: expiresAt })
      .returning('id').then(([r]) => r.id),
  /** Unused, unexpired and with tries left, or undefined. */
  findLive: (db, tokenHash, maxAttempts) =>
    db(TABLE).where({ token_hash: tokenHash }).whereNull('used_at').andWhere('expires_at', '>', new Date()).andWhere('attempts', '<', maxAttempts).first(),
  attempt: (db, id) => db(TABLE).where({ id }).increment('attempts', 1),
  /** Ends the challenge; false if another request ended it first. */
  use: (db, id) => db(TABLE).where({ id }).whereNull('used_at').update({ used_at: new Date() }).then((n) => n === 1),
  /** A new sign-in ends that person's older challenges. */
  expireForUser: (db, userId) => db(TABLE).where({ user_id: userId }).whereNull('used_at').update({ used_at: new Date() }),
};
