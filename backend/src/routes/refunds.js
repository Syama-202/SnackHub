// Failed refunds, for admins on the admin host: reading needs the console's second factor,
// sending a refund again one from the last five minutes.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { refundsController } from '../controllers/refunds.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { requireAuth, requirePermission, requireFreshMfa, adminHostOnly } from '../middleware/auth.js';
import { limit, byUser } from '../middleware/rateLimit.js';

const idParams = z.object({ id: z.coerce.number().int().positive() }).strict();
// sending again takes nothing but the refund's id: any body field is refused
const noBody = z.object({}).strict();

export function refundsRoutes(deps) {
  const c = refundsController(deps);
  const router = Router();
  const staff = [adminHostOnly(deps.env), requireAuth(deps.env), requirePermission(deps, 'refunds.manage'), requireFreshMfa(8 * 60)];
  const decisions = limit(deps, 'admin.decisions', { minutes: 1, max: 60 }, byUser);
  router.get('/admin/refunds/failed', ...staff, wrap(c.failed));
  router.post('/admin/refunds/:id/retry', ...staff, decisions, requireFreshMfa(5), validateParams(idParams), validateBody(noBody), wrap(c.retry));
  return router;
}
