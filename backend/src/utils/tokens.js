// Our own tokens (doc 16.1). The access token is a short JWT with the user id and role,
// kept in the browser's memory only. The refresh token is 32 random bytes in an httpOnly
// cookie; the database keeps only its SHA-256 hash.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';

const ISSUER = 'snackhub';
const AUDIENCE = 'snackhub-web';

/**
 * mfaAt: when an admin last passed the second factor (ms), carried as the mfa_at claim, with
 * amr (how they signed in). Admin tokens last ADMIN_ACCESS_MINUTES, others ACCESS_TOKEN_MINUTES.
 */
export function signAccessToken(env, user, { mfaAt, amr } = {}) {
  const claims = { role: user.role, ...(mfaAt ? { mfa_at: Math.floor(mfaAt / 1000) } : {}), ...(amr ? { amr } : {}) };
  return jwt.sign(claims, env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: String(user.id),
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: `${user.role === 'admin' ? env.ADMIN_ACCESS_MINUTES ?? 10 : env.ACCESS_TOKEN_MINUTES}m`,
  });
}

// The half-session after the Google step (doc 16.3): a different audience, so no API that
// checks access tokens accepts it. It only carries who and which device, for five minutes.
const HALF_AUDIENCE = 'snackhub-admin-mfa';
export const signHalfToken = (env, userId, deviceId) =>
  jwt.sign({ mfa_pending: true, device: deviceId }, env.JWT_SECRET, { algorithm: 'HS256', subject: String(userId), issuer: ISSUER, audience: HALF_AUDIENCE, expiresIn: '5m' });
export function verifyHalfToken(env, token) {
  const p = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], issuer: ISSUER, audience: HALF_AUDIENCE });
  return { userId: Number(p.sub), deviceId: p.device };
}

/** Returns { userId, role, mfaAt }; throws if the token is invalid or expired. */
export function verifyAccessToken(env, token) {
  const p = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
  return { userId: Number(p.sub), role: p.role, mfaAt: p.mfa_at ? p.mfa_at * 1000 : null };
}

export const newRefreshToken = () => randomBytes(32).toString('base64url');
export const hashToken = (raw) => createHash('sha256').update(raw).digest('hex');
export const newFamilyId = () => randomUUID();
