import { Router } from 'express';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { meController } from '../controllers/me.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ROLES } from '../../../shared/domain/permissions.js';

export function meRoutes(deps) {
  const c = meController(deps);
  const router = Router();
  router.get('/me', requireAuth(deps.env), requireRole(deps.dbs, ...ROLES), wrap(c.show));
  return router;
}
