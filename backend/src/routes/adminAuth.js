import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { adminAuthController } from '../controllers/adminAuth.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, requireRole, requireClientHeader, adminHostOnly } from '../middleware/auth.js';

const deviceId = z.string().regex(/^[A-Za-z0-9-]{8,64}$/);
const code = z.string().trim().regex(/^(\d{6}|[A-Za-z2-9]{4}-[A-Za-z2-9]{4})$/, 'Enter the 6-digit code or a recovery code');
const linkToken = z.string().regex(/^[\w-]{43}$/);

const googleBody = z.object({ credential: z.string().min(100).max(4096).regex(/^[\w-]+\.[\w-]+\.[\w-]+$/), deviceId }).strict();
const mfaBody = z.object({ halfToken: z.string().min(20).max(1024), code }).strict();
const stepUpBody = z.object({ code }).strict();
const enrolInfoBody = z.object({ token: linkToken }).strict();
const enrolBody = z.object({ token: linkToken, code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from the app') }).strict();

export function adminAuthRoutes(deps) {
  const c = adminAuthController(deps);
  const router = Router();
  const host = adminHostOnly(deps.env);
  const admin = [requireAuth(deps.env), requireRole(deps.dbs, 'admin')];

  router.post('/admin/auth/google', host, validateBody(googleBody), wrap(c.google));
  router.post('/admin/auth/mfa', host, validateBody(mfaBody), wrap(c.mfa));
  router.post('/admin/auth/refresh', host, requireClientHeader, wrap(c.refresh));
  router.post('/admin/auth/step-up', host, ...admin, validateBody(stepUpBody), wrap(c.stepUp));
  router.post('/admin/auth/logout', host, requireClientHeader, wrap(c.logout));
  router.post('/admin/auth/logout-all', host, requireClientHeader, ...admin, wrap(c.logoutAll));
  router.post('/admin/auth/enrol/info', host, validateBody(enrolInfoBody), wrap(c.enrolInfo));
  router.post('/admin/auth/enrol', host, validateBody(enrolBody), wrap(c.enrol));
  return router;
}
