// identity.account_tokens: email verification and password reset links, and mobile codes.
// Only an HMAC of the token or code is stored, with the address it was sent to, so a link
// verifies only that address. Each one works once and expires.
const TABLE = 'account_tokens';

export const accountTokenModel = {
  create: (db, { userId, purpose, tokenHash, target, expiresAt }) =>
    db(TABLE).insert({ user_id: userId, purpose, token_hash: tokenHash, target, created_at: new Date(), expires_at: expiresAt }).returning('id').then(([r]) => r.id),
  /** A live token by its hash, or undefined. */
  findLive: (db, purpose, tokenHash) =>
    db(TABLE).where({ purpose, token_hash: tokenHash }).whereNull('used_at').andWhere('expires_at', '>', new Date()).first(),
  /** The newest live code of a user (mobile codes are looked up by user, then compared). */
  latestLive: (db, userId, purpose) =>
    db(TABLE).where({ user_id: userId, purpose }).whereNull('used_at').andWhere('expires_at', '>', new Date()).orderBy('id', 'desc').first(),
  /** Uses a token once; false if another request used it first. */
  use: (db, id) => db(TABLE).where({ id }).whereNull('used_at').update({ used_at: new Date() }).then((n) => n === 1),
  attempt: (db, id) => db(TABLE).where({ id }).increment('attempts', 1),
  /** Earlier links stop working when a new one is sent, or when the password changes. */
  expireForUser: (db, userId, purpose) => db(TABLE).where({ user_id: userId, purpose }).whereNull('used_at').update({ used_at: new Date() }),
  /** How many were sent since a moment: the resend limit. */
  countSince: (db, userId, purpose, since) => db(TABLE).where({ user_id: userId, purpose }).andWhere('created_at', '>', since).count('* as n').first().then((r) => Number(r.n)),
};
