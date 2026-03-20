// Staff sign-in for the admin console, always with a second factor (doc 16.3). Staff are
// admins (everything) and reviewers (the verification queue only).
//   POST /admin/auth/google       Google ID token in; staff get a challenge for the code step
//   POST /admin/auth/mfa          challenge + TOTP or recovery code in; staff session out
//   POST /admin/auth/refresh      rotate the admin cookie; never later than 8 h after sign-in
//   POST /admin/auth/step-up      a fresh code for a sensitive action (5 minute rule)
//   POST /admin/auth/logout       end this device's session; /logout-all ends every one
//   POST /admin/auth/enrol/info   one-time enrolment link: the QR code to scan (token in the
//                                 body, never in a URL, so it stays out of the request log)
//   POST /admin/auth/enrol        first code from the app activates MFA, returns 10 recovery codes
// There is no staff sign-up: accounts come from `npm run create-admin`, which issues the link.
import QRCode from 'qrcode';
import { AppError } from '../utils/AppError.js';
import { signAccessToken, hashToken } from '../utils/tokens.js';
import { startSession, rotateSession, endSession, amrOf } from '../utils/sessions.js';
import { decryptSecret, encryptSecret, totpStep, otpauthUrl, newRecoveryCodes, hashCode, newLinkToken, newTotpSecret } from '../utils/mfa.js';
import { newChallenge, liveChallenge, checkSecondFactor } from '../utils/secondFactor.js';
import { userModel } from '../models/identity/user.js';
import { userRoleModel } from '../models/identity/userRole.js';
import { auditLogModel } from '../models/identity/auditLog.js';
import { refreshTokenModel } from '../models/identity/refreshToken.js';
import { mfaTotpModel } from '../models/identity/mfaTotp.js';
import { recoveryCodeModel } from '../models/identity/recoveryCode.js';
import { mfaChallengeModel } from '../models/identity/mfaChallenge.js';
import { adminEnrolmentModel } from '../models/identity/adminEnrolment.js';
import { STAFF_ROLES } from '../../../shared/domain/permissions.js';

export const ADMIN_COOKIE = 'sh_admin_refresh';
const LINK_MINUTES = 15;

/** The staff role an account signs in with: admin if it holds it, otherwise reviewer. */
async function staffRoleOf(db, userId) {
  const roles = (await userRoleModel.listForUser(db, userId)).filter((r) => r.status === 'active').map((r) => r.role);
  return STAFF_ROLES.slice().reverse().find((r) => roles.includes(r)) ?? null;
}

const publicUser = (u, role) => ({ id: u.id, email: u.email, name: u.name, role });

