import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { applicationsController } from '../controllers/applications.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { requireAuth, requireRole, requireFreshMfa, adminHostOnly } from '../middleware/auth.js';

const text = (min, max) => z.string().trim().min(min).max(max);
// Role, status, user id and checks are never accepted from the body: .strict() refuses them
const sellerApply = z
  .object({
    shopName: text(3, 120),
    // a home kitchen or street stall applies the same way; the admin checks the right licence
    kind: z.enum(['shop', 'stall', 'home']).optional(),
    city: text(2, 40),
    region: text(2, 40).optional(),
    lat: z.number().min(6).max(38),
    lng: z.number().min(68).max(98),
    radiusKm: z.number().min(1).max(10),
    openHours: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM-HH:MM'),
    licenceNo: z.string().trim().regex(/^[A-Za-z0-9-]{6,40}$/, 'Letters, numbers and dashes only'),
    licenceExpiresOn: z.string().date().refine((d) => d > new Date().toISOString().slice(0, 10), 'The licence has expired'),
  })
  .strict();
const riderApply = z
  .object({
    name: text(2, 120),
    city: text(2, 40),
    vehicle: z.enum(['Scooter', 'EV scooter', 'Motorbike', 'Bicycle']),
    vehicleNo: z.string().trim().toUpperCase().regex(/^[A-Z0-9 -]{4,16}$/, 'Letters and numbers only'),
    licenceNo: z.string().trim().regex(/^[A-Za-z0-9 -]{6,30}$/, 'Letters and numbers only'),
  })
  .strict();
const appParams = z.object({ id: z.string().regex(/^(seller|rider)-\d{1,12}$/) });
const decideParams = appParams.extend({ action: z.enum(['approve', 'reject', 'needs-info']) });
const checkBody = z.object({ check: z.string().regex(/^[a-zA-Z]{2,20}$/), value: z.boolean() }).strict();
const decideBody = z.object({ reason: text(3, 500).optional() }).strict();
const listQuery = z.object({ status: z.enum(['open', 'all']).optional() }).strict();

export function applicationsRoutes(deps) {
  const c = applicationsController(deps);
  const router = Router();
  const auth = requireAuth(deps.env);
  const customer = requireRole(deps.dbs, 'customer');
  // admin: only on the admin host, role re-read from MySQL, plus a second factor in the last
  // 8 hours, and in the last 5 minutes for a decision (doc 16.3)
  const admin = [adminHostOnly(deps.env), auth, requireRole(deps.dbs, 'admin'), requireFreshMfa(8 * 60)];

  router.post('/seller/apply', auth, customer, validateBody(sellerApply), wrap(c.applySeller));
  router.get('/seller/application', auth, wrap(c.sellerApplication));
  router.post('/rider/apply', auth, customer, validateBody(riderApply), wrap(c.applyRider));
  router.get('/rider/application', auth, wrap(c.riderApplication));

  router.get('/admin/applications', ...admin, validateQuery(listQuery), wrap(c.list));
  router.post('/admin/applications/:id/check', ...admin, validateParams(appParams), validateBody(checkBody), wrap(c.check));
  router.post('/admin/applications/:id/:action', ...admin, requireFreshMfa(5), validateParams(decideParams), validateBody(decideBody), wrap(c.decide));
  return router;
}
