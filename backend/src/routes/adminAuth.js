import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { adminAuthController } from '../controllers/adminAuth.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, requireRole, requireClientHeader, adminHostOnly } from '../middleware/auth.js';
import { limit, byIp, byUser } from '../middleware/rateLimit.js';
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
  const perIp = limit(deps, 'admin-auth.ip', { minutes: 15, max: 30 }, byIp);
  const sessions = limit(deps, 'admin-auth.session.ip', { minutes: 15, max: 120 }, byIp);
  const stepUp = limit(deps, 'admin-auth.step-up', { minutes: 15, max: 10 }, byUser);

  router.post('/admin/auth/google', host, perIp, validateBody(googleBody), wrap(c.google));
  router.post('/admin/auth/mfa', host, perIp, validateBody(mfaBody), wrap(c.mfa));
  router.post('/admin/auth/refresh', host, sessions, requireClientHeader, wrap(c.refresh));
  router.post('/admin/auth/step-up', host, ...staff, stepUp, validateBody(stepUpBody), wrap(c.stepUp));
  router.post('/admin/auth/logout', host, sessions, requireClientHeader, wrap(c.logout));
  router.post('/admin/auth/logout-all', host, sessions, requireClientHeader, ...staff, wrap(c.logoutAll));
  router.post('/admin/auth/enrol/info', host, perIp, validateBody(enrolInfoBody), wrap(c.enrolInfo));
  router.post('/admin/auth/enrol', host, perIp, validateBody(enrolBody), wrap(c.enrol));
  return router;
}
