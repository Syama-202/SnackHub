import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { createLimiter } from '../utils/rateLimit.js';
import { deliveryController } from '../controllers/delivery.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const id = z.coerce.number().int().positive();
const status = z.object({ status: z.enum(['ONLINE', 'OFFLINE']) }).strict();
const ping = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracyM: z.number().min(0).max(10_000).optional() }).strict();
const offerParams = z.object({ id, action: z.enum(['accept', 'decline']) }).strict();
const stepParams = z.object({ id, step: z.enum(['picked-up', 'deliver', 'emergency', 'unreachable']) }).strict();
const STEP_BODY = {
  'picked-up': z.object({ sealed: z.literal(true, { errorMap: () => ({ message: 'Confirm the package is sealed and the items are counted' }) }) }).strict(),
  deliver: z.object({ code: z.string().regex(/^\d{4}$/, 'The code has 4 digits'), collectedPaise: z.number().int().min(0).max(10_000_000).optional() }).strict(),
  emergency: z.object({ note: z.string().trim().max(200).optional() }).strict(),
  unreachable: z.object({}).strict(),
};
// the step decides which body is valid
const stepBody = (req, res, next) => validateBody(STEP_BODY[req.params.step])(req, res, next);

export function deliveryRoutes(deps) {
  const router = Router();
  const auth = requireAuth(deps.env);
  const c = deliveryController(deps);
  const can = (permission) => [auth, requirePermission(deps, permission)];
  const perRider = (name, max) => rateLimit(createLimiter({ windowMs: 60_000, max }), (req) => `${name}:${req.user.userId}`);

  router.get('/rider/me', ...can('rider.profile.self'), wrap(c.me));
  router.put('/rider/status', ...can('rider.availability'), perRider('status', 30), validateBody(status), wrap(c.setStatus));
  router.post('/rider/location', ...can('rider.location.write'), perRider('ping', 120), validateBody(ping), wrap(c.location));
  router.get('/rider/offers', ...can('rider.deliveries.read'), wrap(c.offers));
  router.post('/rider/offers/:id/:action', ...can('rider.deliveries.accept'), perRider('offer', 60), validateParams(offerParams), validateBody(z.object({}).strict()), wrap(c.respond));
  router.get('/rider/active', ...can('rider.deliveries.read'), wrap(c.active));
  router.post('/rider/orders/:id/:step', ...can('rider.deliveries.accept'), perRider('step', 30), validateParams(stepParams), stepBody, wrap(c.step));
  router.get('/rider/earnings', ...can('rider.earnings.read'), wrap(c.earnings));
  return router;
}
