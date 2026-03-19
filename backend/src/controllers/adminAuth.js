// Admin sign-in with a second factor (doc 16.3).
//   POST /admin/auth/google       Google ID token in; an admin gets a half-session (mfa_pending)
//   POST /admin/auth/mfa          half-session + TOTP or recovery code in; admin session out
//   POST /admin/auth/refresh      rotate the admin cookie; never later than 8 h after sign-in
//   POST /admin/auth/step-up      a fresh code for a sensitive action (5 minute rule)
//   POST /admin/auth/logout       end this device's session; /logout-all ends every one
//   POST /admin/auth/enrol/info   one-time enrolment link: the QR code to scan (token in the
//                                 body, never in a URL, so it stays out of the request log)
//   POST /admin/auth/enrol        first code from the app activates MFA, returns 10 recovery codes
// There is no admin sign-up: accounts come from `npm run create-admin`, which issues the link.
import QRCode from 'qrcode';
import { AppError } from '../utils/AppError.js';
import { signAccessToken, signHalfToken, verifyHalfToken } from '../utils/tokens.js';
import { startSession, rotateSession, endSession } from '../utils/sessions.js';
import { decryptSecret, encryptSecret, totpStep, otpauthUrl, newRecoveryCodes, hashCode, hashToken, newLinkToken, newTotpSecret } from '../utils/mfa.js';
import { userModel } from '../models/identity/user.js';
import { auditLogModel } from '../models/identity/auditLog.js';
import { refreshTokenModel } from '../models/identity/refreshToken.js';
import { adminMfaModel } from '../models/identity/adminMfa.js';
import { adminRecoveryCodeModel } from '../models/identity/adminRecoveryCode.js';
import { adminEnrolmentModel } from '../models/identity/adminEnrolment.js';
import { outboxModel } from '../models/outbox.js';

export const ADMIN_COOKIE = 'sh_admin_refresh';
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const LINK_MINUTES = 15;
const TOTP_FORMAT = /^\d{6}$/;
const RECOVERY_FORMAT = /^[a-z2-9]{4}-[a-z2-9]{4}$/i;

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role });

/** A one-time enrolment link for an admin (create-admin and the owner's MFA reset use it). */
export async function issueEnrolmentLink(env, db, userId) {
  const raw = newLinkToken();
  await db.transaction(async (trx) => {
    await adminEnrolmentModel.expireForUser(trx, userId);
    await adminEnrolmentModel.create(trx, { userId, tokenHash: hashToken(raw), secretEnc: encryptSecret(env, newTotpSecret()), expiresAt: new Date(Date.now() + LINK_MINUTES * 60_000) });
  });
  return `${env.ADMIN_CONSOLE_URL}/enrol?token=${raw}`;
}

