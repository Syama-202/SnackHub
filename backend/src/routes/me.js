import { Router } from 'express';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { z } from 'zod';
import { meController } from '../controllers/me.js';
import { addressesController } from '../controllers/addresses.js';
import { notificationsController } from '../controllers/notifications.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { requireAuth, requireRole, requirePermission } from '../middleware/auth.js';
import { limit, byUser } from '../middleware/rateLimit.js';
import { ROLES } from '../../../shared/domain/permissions.js';

// a pin anywhere in India; the city is the key the frontend uses (guntur, chennai, ...)
const address = z
  .object({
    label: z.string().trim().min(2).max(30),
    line: z.string().trim().min(8).max(255),
    cityId: z.string().trim().regex(/^[a-z-]{2,40}$/).optional(),
    lat: z.number().min(6).max(38),
    lng: z.number().min(68).max(98),
  })
  .strict();
const idParams = z.object({ id: z.coerce.number().int().positive() }).strict();

export function meRoutes(deps) {
  const c = meController(deps);
  const a = addressesController(deps);
  const n = notificationsController(deps);
  const auth = requireAuth(deps.env);
  const router = Router();
  const addresses = limit(deps, 'me.addresses', { minutes: 60, max: 30 }, byUser, 'Too many address changes in an hour. Try again later.');
  const reads = limit(deps, 'me.notifications.read', { minutes: 1, max: 30 }, byUser);
  router.get('/me', auth, requireRole(deps.dbs, ...ROLES), wrap(c.show));
  router.get('/me/addresses', auth, requirePermission(deps, 'addresses.self'), wrap(a.list));
  router.post('/me/addresses', auth, requirePermission(deps, 'addresses.self'), addresses, validateBody(address), wrap(a.create));
  router.delete('/me/addresses/:id', auth, requirePermission(deps, 'addresses.self'), addresses, validateParams(idParams), wrap(a.remove));
  router.get('/me/notifications', auth, requirePermission(deps, 'notifications.self'), wrap(n.list));
  router.post('/me/notifications/read', auth, requirePermission(deps, 'notifications.self'), reads, validateBody(z.object({}).strict()), wrap(n.readAll));
  return router;
}
