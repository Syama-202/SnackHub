// Push notifications for the signed-in device, under /auth so the refresh cookie (this
// device's session) comes along.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { pushController } from '../controllers/push.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { limit, byUser } from '../middleware/rateLimit.js';
import { pushEndpointOk } from '../../../shared/domain/push.js';

const b64url = (min, max) => z.string().min(min).max(max).regex(/^[A-Za-z0-9_-]+={0,2}$/, 'Not a push key');
const endpoint = z.string().max(1000).refine(pushEndpointOk, 'Not a browser push service address');
const subscription = z
  .object({
    endpoint,
    // the browser's encryption keys for this subscription (P-256 public key and auth secret)
    keys: z.object({ p256dh: b64url(80, 100), auth: b64url(16, 30) }).strict(),
    expirationTime: z.number().nullable().optional(),
    device: z.string().trim().min(2).max(60).regex(/^[\w .,()/+-]+$/).optional(),
  })
  .strict();
const one = z.object({ endpoint }).strict();
// the endpoint is a secret address, so it travels in a body, never in a URL
const status = z.object({ endpoint: endpoint.optional() }).strict();

export function pushRoutes(deps) {
  const c = pushController(deps);
  const router = Router();
  const me = [requireAuth(deps.env), requirePermission(deps, 'notifications.self')];
  const changes = limit(deps, 'push.changes', { minutes: 15, max: 20 }, byUser);
  const tests = limit(deps, 'push.test', { minutes: 15, max: 5 }, byUser, 'Too many test alerts. Try again in a few minutes.');
  router.post('/auth/push/status', ...me, validateBody(status), wrap(c.show));
  router.post('/auth/push/subscriptions', ...me, changes, validateBody(subscription), wrap(c.subscribe));
  router.post('/auth/push/unsubscribe', ...me, changes, validateBody(one), wrap(c.unsubscribe));
  router.post('/auth/push/test', ...me, tests, validateBody(z.object({}).strict()), wrap(c.test));
  return router;
}
