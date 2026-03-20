import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { createLimiter } from '../utils/rateLimit.js';
import { securityController } from '../controllers/security.js';
import { authController } from '../controllers/auth.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { fields, toE164 } from './auth.js';

const passwordChange = z.object({ current: fields.password, next: fields.password }).strict();
const codeOnly = z.object({ code: fields.code }).strict();
const totpOnly = z.object({ code: fields.totpCode }).strict();
const empty = z.object({}).strict();
const mobile = z
  .object({ countryCode: fields.countryCode, mobile: fields.localMobile })
  .strict()
  .transform((b) => ({ mobile: toE164(b.countryCode, b.mobile) }))
  .refine((b) => /^\+[1-9]\d{7,14}$/.test(b.mobile), { message: 'This number is too short or too long', path: ['mobile'] });
const mobileCode = z.object({ code: fields.totpCode }).strict();
const familyParams = z.object({ familyId: z.string().uuid() }).strict();

export function securityRoutes(deps) {
  const c = securityController(deps);
  const a = authController(deps);
  const router = Router();
  const me = [requireAuth(deps.env), requirePermission(deps, 'security.self')];
  const codes = createLimiter({ windowMs: 15 * 60_000, max: 10 });
  const perUser = rateLimit(codes, (req) => `user:${req.user.userId}`);

  router.get('/auth/security', ...me, wrap(c.show));
  router.post('/auth/password/change', ...me, perUser, validateBody(passwordChange), wrap(c.changePassword));
  router.post('/auth/security/mfa/start', ...me, validateBody(empty), wrap(a.enrolStart));
  router.post('/auth/security/mfa/confirm', ...me, perUser, validateBody(totpOnly), wrap(a.enrolConfirm));
  router.post('/auth/mfa/disable', ...me, perUser, validateBody(codeOnly), wrap(c.disableMfa));
  router.post('/auth/mfa/recovery-codes', ...me, perUser, validateBody(codeOnly), wrap(c.newRecoveryCodes));
  router.delete('/auth/sessions/:familyId', ...me, validateParams(familyParams), wrap(c.endOneSession));
  router.post('/auth/logout-all', ...me, wrap(c.logoutAll));
  router.post('/auth/mobile/start', ...me, validateBody(mobile), wrap(c.startMobile));
  router.post('/auth/mobile/verify', ...me, perUser, validateBody(mobileCode), wrap(c.verifyMobile));
  return router;
}
