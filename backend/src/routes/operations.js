import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { operationsController } from '../controllers/operations.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { requireAuth, requirePermission, requireFreshMfa, adminHostOnly } from '../middleware/auth.js';
import { limit, byUser } from '../middleware/rateLimit.js';

const idParams = z.object({ id: z.coerce.number().int().positive() }).strict();
const resolve = z.object({ reverse: z.boolean(), reason: z.string().trim().min(3, 'Give a reason').max(300) }).strict();

// every value the console can change, with the range it may take
const int = (min, max) => z.number().int().min(min).max(max);
const rules = z
  .object({ maxKm: z.number().min(0.5).max(10), maxRideMin: int(3, 30), prepMin: z.tuple([int(1, 30), int(1, 45)]).refine(([a, b]) => a <= b, 'Lowest first'), riderCap: int(1, 3) })
  .partial()
  .strict();
const policyChanges = z
  .object({
    speedKmph: z.number().min(5).max(40),
    roadFactor: z.number().min(1).max(2),
    handoverMin: int(0, 10),
    acceptMin: int(0, 10),
    maxPromiseMin: int(15, 60),
    hot: rules,
    ambient: rules,
    offerTimeoutSec: int(10, 60),
    sellerAcceptTimeoutSec: int(60, 600),
    otpRevealM: int(100, 2000),
    arrivalGeofenceM: int(50, 500),
    otpMaxAttempts: int(1, 5),
    graceMin: int(0, 15),
    lateRatePaisePerMin: int(0, 2000),
    penaltyCapPaise: int(0, 10_000),
    baseFeePaise: int(0, 20_000),
    distanceFeePaisePerKm: int(0, 5000),
    onTimeBonusPaise: int(0, 5000),
    deliveryFeePaise: int(0, 20_000),
    codEnabled: z.boolean(),
  })
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'Nothing to change');

export function operationsRoutes(deps) {
  const router = Router();
  const c = operationsController(deps);
  const staff = (permission) => [adminHostOnly(deps.env), requireAuth(deps.env), requirePermission(deps, permission), requireFreshMfa(8 * 60)];
  const stepUp = requireFreshMfa(5);
  const decisions = limit(deps, 'admin.decisions', { minutes: 1, max: 60 }, byUser);

  router.get('/admin/metrics/sla', ...staff('operations.read'), wrap(c.sla));
  router.get('/admin/orders', ...staff('operations.read'), wrap(c.orders));
  router.get('/admin/riders', ...staff('operations.read'), wrap(c.riders));
  router.get('/admin/sellers', ...staff('operations.read'), wrap(c.sellers));
  router.get('/admin/reconciliation', ...staff('operations.read'), wrap(c.reconciliation));
  router.get('/admin/earnings', ...staff('operations.read'), wrap(c.earnings));
  router.post('/admin/earnings/:id/resolve', ...staff('earnings.resolve'), decisions, stepUp, validateParams(idParams), validateBody(resolve), wrap(c.resolveEarning));
  router.get('/admin/policy', ...staff('operations.read'), wrap(c.policy));
  router.put('/admin/policy', ...staff('policy.write'), decisions, stepUp, validateBody(policyChanges), wrap(c.savePolicy));
  return router;
}
