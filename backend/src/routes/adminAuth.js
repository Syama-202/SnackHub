import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { createLimiter } from '../utils/rateLimit.js';
import { adminAuthController } from '../controllers/adminAuth.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, requireRole, requireClientHeader, adminHostOnly } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { fields } from './auth.js';

const googleBody = z.object({ credential: z.string().min(100).max(4096).regex(/^[\w-]+\.[\w-]+\.[\w-]+$/), deviceId: fields.deviceId }).strict();
const mfaBody = z.object({ challenge: fields.challenge, code: fields.code }).strict();
const stepUpBody = z.object({ code: fields.code }).strict();
const enrolInfoBody = z.object({ token: fields.linkToken }).strict();
const enrolBody = z.object({ token: fields.linkToken, code: fields.totpCode }).strict();

export function adminAuthRoutes(deps) {
  const c = adminAuthController(deps);
  const router = Router();
  const host = adminHostOnly(deps.env);
  const staff = [requireAuth(deps.env), requireRole(deps.dbs, 'admin', 'reviewer')];
  const limiter = createLimiter({ windowMs: 15 * 60_000, max: 30 });
  const perIp = rateLimit(limiter, (req) => req.ip);

  router.post('/admin/auth/google', host, perIp, validateBody(googleBody), wrap(c.google));
  router.post('/admin/auth/mfa', host, perIp, validateBody(mfaBody), wrap(c.mfa));
  router.post('/admin/auth/refresh', host, requireClientHeader, wrap(c.refresh));
  router.post('/admin/auth/step-up', host, ...staff, validateBody(stepUpBody), wrap(c.stepUp));
  router.post('/admin/auth/logout', host, requireClientHeader, wrap(c.logout));
  router.post('/admin/auth/logout-all', host, requireClientHeader, ...staff, wrap(c.logoutAll));
  router.post('/admin/auth/enrol/info', host, perIp, validateBody(enrolInfoBody), wrap(c.enrolInfo));
  router.post('/admin/auth/enrol', host, perIp, validateBody(enrolBody), wrap(c.enrol));
  return router;
}
