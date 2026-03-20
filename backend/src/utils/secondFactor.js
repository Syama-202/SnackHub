// The second factor, the same for every role (doc 16.3):
// - a challenge: after the password (or Google) is right, a random token valid for five
//   minutes, bound to one portal and one device, usable once, dead after five wrong codes.
//   Only the MFA routes accept it; it is never a session.
// - a code check: a TOTP code works once (its 30 second step is stored), a recovery code
//   works once; five wrong codes lock the factor for 15 minutes. Staff lockouts and recovery
//   codes raise an alert for the other admins; the person always gets an email.
// - enrolment: a fresh secret waits encrypted for 15 minutes and becomes active only after
//   the first good code from the app; then ten recovery codes are shown once.
import QRCode from 'qrcode';
import { AppError } from './AppError.js';
import { hashToken, newRefreshToken } from './tokens.js';
import { decryptSecret, encryptSecret, totpStep, otpauthUrl, newRecoveryCodes, hashCode, newTotpSecret } from './mfa.js';
import { queueEmail } from './notify.js';
import { mfaTotpModel } from '../models/identity/mfaTotp.js';
import { recoveryCodeModel } from '../models/identity/recoveryCode.js';
import { mfaSetupModel } from '../models/identity/mfaSetup.js';
import { mfaChallengeModel } from '../models/identity/mfaChallenge.js';
import { auditLogModel } from '../models/identity/auditLog.js';
import { outboxModel } from '../models/outbox.js';
import { STAFF_ROLES } from '../../../shared/domain/permissions.js';

export const CHALLENGE_MINUTES = 5;
export const MAX_CHALLENGE_ATTEMPTS = 5;
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const SETUP_MINUTES = 15;
const TOTP_FORMAT = /^\d{6}$/;
const RECOVERY_FORMAT = /^[a-z2-9]{4}-[a-z2-9]{4}$/i;

/** Starts the code step; returns the raw challenge for the client. Older challenges end. */
export async function newChallenge(trx, { userId, portal, purpose, firstFactor, deviceId }) {
  const raw = newRefreshToken();
  await mfaChallengeModel.expireForUser(trx, userId);
  await mfaChallengeModel.create(trx, { userId, portal, purpose, firstFactor, tokenHash: hashToken(raw), deviceId, expiresAt: new Date(Date.now() + CHALLENGE_MINUTES * 60_000) });
  return raw;
}

/** The live challenge for this raw token, purpose and device, or a 401. */
export async function liveChallenge(db, raw, { purpose, deviceId }) {
  const row = raw && (await mfaChallengeModel.findLive(db, hashToken(raw), MAX_CHALLENGE_ATTEMPTS));
  if (!row || row.purpose !== purpose || (deviceId && row.device_id !== deviceId)) {
    throw new AppError(401, 'MFA_SESSION_EXPIRED', 'That took too long or was already used. Sign in again.');
  }
  return row;
}

/**
 * Checks a TOTP or recovery code for a person who has an authenticator. Returns 'totp' or
 * 'recovery'; throws MFA_INVALID (with tries left) or MFA_LOCKED. challengeId, when given,
 * also counts the try against the challenge.
 */
