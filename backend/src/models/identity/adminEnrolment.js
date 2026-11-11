// identity.admin_enrolments: one-time links that let an admin add the authenticator app.
// The link holds a random token (stored hashed) and expires after 15 minutes (doc 16.3).
const TABLE = 'admin_enrolments';

export const adminEnrolmentModel = {
  create: (db, { userId, tokenHash, secretEnc, expiresAt }) =>
    db(TABLE).insert({ user_id: userId, token_hash: tokenHash, secret_enc: secretEnc, created_at: new Date(), expires_at: expiresAt }).returning('id').then(([r]) => r.id),
  /** A link that is unused and not expired, or undefined. */
  findLive: (db, tokenHash) => db(TABLE).where({ token_hash: tokenHash }).whereNull('used_at').andWhere('expires_at', '>', new Date()).first(),
  use: (db, id) => db(TABLE).where({ id }).whereNull('used_at').update({ used_at: new Date() }).then((n) => n === 1),
  /** Older links stop working when a new one is made. */
  expireForUser: (db, userId) => db(TABLE).where({ user_id: userId }).whereNull('used_at').update({ used_at: new Date() }),
};
