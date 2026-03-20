// The signed-in person's own security settings (any role, permission security.self):
//   GET    /auth/security                 what is set up: email, mobile, second factor, sessions
//   POST   /auth/password/change          current + new password; other devices are signed out
//   POST   /auth/mfa/disable              a current code turns the authenticator off (not where policy requires it)
//   POST   /auth/mfa/recovery-codes       a current code makes ten new recovery codes
//   DELETE /auth/sessions/:familyId       sign one device out
//   POST   /auth/logout-all               sign every device out, this one included
//   POST   /auth/mobile/start | verify    add a mobile number and prove it with a texted code
// Sensitive changes need the current password or a current code, and each one emails the person.
import { AppError } from '../utils/AppError.js';
import { hashToken } from '../utils/tokens.js';
import { hmac, sameDigest, sixDigitCode } from '../utils/keys.js';
import { hashPassword, verifyPassword, isBreached } from '../utils/passwords.js';
import { queueEmail, queueSms } from '../utils/notify.js';
import { checkSecondFactor, regenerateRecoveryCodes } from '../utils/secondFactor.js';
import { userModel } from '../models/identity/user.js';
import { userRoleModel } from '../models/identity/userRole.js';
import { credentialModel } from '../models/identity/credential.js';
import { mfaTotpModel } from '../models/identity/mfaTotp.js';
import { recoveryCodeModel } from '../models/identity/recoveryCode.js';
import { refreshTokenModel } from '../models/identity/refreshToken.js';
import { accountTokenModel } from '../models/identity/accountToken.js';
import { auditLogModel } from '../models/identity/auditLog.js';
import { passwordProblems } from '../../../shared/domain/passwords.js';
import { mfaRequiredFor } from '../../../shared/domain/permissions.js';
import { REFRESH_COOKIE } from './auth.js';

const MOBILE_CODE_MINUTES = 10;
const MOBILE_CODE_TRIES = 5;

