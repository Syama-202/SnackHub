// Sign-up and sign-in for the public portals: customer, seller and rider (doc 16.1).
//   POST /auth/register             a role-specific account; the email must be confirmed
//   POST /auth/verify-email         the link from that email
//   POST /auth/resend-verification  another link (always answers the same)
//   POST /auth/signin               email or verified mobile + password, for one portal
//   POST /auth/join                 the same, adding this portal's role to an existing account
//   POST /auth/google               Google for the customer portal
//   POST /auth/mfa/verify           challenge + TOTP or recovery code -> session
//   POST /auth/mfa/enrol/start      challenge (or session) -> QR code to scan
//   POST /auth/mfa/enrol/confirm    first code -> recovery codes (+ session when via challenge)
//   POST /auth/password/forgot      a reset link (always answers the same)
//   POST /auth/password/reset       new password from the link; every session ends
//   POST /auth/refresh | /logout    rotate or end this device's session
//
// One account per email can hold several roles; every portal signs in separately, and the
// access token carries only that portal's role. A token is issued only after the second
// factor when the person has one, and a role whose MFA policy requires one cannot get a
// session before enrolling. Answers never say whether an email has an account.
import { AppError } from '../utils/AppError.js';
import { signAccessToken } from '../utils/tokens.js';
import { startSession as newSession, rotateSession, endSession, amrOf } from '../utils/sessions.js';
import { hashPassword, verifyPassword, verifyAgainstNothing, needsRehash, isBreached } from '../utils/passwords.js';
import { hmac } from '../utils/keys.js';
import { newLinkToken } from '../utils/mfa.js';
import { queueEmail } from '../utils/notify.js';
import { newChallenge, liveChallenge, checkSecondFactor, beginEnrolment, confirmEnrolment, MAX_CHALLENGE_ATTEMPTS } from '../utils/secondFactor.js';
import { userModel } from '../models/identity/user.js';
import { userRoleModel } from '../models/identity/userRole.js';
import { credentialModel } from '../models/identity/credential.js';
import { accountTokenModel } from '../models/identity/accountToken.js';
import { mfaTotpModel } from '../models/identity/mfaTotp.js';
import { mfaChallengeModel } from '../models/identity/mfaChallenge.js';
import { refreshTokenModel } from '../models/identity/refreshToken.js';
import { auditLogModel } from '../models/identity/auditLog.js';
import { passwordProblems } from '../../../shared/domain/passwords.js';
import { mfaRequiredFor, STAFF_ROLES } from '../../../shared/domain/permissions.js';

export const REFRESH_COOKIE = 'sh_refresh';

const VERIFY_HOURS = 24;
const RESET_MINUTES = 30;
const MAX_PASSWORD_FAILURES = 5;
const LOCK_MINUTES = 15;
// where each portal lands after sign-in, and where its sign-in page is
export const PORTAL_HOME = { customer: '/shop', seller: '/seller', rider: '/rider' };
export const SIGNIN_PATH = { customer: '/customer/signin', seller: '/seller/signin', rider: '/rider/signin' };

const ACCEPTED = { status: 'CHECK_EMAIL', message: 'If this email can be used, we have sent a link to it. Check your inbox.' };

