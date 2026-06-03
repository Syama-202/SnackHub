// Error monitoring: browsers report crashes (no sign-in, a small per-address limit); admins
// read and close them on the admin host.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { errorsController } from '../controllers/errors.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { requireAuth, requirePermission, requireFreshMfa, adminHostOnly } from '../middleware/auth.js';
import { limit, byIp, byUser } from '../middleware/rateLimit.js';
import { ERROR_SOURCES, ERROR_STATUSES, LIMITS } from '../../../shared/domain/errors.js';

const text = (max) => z.string().max(max * 4).transform((s) => s.slice(0, max));
const report = z
  .object({
    source: z.enum(['web', 'admin']),
    kind: text(LIMITS.kind).optional(),
    message: text(LIMITS.message),
    stack: text(LIMITS.stack).optional(),
    // a path on this site, never a full URL
    page: z.string().max(400).regex(/^\/[^\s]*$/, 'A path on this site'),
    release: z.string().regex(/^[\w.+-]{1,40}$/).optional(),
    browser: z.string().max(60).regex(/^[\w .,()/+-]+$/).optional(),
  })
  .strict();
const listQuery = z.object({ status: z.enum(ERROR_STATUSES).optional(), source: z.enum(ERROR_SOURCES).optional() }).strict();
const idParams = z.object({ id: z.coerce.number().int().positive() }).strict();
const status = z.object({ status: z.enum(ERROR_STATUSES) }).strict();

export function errorsRoutes(deps) {
  const c = errorsController(deps);
  const router = Router();
  const staff = [adminHostOnly(deps.env), requireAuth(deps.env), requirePermission(deps, 'errors.manage'), requireFreshMfa(8 * 60)];
  const reports = limit(deps, 'client.errors.ip', { minutes: 10, max: 20 }, byIp);
  router.post('/client-errors', reports, validateBody(report), wrap(c.report));
  router.get('/admin/errors', ...staff, validateQuery(listQuery), wrap(c.list));
  router.get('/admin/errors/:id', ...staff, validateParams(idParams), wrap(c.show));
  router.post('/admin/errors/:id/status', ...staff, limit(deps, 'admin.errors', { minutes: 1, max: 60 }, byUser), validateParams(idParams), validateBody(status), wrap(c.setStatus));
  return router;
}
