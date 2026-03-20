// Refresh-token sessions shared by the public portals and the admin console (doc 16.1, 16.3).
// One token per device and app, stored hashed, replaced on every use; a used token that comes
// back was copied, so its whole family ends. Each kind ("web", "admin") has its own cookie and
// never accepts the other's tokens. Each session belongs to one portal (customer, seller,
// rider, reviewer or admin), and a refresh re-checks that the account still holds that role.
import { AppError } from './AppError.js';
import { newRefreshToken, hashToken, newFamilyId } from './tokens.js';
import { userModel } from '../models/identity/user.js';
import { userRoleModel } from '../models/identity/userRole.js';
import { refreshTokenModel } from '../models/identity/refreshToken.js';
import { auditLogModel } from '../models/identity/auditLog.js';

// two tabs refreshing at the same moment both send the same cookie; within this window the
// second gets an access token without a new cookie, instead of being treated as theft
const RACE_GRACE_MS = 10_000;

/**
 * Starts a new token family for this device. Returns the raw token for the cookie.
 * expiresAt is fixed for the family: rotation never extends it.
 */
export async function startSession(trx, { kind, portal, userId, deviceId, userAgent = null, expiresAt, mfaAt = null, amr = null }) {
  await refreshTokenModel.revokeDevice(trx, userId, deviceId, kind);
  const raw = newRefreshToken();
  await refreshTokenModel.create(trx, { kind, portal, userId, familyId: newFamilyId(), deviceId, userAgent, tokenHash: hashToken(raw), expiresAt, mfaAt, amr: amr?.join(',') ?? null });
  return raw;
}

/**
 * Turns a refresh cookie into { user, row, next }. next is the new raw token, or null when
 * another tab already rotated this one (the browser holds the new cookie). Throws an
 * AppError for every way a session can be over; clear() is called first so the stale
 * cookie is removed.
 */
export async function rotateSession(db, raw, { kind, clear }) {
  const end = (status, code, message) => {
    clear();
    return new AppError(status, code, message);
  };
  if (!raw) throw new AppError(401, 'NO_SESSION', 'No active session');
  const row = await refreshTokenModel.findByHash(db, hashToken(raw));
  if (!row || row.kind !== kind) throw end(401, 'NO_SESSION', 'No active session');
  if (row.revoked_at) throw end(401, 'SESSION_ENDED', 'Please sign in again');

  const user = await userModel.findById(db, row.user_id);
  if (!user || user.status !== 'active') {
    await refreshTokenModel.revokeUser(db, row.user_id);
    throw end(403, 'ACCOUNT_SUSPENDED', 'This account is suspended. Contact support.');
  }
  const membership = await userRoleModel.find(db, row.user_id, row.portal);
  if (!membership || membership.status !== 'active') {
    await refreshTokenModel.revokeFamily(db, row.family_id);
    throw end(403, 'ROLE_NOT_ACTIVE', `This account can no longer use the ${row.portal} portal`);
  }
  if (row.used_at) {
    if (Date.now() - new Date(row.used_at).getTime() < RACE_GRACE_MS) return { user, row, next: null };
    // a used token came back: it was copied. End every session in this family.
    await refreshTokenModel.revokeFamily(db, row.family_id);
    await auditLogModel.append(db, { actorId: row.user_id, action: `${kind === 'admin' ? 'admin' : 'auth'}.refresh.reuse_detected`, target: `family:${row.family_id}` });
    throw end(401, 'TOKEN_REUSED', 'For your safety you have been signed out. Please sign in again.');
  }
  if (new Date(row.expires_at) <= new Date()) throw end(401, 'SESSION_EXPIRED', 'Please sign in again');

  const next = newRefreshToken();
  const rotated = await db.transaction(async (trx) => {
    if (!(await refreshTokenModel.use(trx, row.id))) return false;
    await refreshTokenModel.create(trx, {
      kind,
      portal: row.portal,
      userId: row.user_id,
      familyId: row.family_id,
      deviceId: row.device_id,
      userAgent: row.user_agent,
      tokenHash: hashToken(next),
      expiresAt: row.expires_at,
      mfaAt: row.mfa_at,
      amr: row.amr,
    });
    return true;
  });
  // lost a race with another request using the same cookie: answer like the grace path
  return { user, row, next: rotated ? next : null };
}

/** Ends the family of this cookie, if any. Returns the row it found. */
export async function endSession(db, raw) {
  if (!raw) return null;
  const row = await refreshTokenModel.findByHash(db, hashToken(raw));
  if (row) await refreshTokenModel.revokeFamily(db, row.family_id);
  return row;
}

/** amr as stored ("pwd,totp") back to a list. */
export const amrOf = (row) => (row?.amr ? row.amr.split(',') : []);
