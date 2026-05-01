import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { authController } from '../controllers/auth.js';
import { validateBody } from '../middleware/validate.js';
import { requireClientHeader } from '../middleware/auth.js';
import { limit, byIp, emailOf } from '../middleware/rateLimit.js';
import { PASSWORD_MAX } from '../../../shared/domain/passwords.js';

// shared field rules; .strict() on every body refuses fields like role or status
export const fields = {
  portal: z.enum(['customer', 'seller', 'rider']),
  email: z.string().trim().toLowerCase().max(255).email('Enter a valid email address'),
  name: z.string().trim().min(2, 'Enter your full name').max(120).regex(/^[\p{L}][\p{L} .'-]*$/u, 'Use letters, spaces, dots and hyphens only'),
  password: z.string().min(1, 'Enter a password').max(PASSWORD_MAX),
  // a random id the browser keeps for itself, one session per device
  deviceId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  linkToken: z.string().regex(/^[\w-]{43}$/, 'This link is not complete'),
  challenge: z.string().regex(/^[\w-]{43}$/),
  code: z.string().trim().regex(/^(\d{6}|[A-Za-z2-9]{4}-[A-Za-z2-9]{4})$/, 'Enter the 6-digit code or a recovery code'),
  totpCode: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from the app'),
  countryCode: z.string().regex(/^\+[1-9]\d{0,3}$/, 'Like +91'),
  localMobile: z.string().trim().regex(/^\d{6,14}$/, 'Digits only, without the country code'),
};
/** country code + local number -> E.164 ("+919876543210"), checked for length */
export const toE164 = (countryCode, local) => `${countryCode}${local.replace(/^0+/, '')}`;
const e164 = /^\+[1-9]\d{7,14}$/;

const register = z
  .object({
    portal: fields.portal,
    name: fields.name,
    email: fields.email,
    password: fields.password,
    countryCode: fields.countryCode.optional(),
    mobile: fields.localMobile.optional(),
    acceptTerms: z.literal(true, { error: 'Accept the terms and privacy policy to continue' }),
  })
  .strict()
  .superRefine((b, ctx) => {
    if (b.mobile && !b.countryCode) ctx.addIssue({ code: 'custom', path: ['countryCode'], message: 'Pick a country code' });
    if (b.mobile && b.countryCode && !e164.test(toE164(b.countryCode, b.mobile))) ctx.addIssue({ code: 'custom', path: ['mobile'], message: 'This number is too short or too long' });
  })
  .transform(({ countryCode, mobile, acceptTerms: _a, ...rest }) => ({ ...rest, mobile: mobile ? toE164(countryCode, mobile) : null }));

const signIn = z
  .object({
    portal: fields.portal,
    identifier: z.string().trim().min(3).max(255).refine((v) => e164.test(v) || z.string().email().safeParse(v).success, 'Enter your email, or your verified mobile with the country code (+91...)').transform((v) => (v.startsWith('+') ? v : v.toLowerCase())),
    password: fields.password,
    deviceId: fields.deviceId,
  })
  .strict();
const google = z.object({ credential: z.string().min(100).max(4096).regex(/^[\w-]+\.[\w-]+\.[\w-]+$/), deviceId: fields.deviceId }).strict();
const tokenOnly = z.object({ token: fields.linkToken }).strict();
const emailOnly = z.object({ email: fields.email }).strict();
const reset = z.object({ token: fields.linkToken, password: fields.password }).strict();
const mfaVerify = z.object({ challenge: fields.challenge, code: fields.code, deviceId: fields.deviceId }).strict();
const enrolStart = z.object({ challenge: fields.challenge, deviceId: fields.deviceId }).strict();
const enrolConfirm = z.object({ challenge: fields.challenge, deviceId: fields.deviceId, code: fields.totpCode }).strict();

export function authRoutes(deps) {
  const c = authController(deps);
  const router = Router();
  // shared limits (utils/rateLimit.js); the account lockout and the challenge's own try count
  // apply on top. Sign-in also counts per email alone, so changing IP address does not reset
  // the tries on one account.
  const perIp = (name, max, minutes) => limit(deps, `auth.${name}.ip`, { minutes, max }, byIp);
  const perIdentity = (name, max, minutes) => limit(deps, `auth.${name}.ip-email`, { minutes, max }, (req) => `${req.ip}|${emailOf(req)}`);
  const perEmail = (name, max, minutes) => limit(deps, `auth.${name}.email`, { minutes, max }, emailOf);

  router.post('/auth/register', perIp('register', 10, 60), validateBody(register), wrap(c.register));
  router.post('/auth/verify-email', perIp('verify-email', 30, 15), validateBody(tokenOnly), wrap(c.verifyEmail));
  router.post('/auth/resend-verification', perIdentity('resend', 3, 15), perEmail('resend', 5, 60), validateBody(emailOnly), wrap(c.resendVerification));
  router.post('/auth/signin', perIp('signin', 40, 15), perIdentity('signin', 10, 15), perEmail('signin', 20, 15), validateBody(signIn), wrap(c.signIn));
  router.post('/auth/join', perIp('join', 40, 15), perIdentity('join', 10, 15), perEmail('join', 20, 15), validateBody(signIn), wrap(c.join));
  router.post('/auth/google', perIp('google', 40, 15), validateBody(google), wrap(c.google));
  router.post('/auth/mfa/verify', perIp('mfa-verify', 30, 15), validateBody(mfaVerify), wrap(c.mfaVerify));
  router.post('/auth/mfa/enrol/start', perIp('enrol-start', 20, 15), validateBody(enrolStart), wrap(c.enrolStart));
  router.post('/auth/mfa/enrol/confirm', perIp('enrol-confirm', 30, 15), validateBody(enrolConfirm), wrap(c.enrolConfirm));
  router.post('/auth/password/forgot', perIdentity('forgot', 3, 15), perEmail('forgot', 5, 60), validateBody(emailOnly), wrap(c.forgotPassword));
  router.post('/auth/password/reset', perIp('reset', 20, 15), validateBody(reset), wrap(c.resetPassword));
  router.post('/auth/refresh', perIp('refresh', 120, 15), requireClientHeader, wrap(c.refresh));
  router.post('/auth/logout', perIp('logout', 60, 15), requireClientHeader, wrap(c.logout));
  return router;
}
