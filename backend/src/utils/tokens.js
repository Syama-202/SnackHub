// Our own tokens (doc 16.1). The access token is a short JWT kept in the browser's memory
// only: the user id, the one role of the portal it was issued for, when the second factor
// was passed and how the person signed in. The refresh token is 32 random bytes in an
// httpOnly cookie; the database keeps only its SHA-256 hash.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { STAFF_ROLES } from '../../../shared/domain/permissions.js';

const ISSUER = 'snackhub';
const AUDIENCE = 'snackhub-web';

/**
 * role: the portal's role, which the account must hold. mfaAt: when the person last passed
 * the second factor (ms), as the mfa_at claim; amr: how they signed in (["pwd", "totp"]).
 * Staff tokens last ADMIN_ACCESS_MINUTES, others ACCESS_TOKEN_MINUTES.
 */
export function signAccessToken(env, user, { role, mfaAt, amr } = {}) {
  const r = role ?? user.role;
  if (!r) throw new Error('signAccessToken needs the portal role');
  const claims = { role: r, ...(mfaAt ? { mfa_at: Math.floor(mfaAt / 1000) } : {}), ...(amr ? { amr } : {}) };
  return jwt.sign(claims, env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: String(user.id),
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: `${STAFF_ROLES.includes(r) ? env.ADMIN_ACCESS_MINUTES ?? 10 : env.ACCESS_TOKEN_MINUTES}m`,
  });
}

/** Returns { userId, role, mfaAt, amr }; throws if the token is invalid, expired or for another audience. */
export function verifyAccessToken(env, token) {
  const p = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
  if (!/^\d+$/.test(String(p.sub)) || typeof p.role !== 'string') throw new Error('Malformed token');
  return { userId: Number(p.sub), role: p.role, mfaAt: p.mfa_at ? p.mfa_at * 1000 : null, amr: Array.isArray(p.amr) ? p.amr : [] };
}

export const newRefreshToken = () => randomBytes(32).toString('base64url');
export const hashToken = (raw) => createHash('sha256').update(raw).digest('hex');
export const newFamilyId = () => randomUUID();