/** What the app may know about the signed-in person. */
async function publicUser(db, user, portal) {
  const [roles, totp] = await Promise.all([userRoleModel.listForUser(db, user.id), mfaTotpModel.find(db, user.id)]);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: portal,
    roles: roles.filter((r) => r.status === 'active').map((r) => r.role),
    emailVerified: Boolean(user.email_verified_at),
    mobile: user.mobile,
    mobileVerified: Boolean(user.mobile_verified_at),
    mfaEnrolled: Boolean(totp),
  };
}

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
  const tokenHash = (purpose, raw) => hmac(env, 'account-token', `${purpose}:${raw}`);

  /** A session for this portal: the cookie, then the access token and the user for the app. */
  async function openSession(req, res, user, portal, { mfaAt = null, amr }) {
    const raw = await db.transaction(async (trx) => {
      const token = await newSession(trx, {
        kind: 'web',
        portal,
        userId: user.id,
        deviceId: req.body.deviceId,
        userAgent: req.get('user-agent'),
        expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 3600_000),
        mfaAt: mfaAt ? new Date(mfaAt) : null,
        amr,
      });
      await auditLogModel.append(trx, { actorId: user.id, action: 'auth.signin', target: `user:${user.id}`, after: { portal, amr, deviceId: req.body.deviceId } });
      return token;
    });
    res.cookie(REFRESH_COOKIE, raw, cookieOptions());
    return { accessToken: signAccessToken(env, user, { role: portal, mfaAt, amr }), user: await publicUser(db, user, portal), home: PORTAL_HOME[portal] };
  }

  /**
   * After a correct first factor: the code step if the person has an authenticator, the
   * enrolment step if the portal requires one, otherwise a session.
   */
  async function afterFirstFactor(req, res, user, portal, firstFactor) {
    const totp = await mfaTotpModel.find(db, user.id);
    const required = mfaRequiredFor(portal, env.MFA_REQUIRED_ROLES);
    if (totp || required) {
      const purpose = totp ? 'verify' : 'enrol';
      const challenge = await db.transaction((trx) => newChallenge(trx, { userId: user.id, portal, purpose, firstFactor, deviceId: req.body.deviceId }));
      return res.json({ mfa: purpose, challenge, methods: totp ? ['totp', 'recovery'] : ['totp'], portal });
    }
    res.json(await openSession(req, res, user, portal, { amr: [firstFactor] }));
  }

  /** The portal's role on the account: present and active, or added when joining. */
  async function membershipFor(user, portal, { join }) {
    const m = await userRoleModel.find(db, user.id, portal);
    if (m?.status === 'suspended') throw new AppError(403, 'ROLE_SUSPENDED', `Your ${portal} access is suspended. Contact support.`);
    if (m) return m;
    if (!join) throw new AppError(403, 'ROLE_NOT_HELD', `This account has no ${portal} profile yet.`, { canJoin: true, portal });
    await db.transaction(async (trx) => {
      await userRoleModel.add(trx, { userId: user.id, role: portal });
      await auditLogModel.append(trx, { actorId: user.id, action: 'role.join', target: `user:${user.id}`, after: { role: portal } });
    });
    return userRoleModel.find(db, user.id, portal);
  }

  // ---------- sign-up

  async function register(req, res) {
    const { portal, name, email, password, mobile } = req.body;
    const problems = passwordProblems(password, { email, name });
    if (problems.length) throw new AppError(422, 'WEAK_PASSWORD', problems[0], { problems });
    if (await isBreached(env, password)) throw new AppError(422, 'PASSWORD_BREACHED', 'This password appears in a public data breach. Pick a different one.');
    const passwordHash = await hashPassword(password);

    await db.transaction(async (trx) => {
      const existing = await userModel.findByEmail(trx, email);
      if (existing) {
        // the owner of the address learns someone tried; the person asking learns nothing
        await queueEmail(env, trx, {
          template: 'account_exists',
          to: existing.email,
          data: { name: existing.name, portal, link: `${env.APP_URL}${SIGNIN_PATH[portal]}` },
          dedupeKey: `exists:${existing.id}:${portal}:${new Date().toISOString().slice(0, 13)}`,
        });
        await auditLogModel.append(trx, { actorId: existing.id, action: 'auth.register.duplicate', target: `user:${existing.id}`, after: { portal } });
        return;
      }
      const id = await userModel.create(trx, { email, name, mobile, termsVersion: env.TERMS_VERSION });
      await credentialModel.set(trx, id, passwordHash);
      await userRoleModel.add(trx, { userId: id, role: portal });
      await sendVerification(trx, { id, email, name });
      await auditLogModel.append(trx, { actorId: id, action: 'auth.register', target: `user:${id}`, after: { portal, termsVersion: env.TERMS_VERSION } });
    });
    res.status(202).json(ACCEPTED);
  }

  async function sendVerification(trx, user) {
    const raw = newLinkToken();
    await accountTokenModel.expireForUser(trx, user.id, 'email_verify');
    const id = await accountTokenModel.create(trx, { userId: user.id, purpose: 'email_verify', tokenHash: tokenHash('email_verify', raw), target: user.email, expiresAt: new Date(Date.now() + VERIFY_HOURS * 3600_000) });
    await queueEmail(env, trx, { template: 'verify_email', to: user.email, data: { name: user.name }, secret: { link: `${env.APP_URL}/verify-email?token=${raw}` }, dedupeKey: `verify:${id}` });
  }

  async function verifyEmail(req, res) {
    const row = await accountTokenModel.findLive(db, 'email_verify', tokenHash('email_verify', req.body.token));
    if (!row) throw new AppError(400, 'LINK_INVALID', 'This link has expired or was already used. Ask for a new one.');
    const roles = await db.transaction(async (trx) => {
      if (!(await accountTokenModel.use(trx, row.id))) throw new AppError(400, 'LINK_INVALID', 'This link was just used');
      // the link proves only the address it was sent to
      if (!(await userModel.markEmailVerified(trx, row.user_id, row.target))) throw new AppError(400, 'LINK_INVALID', 'The email on this account has changed since the link was sent');
      await auditLogModel.append(trx, { actorId: row.user_id, action: 'auth.email.verified', target: `user:${row.user_id}` });
      return (await userRoleModel.listForUser(trx, row.user_id)).map((r) => r.role);
    });
    res.json({ verified: true, portal: ['seller', 'rider', 'customer'].find((p) => roles.includes(p)) ?? 'customer' });
  }

  async function resendVerification(req, res) {
    const user = await userModel.findByEmail(db, req.body.email);
    if (user && !user.email_verified_at && user.status === 'active') {
      const recent = await accountTokenModel.countSince(db, user.id, 'email_verify', new Date(Date.now() - 3600_000));
      if (recent < 5) await db.transaction((trx) => sendVerification(trx, user));
    }
    res.status(202).json(ACCEPTED);
  }

  // ---------- sign-in

  async function findByIdentifier(identifier) {
    const id = String(identifier).trim();
    return id.startsWith('+') ? userModel.findByVerifiedMobile(db, id) : userModel.findByEmail(db, id);
  }

  async function signInWithPassword(req, res, { join }) {
    const { portal, identifier, password } = req.body;
    const user = await findByIdentifier(identifier);
    const cred = user && (await credentialModel.find(db, user.id));
    if (!user || !cred) {
      await verifyAgainstNothing(password);
      throw new AppError(401, 'INVALID_CREDENTIALS', 'That email or password is not right');
    }
    if (cred.locked_until && new Date(cred.locked_until) > new Date()) {
      const min = Math.ceil((new Date(cred.locked_until) - Date.now()) / 60_000);
      throw new AppError(423, 'ACCOUNT_LOCKED', `Too many wrong passwords. Try again in ${min} minute${min === 1 ? '' : 's'}, or reset your password.`);
    }
    if (!(await verifyPassword(cred.password_hash, password))) {
      const after = await credentialModel.failed(db, user.id, { max: MAX_PASSWORD_FAILURES, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) });
      const locked = after.locked_until && new Date(after.locked_until) > new Date();
      await auditLogModel.append(db, { actorId: user.id, action: locked ? 'auth.signin.locked' : 'auth.signin.failed', target: `user:${user.id}`, after: { portal } });
      if (locked) throw new AppError(423, 'ACCOUNT_LOCKED', `Too many wrong passwords. Try again in ${LOCK_MINUTES} minutes, or reset your password.`);
      throw new AppError(401, 'INVALID_CREDENTIALS', 'That email or password is not right');
    }
    await credentialModel.passed(db, user.id);
    if (needsRehash(cred.password_hash)) await credentialModel.set(db, user.id, await hashPassword(password));

    if (user.status !== 'active') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended. Contact support.');
    if (!user.email_verified_at) throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Confirm your email first. We can send the link again.');
    const roles = await userRoleModel.listForUser(db, user.id);
    if (roles.some((r) => STAFF_ROLES.includes(r.role))) throw new AppError(403, 'STAFF_ACCOUNT', 'Staff accounts sign in on the admin console');
    await membershipFor(user, portal, { join });
    await afterFirstFactor(req, res, user, portal, 'pwd');
  }

  const signIn = (req, res) => signInWithPassword(req, res, { join: false });
  const join = (req, res) => signInWithPassword(req, res, { join: true });

  /** Google, for the customer portal only: a verified Google email signs in or makes a customer. */
  async function google(req, res) {
    if (!env.GOOGLE_CLIENT_ID) throw new AppError(503, 'GOOGLE_NOT_CONFIGURED', 'Google sign-in is not set up on this server yet');
    let identity;
    try {
      identity = await verifyGoogle(req.body.credential);
    } catch {
      throw new AppError(401, 'GOOGLE_TOKEN_INVALID', 'Google sign-in could not be checked. Please try again.');
    }
    if (!identity.emailVerified || !identity.email) throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Your Google email is not verified');

    const { user } = await db.transaction(async (trx) => {
      let u = await userModel.findByGoogleSub(trx, identity.sub);
      let how = 'returning';
      if (!u) {
        u = await userModel.findByEmail(trx, identity.email);
        if (u) {
          // link an existing account only through a verified email, never replacing another Google link
          if (!(await userModel.linkGoogle(trx, u.id, identity.sub))) throw new AppError(409, 'ACCOUNT_LINKED_ELSEWHERE', 'This email is already linked to a different Google account');
          // Google has just proved the address
          await userModel.markEmailVerified(trx, u.id, identity.email);
          how = 'linked';
        } else {
          const id = await userModel.create(trx, { email: identity.email, name: identity.name, googleSub: identity.sub, emailVerified: true, termsVersion: env.TERMS_VERSION });
          await userRoleModel.add(trx, { userId: id, role: 'customer' });
          u = await userModel.findById(trx, id);
          how = 'created';
        }
      }
      await auditLogModel.append(trx, { actorId: u.id, action: `auth.google.${how}`, target: `user:${u.id}`, after: { deviceId: req.body.deviceId } });
      return { user: u, how };
    });
    if (user.status !== 'active') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended. Contact support.');
    const roles = await userRoleModel.listForUser(db, user.id);
    if (roles.some((r) => STAFF_ROLES.includes(r.role))) throw new AppError(403, 'STAFF_ACCOUNT', 'Staff accounts sign in on the admin console');
    // a Google sign-in is a customer sign-in: an existing seller or rider account adds the customer role
    await membershipFor(user, 'customer', { join: true });
    await afterFirstFactor(req, res, await userModel.findById(db, user.id), 'customer', 'google');
  }

  // ---------- second factor

  /** The person behind a challenge, still allowed in. */
  async function challengeOwner(row) {
    const user = await userModel.findById(db, row.user_id);
    if (!user || user.status !== 'active') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended');
    const m = await userRoleModel.find(db, user.id, row.portal);
    if (!m || m.status !== 'active') throw new AppError(403, 'ROLE_SUSPENDED', 'This access is not active');
    return user;
  }

  async function mfaVerify(req, res) {
    const row = await liveChallenge(db, req.body.challenge, { purpose: 'verify', deviceId: req.body.deviceId });
    const user = await challengeOwner(row);
    const factor = await checkSecondFactor(env, db, user, req.body.code, { portal: row.portal, challengeId: row.id });
    if (!(await mfaChallengeModel.use(db, row.id))) throw new AppError(401, 'MFA_SESSION_EXPIRED', 'This sign-in was already used. Sign in again.');
    res.json(await openSession(req, res, user, row.portal, { mfaAt: Date.now(), amr: [row.first_factor, factor] }));
  }

  /** The QR code to scan: through an enrolment challenge (forced setup) or a signed-in session. */
  async function enrolStart(req, res) {
    let user;
    if (req.body.challenge) {
      const row = await liveChallenge(db, req.body.challenge, { purpose: 'enrol', deviceId: req.body.deviceId });
      user = await challengeOwner(row);
    } else {
      if (!req.user) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in first');
      user = await userModel.findById(db, req.user.userId);
    }
    if (await mfaTotpModel.find(db, user.id)) throw new AppError(409, 'MFA_ALREADY_ENROLLED', 'Two-step sign-in is already on. Turn it off first to move to a new phone.');
    res.set('Cache-Control', 'no-store');
    res.json(await beginEnrolment(env, db, user));
  }

  async function enrolConfirm(req, res) {
    res.set('Cache-Control', 'no-store');
    if (req.body.challenge) {
      const row = await liveChallenge(db, req.body.challenge, { purpose: 'enrol', deviceId: req.body.deviceId });
      const user = await challengeOwner(row);
      let codes;
      try {
        codes = await db.transaction(async (trx) => {
          const c = await confirmEnrolment(env, trx, user, req.body.code, { portal: row.portal });
          if (!(await mfaChallengeModel.use(trx, row.id))) throw new AppError(401, 'MFA_SESSION_EXPIRED', 'This sign-in was already used. Sign in again.');
          return c;
        });
      } catch (err) {
        if (err.code === 'MFA_INVALID') await mfaChallengeModel.attempt(db, row.id);
        throw err;
      }
      const session = await openSession(req, res, user, row.portal, { mfaAt: Date.now(), amr: [row.first_factor, 'totp'] });
      return res.status(201).json({ ...session, recoveryCodes: codes });
    }
    if (!req.user) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in first');
    const user = await userModel.findById(db, req.user.userId);
    const codes = await db.transaction((trx) => confirmEnrolment(env, trx, user, req.body.code, { portal: req.user.role }));
    // the current token predates the factor; a fresh one carries it
    res.status(201).json({ recoveryCodes: codes, accessToken: signAccessToken(env, user, { role: req.user.role, mfaAt: Date.now(), amr: [...new Set([...req.user.amr, 'totp'])] }) });
  }

  // ---------- password reset

  async function forgotPassword(req, res) {
    const user = await userModel.findByEmail(db, req.body.email);
    if (user && user.status === 'active') {
      const recent = await accountTokenModel.countSince(db, user.id, 'password_reset', new Date(Date.now() - 3600_000));
      if (recent < 5) {
        await db.transaction(async (trx) => {
          const raw = newLinkToken();
          await accountTokenModel.expireForUser(trx, user.id, 'password_reset');
          const id = await accountTokenModel.create(trx, { userId: user.id, purpose: 'password_reset', tokenHash: tokenHash('password_reset', raw), target: user.email, expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000) });
          await queueEmail(env, trx, { template: 'password_reset', to: user.email, data: { name: user.name }, secret: { link: `${env.APP_URL}/reset-password?token=${raw}` }, dedupeKey: `reset:${id}` });
          await auditLogModel.append(trx, { actorId: user.id, action: 'auth.password.reset_requested', target: `user:${user.id}` });
        });
      }
    }
    res.status(202).json({ status: 'CHECK_EMAIL', message: 'If an account uses this email, we have sent a link to reset the password.' });
  }

  async function resetPassword(req, res) {
    const row = await accountTokenModel.findLive(db, 'password_reset', tokenHash('password_reset', req.body.token));
    if (!row) throw new AppError(400, 'LINK_INVALID', 'This link has expired or was already used. Ask for a new one.');
    const user = await userModel.findById(db, row.user_id);
    const problems = passwordProblems(req.body.password, { email: user.email, name: user.name });
    if (problems.length) throw new AppError(422, 'WEAK_PASSWORD', problems[0], { problems });
    if (await isBreached(env, req.body.password)) throw new AppError(422, 'PASSWORD_BREACHED', 'This password appears in a public data breach. Pick a different one.');
    const passwordHash = await hashPassword(req.body.password);
    await db.transaction(async (trx) => {
      if (!(await accountTokenModel.use(trx, row.id))) throw new AppError(400, 'LINK_INVALID', 'This link was just used');
      await accountTokenModel.expireForUser(trx, user.id, 'password_reset');
      await credentialModel.set(trx, user.id, passwordHash);
      // the link reached the inbox, so the address is proven too
      await userModel.markEmailVerified(trx, user.id, row.target);
      // whoever had the old password is signed out everywhere
      await refreshTokenModel.revokeUser(trx, user.id);
      await mfaChallengeModel.expireForUser(trx, user.id);
      await auditLogModel.append(trx, { actorId: user.id, action: 'auth.password.reset', target: `user:${user.id}` });
      await queueEmail(env, trx, { template: 'password_changed', to: user.email, data: { name: user.name } });
    });
    clearCookie(res);
    res.json({ done: true });
  }

  // ---------- sessions

  async function refresh(req, res) {
    const { user, row, next } = await rotateSession(db, req.cookies?.[REFRESH_COOKIE], { kind: 'web', clear: () => clearCookie(res) });
    if (next) res.cookie(REFRESH_COOKIE, next, { ...cookieOptions(), maxAge: new Date(row.expires_at).getTime() - Date.now() });
    // the second-factor time and the role are the ones from sign-in, never "now"
    const mfaAt = row.mfa_at ? new Date(row.mfa_at).getTime() : null;
    res.json({ accessToken: signAccessToken(env, user, { role: row.portal, mfaAt, amr: amrOf(row) }), user: await publicUser(db, user, row.portal), home: PORTAL_HOME[row.portal] });
  }

  async function logout(req, res) {
    const row = await endSession(db, req.cookies?.[REFRESH_COOKIE]);
    if (row) await auditLogModel.append(db, { actorId: row.user_id, action: 'auth.logout', target: `family:${row.family_id}` });
    clearCookie(res);
    res.status(204).end();
  }

  return { register, verifyEmail, resendVerification, signIn, join, google, mfaVerify, enrolStart, enrolConfirm, forgotPassword, resetPassword, refresh, logout, MAX_CHALLENGE_ATTEMPTS };
}
