// Our own tokens (doc 16.1). The access token is a short JWT with the user id and role,
// kept in the browser's memory only. The refresh token is 32 random bytes in an httpOnly
// cookie; the database keeps only its SHA-256 hash.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';

const ISSUER = 'snackhub';
const AUDIENCE = 'snackhub-web';

export function signAccessToken(env, user) {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: String(user.id),
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: `${env.ACCESS_TOKEN_MINUTES}m`,
  });
}

/** Returns { userId, role }; throws if the token is invalid or expired. */
export function verifyAccessToken(env, token) {
  const p = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
  return { userId: Number(p.sub), role: p.role };
}

export const newRefreshToken = () => randomBytes(32).toString('base64url');
export const hashToken = (raw) => createHash('sha256').update(raw).digest('hex');
export const newFamilyId = () => randomUUID();
