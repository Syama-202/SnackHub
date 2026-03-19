// Google sign-in and our own sessions (doc 16.1, prompt 2.3).
//   POST /auth/google   Google ID token in, our access token out, refresh cookie set
//   POST /auth/refresh  rotate the refresh cookie into a new access token
//   POST /auth/logout   end this device's session
// Google only ever creates customers. Sellers and riders keep the role an admin gave them;
// admins never get a token here, they sign in on the admin console with a second factor.
import { AppError } from '../utils/AppError.js';
import { signAccessToken } from '../utils/tokens.js';
import { startSession as newSession, rotateSession, endSession } from '../utils/sessions.js';
import { userModel } from '../models/identity/user.js';
import { auditLogModel } from '../models/identity/auditLog.js';

export const REFRESH_COOKIE = 'sh_refresh';

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role });

export function authController({ env, dbs, verifyGoogle }) {
  const db = dbs.identity;
  const cookieOptions = () => ({
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: env.REFRESH_TOKEN_DAYS * 24 * 3600_000,
  });
  const clearCookie = (res) => res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined });

  /** Starts a new token family for this device and sets the cookie. */
  async function startSession(trx, res, user, deviceId) {
    const raw = await newSession(trx, { kind: 'web', userId: user.id, deviceId, expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 3600_000) });
    res.cookie(REFRESH_COOKIE, raw, cookieOptions());
  }

  /** Finds the account for a verified Google identity, linking or creating as the rules allow. */
  async function accountFor(trx, google) {
    const bySub = await userModel.findByGoogleSub(trx, google.sub);
    if (bySub) return { user: bySub, how: 'returning' };
    const byEmail = await userModel.findByEmail(trx, google.email);
    if (byEmail) {
      // link an existing account only through a verified email, and never replace another Google link
      if (!(await userModel.linkGoogle(trx, byEmail.id, google.sub))) throw new AppError(409, 'ACCOUNT_LINKED_ELSEWHERE', 'This email is already linked to a different Google account');
      return { user: byEmail, how: 'linked' };
    }
    const id = await userModel.create(trx, { email: google.email, name: google.name, role: 'customer', googleSub: google.sub });
    return { user: await userModel.findById(trx, id), how: 'created' };
  }

  async function google(req, res) {
    if (!env.GOOGLE_CLIENT_ID) throw new AppError(503, 'GOOGLE_NOT_CONFIGURED', 'Google sign-in is not set up on this server yet');
    let identity;
    try {
      identity = await verifyGoogle(req.body.credential);
    } catch {
      throw new AppError(401, 'GOOGLE_TOKEN_INVALID', 'Google sign-in could not be checked. Please try again.');
    }
    if (!identity.emailVerified || !identity.email) throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Your Google email is not verified');

    const result = await db.transaction(async (trx) => {
      const { user, how } = await accountFor(trx, identity);
      if (user.status !== 'active') throw new AppError(403, 'ACCOUNT_BLOCKED', 'This account is blocked. Contact support.');
      if (user.role === 'admin') throw new AppError(403, 'ADMIN_CONSOLE_ONLY', 'Admins sign in on the admin console with a second factor');
      await startSession(trx, res, user, req.body.deviceId);
      await auditLogModel.append(trx, { actorId: user.id, action: `auth.google.${how}`, target: `user:${user.id}`, after: { role: user.role, deviceId: req.body.deviceId } });
      return user;
    });
    res.json({ accessToken: signAccessToken(env, result), user: publicUser(result) });
  }

  async function refresh(req, res) {
    const { user, row, next } = await rotateSession(db, req.cookies?.[REFRESH_COOKIE], { kind: 'web', clear: () => clearCookie(res) });
    if (next) res.cookie(REFRESH_COOKIE, next, { ...cookieOptions(), maxAge: new Date(row.expires_at).getTime() - Date.now() });
    res.json({ accessToken: signAccessToken(env, user), user: publicUser(user) });
  }

  async function logout(req, res) {
    const row = await endSession(db, req.cookies?.[REFRESH_COOKIE]);
    if (row) await auditLogModel.append(db, { actorId: row.user_id, action: 'auth.logout', target: `family:${row.family_id}` });
    clearCookie(res);
    res.status(204).end();
  }

  return { google, refresh, logout };
}
