// Seller payouts: the admin side on the admin host with fresh MFA (drafting, paying and
// cancelling need a second factor from the last five minutes), and the shop's own read.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { payoutsController } from '../controllers/payouts.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { requireAuth, requirePermission, requireFreshMfa, adminHostOnly } from '../middleware/auth.js';
import { limit, byUser } from '../middleware/rateLimit.js';

const idParams = z.object({ id: z.coerce.number().int().positive() }).strict();
const draft = z.object({ sellerId: z.number().int().positive() }).strict();
// a bank transfer reference (UTR or similar): letters, digits and a few separators
const paid = z.object({ reference: z.string().trim().min(6).max(60).regex(/^[A-Za-z0-9/_.-]+$/, 'Use the bank reference: letters, digits, / _ . -') }).strict();
const cancel = z.object({ reason: z.string().trim().min(5).max(200) }).strict();

export function payoutsRoutes(deps) {
  const c = payoutsController(deps);
  const router = Router();
  const staff = (permission) => [adminHostOnly(deps.env), requireAuth(deps.env), requirePermission(deps, permission), requireFreshMfa(8 * 60)];
  const stepUp = requireFreshMfa(5);
  const decisions = limit(deps, 'admin.decisions', { minutes: 1, max: 60 }, byUser);
  router.get('/admin/payouts', ...staff('payouts.manage'), wrap(c.overview));
  router.get('/admin/payouts/:id', ...staff('payouts.manage'), validateParams(idParams), wrap(c.show));
  router.post('/admin/payouts', ...staff('payouts.manage'), decisions, stepUp, validateBody(draft), wrap(c.draft));
  router.post('/admin/payouts/:id/paid', ...staff('payouts.manage'), decisions, stepUp, validateParams(idParams), validateBody(paid), wrap(c.paid));
  router.post('/admin/payouts/:id/cancel', ...staff('payouts.manage'), decisions, stepUp, validateParams(idParams), validateBody(cancel), wrap(c.cancel));
  router.get('/seller/payouts', requireAuth(deps.env), requirePermission(deps, 'seller.settlements.receive'), wrap(c.mine));
  return router;
}
