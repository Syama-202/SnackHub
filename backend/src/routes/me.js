import { Router } from 'express';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { meController } from '../controllers/me.js';
import { requireAuth } from '../middleware/auth.js';

export function meRoutes(deps) {
  const c = meController(deps);
  const router = Router();
  router.get('/me', requireAuth(deps.env), wrap(c.show));
  return router;
}