export function adminAuthController({ env, dbs, verifyGoogle }) {
  const db = dbs.identity;
  // no "remember me": the cookie lives only as long as the session, at most ADMIN_SESSION_HOURS
  const cookieOptions = (maxAge) => ({ httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'strict', path: '/api/v1/admin/auth', maxAge });
  const clearCookie = (res) => res.clearCookie(ADMIN_COOKIE, { ...cookieOptions(), maxAge: undefined });
  const alert = (trx, type, payload) => outboxModel.add(trx, 'admin.alert', { type, ...payload });

  /** The active admin behind an id, or a refusal. */
  async function activeAdmin(id) {
    const user = await userModel.findById(db, id);
    if (!user || user.role !== 'admin' || user.status !== 'active') throw new AppError(403, 'NOT_AN_ADMIN', 'This account is not on the admin list');
    return user;
  }

  /**
   * Checks a TOTP or recovery code. A TOTP code works once (its time step is stored);
   * five wrong codes lock the account for 15 minutes and raise an alert. Returns the factor.
   */
  async function secondFactor(userId, rawCode) {
    const code = String(rawCode ?? '').trim();
    const row = await adminMfaModel.find(db, userId);
    if (!row) throw new AppError(403, 'MFA_NOT_ENROLLED', 'Set up your authenticator app with the enrolment link first');
    if (row.locked_until && new Date(row.locked_until) > new Date()) {
      const min = Math.ceil((new Date(row.locked_until) - Date.now()) / 60_000);
      throw new AppError(423, 'MFA_LOCKED', `Too many wrong codes. Try again in ${min} minute${min === 1 ? '' : 's'}.`);
    }
    if (TOTP_FORMAT.test(code)) {
      const step = totpStep(decryptSecret(env, row.secret_enc), code);
      if (step !== null && (await adminMfaModel.passed(db, userId, step))) return 'totp';
    } else if (RECOVERY_FORMAT.test(code) && (await adminRecoveryCodeModel.use(db, userId, hashCode(code)))) {
      await adminMfaModel.passedWithRecovery(db, userId);
      const left = await adminRecoveryCodeModel.countLeft(db, userId);
      await db.transaction(async (trx) => {
        await auditLogModel.append(trx, { actorId: userId, action: 'admin.recovery_code.used', target: `user:${userId}`, after: { left } });
        // the other admins hear about it (doc 16.3)
        await alert(trx, 'recovery_code_used', { userId, left });
      });
      return 'recovery';
    }
    const after = await adminMfaModel.failed(db, userId, { maxFailures: MAX_FAILURES, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) });
    const locked = after.locked_until && new Date(after.locked_until) > new Date();
    await db.transaction(async (trx) => {
      await auditLogModel.append(trx, { actorId: userId, action: locked ? 'admin.mfa.locked' : 'admin.mfa.failed', target: `user:${userId}` });
      if (locked) await alert(trx, 'mfa_locked', { userId });
    });
    if (locked) throw new AppError(423, 'MFA_LOCKED', `Too many wrong codes. Try again in ${LOCK_MINUTES} minutes.`);
    const left = MAX_FAILURES - after.failed_count;
    throw new AppError(401, 'MFA_INVALID', `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left before a ${LOCK_MINUTES} minute lock.`);
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

    let user = await userModel.findByGoogleSub(db, identity.sub);
    if (!user) {
      // an admin made by create-admin has no Google link yet: link it through the verified email
      const byEmail = await userModel.findByEmail(db, identity.email);
      if (byEmail?.role === 'admin') {
        if (!(await userModel.linkGoogle(db, byEmail.id, identity.sub))) throw new AppError(409, 'ACCOUNT_LINKED_ELSEWHERE', 'This email is already linked to a different Google account');
        user = byEmail;
      }
    }
    if (!user || user.role !== 'admin') {
      await auditLogModel.append(db, { actorId: user?.id ?? null, action: 'admin.login.refused', target: user ? `user:${user.id}` : null });
      throw new AppError(403, 'NOT_AN_ADMIN', 'This Google account is not on the admin list');
    }
    if (user.status !== 'active') throw new AppError(403, 'ACCOUNT_BLOCKED', 'This account is blocked');
    if (!(await adminMfaModel.find(db, user.id))) throw new AppError(403, 'MFA_NOT_ENROLLED', 'Set up your authenticator app with the enrolment link first');
    await auditLogModel.append(db, { actorId: user.id, action: 'admin.login.google', target: `user:${user.id}`, after: { deviceId: req.body.deviceId } });
    // the half-session: no admin route accepts it, it only allows the code step
    res.json({ mfaPending: true, halfToken: signHalfToken(env, user.id, req.body.deviceId), user: { name: user.name, email: user.email } });
  }

  async function mfa(req, res) {
    let half;
    try {
      half = verifyHalfToken(env, req.body.halfToken);
    } catch {
      throw new AppError(401, 'MFA_SESSION_EXPIRED', 'That took too long. Sign in with Google again.');
    }
    const user = await activeAdmin(half.userId);
    const factor = await secondFactor(user.id, req.body.code);
    const now = Date.now();
    const raw = await db.transaction(async (trx) => {
      const token = await startSession(trx, { kind: 'admin', userId: user.id, deviceId: half.deviceId, expiresAt: new Date(now + env.ADMIN_SESSION_HOURS * 3600_000), mfaAt: new Date(now) });
      await auditLogModel.append(trx, { actorId: user.id, action: 'admin.login', target: `user:${user.id}`, after: { amr: ['google', factor], deviceId: half.deviceId } });
      return token;
    });
    res.cookie(ADMIN_COOKIE, raw, cookieOptions(env.ADMIN_SESSION_HOURS * 3600_000));
    const amr = ['google', factor];
    res.json({ accessToken: signAccessToken(env, user, { mfaAt: now, amr }), user: publicUser(user), amr });
  }

  async function refresh(req, res) {
    const { user, row, next } = await rotateSession(db, req.cookies?.[ADMIN_COOKIE], { kind: 'admin', clear: () => clearCookie(res) });
    if (user.role !== 'admin') {
      // the role was taken away: end every admin session of this person
      await refreshTokenModel.revokeUser(db, user.id, 'admin');
      clearCookie(res);
      throw new AppError(403, 'NOT_AN_ADMIN', 'This account is no longer an admin');
    }
    if (next) res.cookie(ADMIN_COOKIE, next, cookieOptions(new Date(row.expires_at).getTime() - Date.now()));
    // the second-factor time is the one from sign-in or the last step-up, never "now"
    const mfaAt = row.mfa_at ? new Date(row.mfa_at).getTime() : null;
    res.json({ accessToken: signAccessToken(env, user, { mfaAt }), user: publicUser(user) });
  }

  async function stepUp(req, res) {
    const user = await activeAdmin(req.user.userId);
    const factor = await secondFactor(user.id, req.body.code);
    const now = Date.now();
    const raw = req.cookies?.[ADMIN_COOKIE];
    const row = raw && (await refreshTokenModel.findByHash(db, hashToken(raw)));
    if (row?.kind === 'admin' && row.user_id === user.id) await refreshTokenModel.setMfaAt(db, row.family_id, new Date(now));
    await auditLogModel.append(db, { actorId: user.id, action: 'admin.step_up', target: `user:${user.id}`, after: { factor } });
    res.json({ accessToken: signAccessToken(env, user, { mfaAt: now, amr: ['google', factor] }) });
  }

  async function logout(req, res) {
    const row = await endSession(db, req.cookies?.[ADMIN_COOKIE]);
    if (row) await auditLogModel.append(db, { actorId: row.user_id, action: 'admin.logout', target: `family:${row.family_id}` });
    clearCookie(res);
    res.status(204).end();
  }

  async function logoutAll(req, res) {
    await refreshTokenModel.revokeUser(db, req.user.userId, 'admin');
    await auditLogModel.append(db, { actorId: req.user.userId, action: 'admin.logout_all', target: `user:${req.user.userId}` });
    clearCookie(res);
    res.status(204).end();
  }

  const liveLink = async (raw) => {
    const link = await adminEnrolmentModel.findLive(db, hashToken(raw));
    if (!link) throw new AppError(410, 'LINK_EXPIRED', 'This enrolment link has expired or was used. Ask the server owner for a new one.');
    return link;
  };

  async function enrolInfo(req, res) {
    const link = await liveLink(req.body.token);
    const user = await activeAdmin(link.user_id);
    const secret = decryptSecret(env, link.secret_enc);
    const url = otpauthUrl(user.email, secret);
    res.set('Cache-Control', 'no-store');
    res.json({ email: user.email, name: user.name, otpauthUrl: url, qr: await QRCode.toDataURL(url, { margin: 1, width: 240 }), secret, expiresAt: link.expires_at });
  }

  async function enrol(req, res) {
    const link = await liveLink(req.body.token);
    const user = await activeAdmin(link.user_id);
    const step = totpStep(decryptSecret(env, link.secret_enc), req.body.code);
    // activate only after the first code from the app verifies (doc 16.3)
    if (step === null) throw new AppError(422, 'MFA_INVALID', 'That code does not match. Check the time on your phone and try the newest code.');
    const codes = newRecoveryCodes();
    await db.transaction(async (trx) => {
      if (!(await adminEnrolmentModel.use(trx, link.id))) throw new AppError(410, 'LINK_EXPIRED', 'This enrolment link was just used');
      await adminMfaModel.enrol(trx, user.id, link.secret_enc);
      await adminMfaModel.passed(trx, user.id, step);
      await adminRecoveryCodeModel.replace(trx, user.id, codes.map(hashCode));
      // a new factor ends every older admin session of this person
      await refreshTokenModel.revokeUser(trx, user.id, 'admin');
      await auditLogModel.append(trx, { actorId: user.id, action: 'admin.mfa.enrolled', target: `user:${user.id}` });
    });
    res.set('Cache-Control', 'no-store');
    res.status(201).json({ recoveryCodes: codes });
  }

  return { google, mfa, refresh, stepUp, logout, logoutAll, enrolInfo, enrol };
}