/** A one-time enrolment link for staff (create-admin and an owner's MFA reset use it). */
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

  /** The active staff member behind an id and their role, or a refusal. */
  async function activeStaff(id) {
    const user = await userModel.findById(db, id);
    const role = user && (await staffRoleOf(db, id));
    if (!user || !role || user.status !== 'active') throw new AppError(403, 'NOT_AN_ADMIN', 'This account is not on the admin list');
    return { user, role };
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
      // staff made by create-admin have no Google link yet: link it through the verified email
      const byEmail = await userModel.findByEmail(db, identity.email);
      if (byEmail && (await staffRoleOf(db, byEmail.id))) {
        if (!(await userModel.linkGoogle(db, byEmail.id, identity.sub))) throw new AppError(409, 'ACCOUNT_LINKED_ELSEWHERE', 'This email is already linked to a different Google account');
        await userModel.markEmailVerified(db, byEmail.id, identity.email);
        user = byEmail;
      }
    }
    const role = user && (await staffRoleOf(db, user.id));
    if (!user || !role) {
      await auditLogModel.append(db, { actorId: user?.id ?? null, action: 'admin.login.refused', target: user ? `user:${user.id}` : null });
      throw new AppError(403, 'NOT_AN_ADMIN', 'This Google account is not on the admin list');
    }
    if (user.status !== 'active') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended');
    if (!(await mfaTotpModel.find(db, user.id))) throw new AppError(403, 'MFA_NOT_ENROLLED', 'Set up your authenticator app with the enrolment link first');
    const challenge = await db.transaction(async (trx) => {
      await auditLogModel.append(trx, { actorId: user.id, action: 'admin.login.google', target: `user:${user.id}`, after: { role, deviceId: req.body.deviceId } });
      return newChallenge(trx, { userId: user.id, portal: role, purpose: 'verify', firstFactor: 'google', deviceId: req.body.deviceId });
    });
    // no admin route accepts the challenge; it only allows the code step
    res.json({ mfaPending: true, challenge, user: { name: user.name, email: user.email, role } });
  }

  async function mfa(req, res) {
    const row = await liveChallenge(db, req.body.challenge, { purpose: 'verify' });
    if (!STAFF_ROLES.includes(row.portal)) throw new AppError(401, 'MFA_SESSION_EXPIRED', 'Sign in with Google again');
    const { user, role } = await activeStaff(row.user_id);
    if (role !== row.portal) throw new AppError(401, 'MFA_SESSION_EXPIRED', 'Your access changed. Sign in with Google again.');
    const factor = await checkSecondFactor(env, db, user, req.body.code, { portal: role, challengeId: row.id });
    const now = Date.now();
    const amr = ['google', factor];
    const raw = await db.transaction(async (trx) => {
      if (!(await mfaChallengeModel.use(trx, row.id))) throw new AppError(401, 'MFA_SESSION_EXPIRED', 'This sign-in was already used. Sign in again.');
      const token = await startSession(trx, { kind: 'admin', portal: role, userId: user.id, deviceId: row.device_id, userAgent: req.get('user-agent'), expiresAt: new Date(now + env.ADMIN_SESSION_HOURS * 3600_000), mfaAt: new Date(now), amr });
      await auditLogModel.append(trx, { actorId: user.id, action: 'admin.login', target: `user:${user.id}`, after: { role, amr, deviceId: row.device_id } });
      return token;
    });
    res.cookie(ADMIN_COOKIE, raw, cookieOptions(env.ADMIN_SESSION_HOURS * 3600_000));
    res.json({ accessToken: signAccessToken(env, user, { role, mfaAt: now, amr }), user: publicUser(user, role), amr });
  }

  async function refresh(req, res) {
    const { user, row, next } = await rotateSession(db, req.cookies?.[ADMIN_COOKIE], { kind: 'admin', clear: () => clearCookie(res) });
    if (!STAFF_ROLES.includes(row.portal)) {
      await refreshTokenModel.revokeUser(db, user.id, 'admin');
      clearCookie(res);
      throw new AppError(403, 'NOT_AN_ADMIN', 'This account is no longer staff');
    }
    if (next) res.cookie(ADMIN_COOKIE, next, cookieOptions(new Date(row.expires_at).getTime() - Date.now()));
    // the second-factor time is the one from sign-in or the last step-up, never "now"
    const mfaAt = row.mfa_at ? new Date(row.mfa_at).getTime() : null;
    res.json({ accessToken: signAccessToken(env, user, { role: row.portal, mfaAt, amr: amrOf(row) }), user: publicUser(user, row.portal) });
  }

  async function stepUp(req, res) {
    const { user, role } = await activeStaff(req.user.userId);
    const factor = await checkSecondFactor(env, db, user, req.body.code, { portal: role });
    const now = Date.now();
    const raw = req.cookies?.[ADMIN_COOKIE];
    const row = raw && (await refreshTokenModel.findByHash(db, hashToken(raw)));
    if (row?.kind === 'admin' && row.user_id === user.id) await refreshTokenModel.setMfaAt(db, row.family_id, new Date(now));
    await auditLogModel.append(db, { actorId: user.id, action: 'admin.step_up', target: `user:${user.id}`, after: { factor } });
    res.json({ accessToken: signAccessToken(env, user, { role: req.user.role, mfaAt: now, amr: ['google', factor] }) });
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
    const { user } = await activeStaff(link.user_id);
    const secret = decryptSecret(env, link.secret_enc);
    const url = otpauthUrl(user.email, secret, 'SnackHub admin');
    res.set('Cache-Control', 'no-store');
    res.json({ email: user.email, name: user.name, otpauthUrl: url, qr: await QRCode.toDataURL(url, { margin: 1, width: 240 }), secret, expiresAt: link.expires_at });
  }

  async function enrol(req, res) {
    const link = await liveLink(req.body.token);
    const { user } = await activeStaff(link.user_id);
    const step = totpStep(decryptSecret(env, link.secret_enc), req.body.code);
    // activate only after the first code from the app verifies (doc 16.3)
    if (step === null) throw new AppError(422, 'MFA_INVALID', 'That code does not match. Check the time on your phone and try the newest code.');
    const codes = newRecoveryCodes();
    await db.transaction(async (trx) => {
      if (!(await adminEnrolmentModel.use(trx, link.id))) throw new AppError(410, 'LINK_EXPIRED', 'This enrolment link was just used');
      await mfaTotpModel.enrol(trx, user.id, link.secret_enc);
      await mfaTotpModel.passed(trx, user.id, step);
      await recoveryCodeModel.replace(trx, user.id, codes.map(hashCode));
      // a new factor ends every older admin session of this person
      await refreshTokenModel.revokeUser(trx, user.id, 'admin');
      await auditLogModel.append(trx, { actorId: user.id, action: 'admin.mfa.enrolled', target: `user:${user.id}` });
    });
    res.set('Cache-Control', 'no-store');
    res.status(201).json({ recoveryCodes: codes });
  }

  return { google, mfa, refresh, stepUp, logout, logoutAll, enrolInfo, enrol };
}