export function securityController({ env, dbs, sms }) {
  const db = dbs.identity;
  const codeHash = (userId, code) => hmac(env, 'account-token', `mobile_verify:${userId}:${code}`);
  const me = (req) => userModel.findById(db, req.user.userId);
  // the family of the session making this request, so "sign out other devices" keeps it
  const currentFamily = async (req) => {
    const raw = req.cookies?.[REFRESH_COOKIE];
    const row = raw && (await refreshTokenModel.findByHash(db, hashToken(raw)));
    return row && row.user_id === req.user.userId ? row.family_id : null;
  };

  async function show(req, res) {
    const user = await me(req);
    const [roles, totp, cred, sessions, family] = await Promise.all([
      userRoleModel.listForUser(db, user.id),
      mfaTotpModel.find(db, user.id),
      credentialModel.find(db, user.id),
      refreshTokenModel.listLive(db, user.id),
      currentFamily(req),
    ]);
    const active = roles.filter((r) => r.status === 'active').map((r) => r.role);
    res.json({
      email: user.email,
      emailVerified: Boolean(user.email_verified_at),
      mobile: user.mobile,
      mobileVerified: Boolean(user.mobile_verified_at),
      smsEnabled: sms.enabled,
      hasPassword: Boolean(cred),
      roles: roles.map((r) => ({ role: r.role, status: r.status })),
      mfa: {
        enrolled: Boolean(totp),
        enrolledAt: totp?.enrolled_at ?? null,
        required: active.some((r) => mfaRequiredFor(r, env.MFA_REQUIRED_ROLES)),
        recoveryCodesLeft: totp ? await recoveryCodeModel.countLeft(db, user.id) : 0,
      },
      sessions: sessions.map((s) => ({ id: s.family_id, portal: s.portal, app: s.kind, device: s.user_agent, startedAt: s.started_at, lastUsedAt: s.last_used_at, current: s.family_id === family })),
    });
  }

  async function changePassword(req, res) {
    const user = await me(req);
    const cred = await credentialModel.find(db, user.id);
    if (!cred || !(await verifyPassword(cred.password_hash, req.body.current))) throw new AppError(403, 'PASSWORD_WRONG', 'Your current password is not right');
    const problems = passwordProblems(req.body.next, { email: user.email, name: user.name });
    if (problems.length) throw new AppError(422, 'WEAK_PASSWORD', problems[0], { problems });
    if (await isBreached(env, req.body.next)) throw new AppError(422, 'PASSWORD_BREACHED', 'This password appears in a public data breach. Pick a different one.');
    const hash = await hashPassword(req.body.next);
    const keep = await currentFamily(req);
    await db.transaction(async (trx) => {
      await credentialModel.set(trx, user.id, hash);
      await accountTokenModel.expireForUser(trx, user.id, 'password_reset');
      // every other device is signed out; this one stays
      const live = await refreshTokenModel.listLive(trx, user.id);
      for (const s of live) if (s.family_id !== keep) await refreshTokenModel.revokeFamily(trx, s.family_id);
      await auditLogModel.append(trx, { actorId: user.id, action: 'auth.password.changed', target: `user:${user.id}` });
      await queueEmail(env, trx, { template: 'password_changed', to: user.email, data: { name: user.name } });
    });
    res.json({ done: true });
  }

  async function disableMfa(req, res) {
    const user = await me(req);
    const roles = (await userRoleModel.listForUser(db, user.id)).filter((r) => r.status === 'active').map((r) => r.role);
    const needed = roles.find((r) => mfaRequiredFor(r, env.MFA_REQUIRED_ROLES));
    if (needed) throw new AppError(409, 'MFA_REQUIRED_BY_POLICY', `Two-step sign-in is required for ${needed} accounts and cannot be turned off`);
    await checkSecondFactor(env, db, user, req.body.code, { portal: req.user.role });
    await db.transaction(async (trx) => {
      await mfaTotpModel.remove(trx, user.id);
      await recoveryCodeModel.removeAll(trx, user.id);
      await auditLogModel.append(trx, { actorId: user.id, action: 'auth.mfa.disabled', target: `user:${user.id}` });
      await queueEmail(env, trx, { template: 'mfa_disabled', to: user.email, data: { name: user.name } });
    });
    res.json({ done: true });
  }

  async function newRecoveryCodes(req, res) {
    const user = await me(req);
    await checkSecondFactor(env, db, user, req.body.code, { portal: req.user.role });
    const codes = await db.transaction((trx) => regenerateRecoveryCodes(env, trx, user));
    res.set('Cache-Control', 'no-store');
    res.json({ recoveryCodes: codes });
  }

  async function endOneSession(req, res) {
    if (!(await refreshTokenModel.revokeFamilyOf(db, req.user.userId, req.params.familyId))) throw new AppError(404, 'NOT_FOUND', 'No such session');
    await auditLogModel.append(db, { actorId: req.user.userId, action: 'auth.session.revoked', target: `family:${req.params.familyId}` });
    res.status(204).end();
  }

  async function logoutAll(req, res) {
    const user = await me(req);
    await db.transaction(async (trx) => {
      await refreshTokenModel.revokeUser(trx, user.id);
      await auditLogModel.append(trx, { actorId: user.id, action: 'auth.logout_all', target: `user:${user.id}` });
      await queueEmail(env, trx, { template: 'sessions_revoked', to: user.email, data: { name: user.name } });
    });
    res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'strict', path: '/api/v1/auth' });
    res.status(204).end();
  }

  async function startMobile(req, res) {
    if (!sms.enabled) throw new AppError(503, 'SMS_NOT_CONFIGURED', 'Text messages are not set up on this server, so mobile numbers cannot be verified yet');
    const user = await me(req);
    const mobile = req.body.mobile;
    const taken = await userModel.findByVerifiedMobile(db, mobile);
    if (taken && taken.id !== user.id) throw new AppError(409, 'MOBILE_IN_USE', 'This number is verified on another account');
    const recent = await accountTokenModel.countSince(db, user.id, 'mobile_verify', new Date(Date.now() - 15 * 60_000));
    if (recent >= 3) throw new AppError(429, 'RATE_LIMITED', 'Too many codes sent. Wait 15 minutes and try again.');
    const code = sixDigitCode();
    await db.transaction(async (trx) => {
      await userModel.setMobile(trx, user.id, mobile);
      await accountTokenModel.expireForUser(trx, user.id, 'mobile_verify');
      const id = await accountTokenModel.create(trx, { userId: user.id, purpose: 'mobile_verify', tokenHash: codeHash(user.id, code), target: mobile, expiresAt: new Date(Date.now() + MOBILE_CODE_MINUTES * 60_000) });
      await queueSms(env, trx, { template: 'mobile_code', to: mobile, secret: { code }, dedupeKey: `sms:${id}` });
      await auditLogModel.append(trx, { actorId: user.id, action: 'auth.mobile.code_sent', target: `user:${user.id}` });
    });
    res.status(202).json({ sent: true, expiresInMinutes: MOBILE_CODE_MINUTES });
  }

  async function verifyMobile(req, res) {
    const userId = req.user.userId;
    const row = await accountTokenModel.latestLive(db, userId, 'mobile_verify');
    if (!row || row.attempts >= MOBILE_CODE_TRIES) throw new AppError(400, 'CODE_EXPIRED', 'That code has expired. Ask for a new one.');
    if (!sameDigest(row.token_hash, codeHash(userId, req.body.code))) {
      await accountTokenModel.attempt(db, row.id);
      throw new AppError(422, 'CODE_INVALID', 'That code is not right');
    }
    try {
      await db.transaction(async (trx) => {
        if (!(await accountTokenModel.use(trx, row.id))) throw new AppError(400, 'CODE_EXPIRED', 'That code was already used');
        if (!(await userModel.markMobileVerified(trx, userId, row.target))) throw new AppError(409, 'MOBILE_CHANGED', 'The number changed after the code was sent');
        await auditLogModel.append(trx, { actorId: userId, action: 'auth.mobile.verified', target: `user:${userId}` });
      });
    } catch (err) {
      if (err.errno === 1062) throw new AppError(409, 'MOBILE_IN_USE', 'This number is verified on another account');
      throw err;
    }
    res.json({ verified: true });
  }

  return { show, changePassword, disableMfa, newRecoveryCodes, endOneSession, logoutAll, startMobile, verifyMobile };
}