export async function checkSecondFactor(env, db, user, rawCode, { portal, challengeId } = {}) {
  const code = String(rawCode ?? '').trim();
  const row = await mfaTotpModel.find(db, user.id);
  if (!row) throw new AppError(403, 'MFA_NOT_ENROLLED', 'Set up your authenticator app first');
  if (row.locked_until && new Date(row.locked_until) > new Date()) {
    const min = Math.ceil((new Date(row.locked_until) - Date.now()) / 60_000);
    throw new AppError(423, 'MFA_LOCKED', `Too many wrong codes. Try again in ${min} minute${min === 1 ? '' : 's'}.`);
  }
  const staff = STAFF_ROLES.includes(portal);
  const prefix = staff ? 'admin' : 'auth';
  if (TOTP_FORMAT.test(code)) {
    const step = totpStep(decryptSecret(env, row.secret_enc), code);
    if (step !== null && (await mfaTotpModel.passed(db, user.id, step))) return 'totp';
  } else if (RECOVERY_FORMAT.test(code) && (await recoveryCodeModel.use(db, user.id, hashCode(code)))) {
    await mfaTotpModel.passedWithRecovery(db, user.id);
    const left = await recoveryCodeModel.countLeft(db, user.id);
    await db.transaction(async (trx) => {
      await auditLogModel.append(trx, { actorId: user.id, action: `${prefix}.recovery_code.used`, target: `user:${user.id}`, after: { left } });
      await queueEmail(env, trx, { template: 'recovery_used', to: user.email, data: { name: user.name, left } });
      // the other admins hear about it (doc 16.3)
      if (staff) await outboxModel.add(trx, 'admin.alert', { type: 'recovery_code_used', userId: user.id, left });
    });
    return 'recovery';
  }
  if (challengeId) await mfaChallengeModel.attempt(db, challengeId);
  const after = await mfaTotpModel.failed(db, user.id, { maxFailures: MAX_FAILURES, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) });
  const locked = after.locked_until && new Date(after.locked_until) > new Date();
  await db.transaction(async (trx) => {
    await auditLogModel.append(trx, { actorId: user.id, action: locked ? `${prefix}.mfa.locked` : `${prefix}.mfa.failed`, target: `user:${user.id}` });
    if (locked && staff) await outboxModel.add(trx, 'admin.alert', { type: 'mfa_locked', userId: user.id });
  });
  if (locked) throw new AppError(423, 'MFA_LOCKED', `Too many wrong codes. Try again in ${LOCK_MINUTES} minutes.`);
  const left = MAX_FAILURES - after.failed_count;
  throw new AppError(401, 'MFA_INVALID', `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left before a ${LOCK_MINUTES} minute lock.`);
}

/** A new secret for the person to scan; nothing changes for sign-in until confirmEnrolment. */
export async function beginEnrolment(env, db, user, issuer = 'SnackHub') {
  const secret = newTotpSecret();
  await mfaSetupModel.put(db, user.id, encryptSecret(env, secret), new Date(Date.now() + SETUP_MINUTES * 60_000));
  const url = otpauthUrl(user.email, secret, issuer);
  return { secret, otpauthUrl: url, qr: await QRCode.toDataURL(url, { margin: 1, width: 240 }), expiresInMinutes: SETUP_MINUTES };
}

/**
 * Activates the waiting secret if the code from the app matches it. Returns the ten recovery
 * codes, to be shown once. Runs in the caller's transaction.
 */
export async function confirmEnrolment(env, trx, user, rawCode, { portal } = {}) {
  const setup = await mfaSetupModel.findLive(trx, user.id);
  if (!setup) throw new AppError(410, 'MFA_SETUP_EXPIRED', 'The setup timed out. Start again to get a new QR code.');
  const step = totpStep(decryptSecret(env, setup.secret_enc), String(rawCode ?? '').trim());
  if (step === null) throw new AppError(422, 'MFA_INVALID', 'That code does not match. Check the time on your phone and try the newest code.');
  const codes = newRecoveryCodes();
  await mfaTotpModel.enrol(trx, user.id, setup.secret_enc);
  await mfaTotpModel.passed(trx, user.id, step);
  await recoveryCodeModel.replace(trx, user.id, codes.map(hashCode));
  await mfaSetupModel.remove(trx, user.id);
  await auditLogModel.append(trx, { actorId: user.id, action: `${STAFF_ROLES.includes(portal) ? 'admin' : 'auth'}.mfa.enrolled`, target: `user:${user.id}` });
  await queueEmail(env, trx, { template: 'mfa_enabled', to: user.email, data: { name: user.name } });
  return codes;
}

/** Ten new recovery codes; the old ones stop working. */
export async function regenerateRecoveryCodes(env, trx, user) {
  const codes = newRecoveryCodes();
  await recoveryCodeModel.replace(trx, user.id, codes.map(hashCode));
  await auditLogModel.append(trx, { actorId: user.id, action: 'auth.recovery_codes.regenerated', target: `user:${user.id}` });
  await queueEmail(env, trx, { template: 'recovery_regenerated', to: user.email, data: { name: user.name } });
  return codes;
}
