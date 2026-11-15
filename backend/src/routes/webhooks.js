// Provider webhooks (doc 10.9). The body is read raw, before the JSON parser, so the exact
// bytes are what is checked and recorded. No zod schema: the provider's format is not ours to
// fix and the body is never trusted; the handler takes only the ids from it and asks the
// provider's status API.
import express, { Router } from 'express';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { limit, byIp } from '../middleware/rateLimit.js';
import { webhooksController } from '../controllers/webhooks.js';

export function webhookRoutes(deps) {
  const c = webhooksController(deps);
  const router = Router();
  const perIp = limit(deps, 'webhooks.ip', { minutes: 1, max: 300 }, byIp);
  const raw = express.raw({ type: '*/*', limit: '64kb' });
  router.post('/api/v1/webhooks/razorpay', perIp, raw, wrap(c.razorpay));
  router.post('/api/v1/webhooks/phonepe', perIp, raw, wrap(c.phonepe));
  return router;
}
