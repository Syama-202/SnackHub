import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { complaintsController } from '../controllers/complaints.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { listQuery } from '../utils/listQuery.js';
import { requireAuth, requirePermission, requireFreshMfa, adminHostOnly } from '../middleware/auth.js';
import { limit, byUser } from '../middleware/rateLimit.js';
import { uploadPhotos } from '../middleware/upload.js';
import { COMPLAINT_TYPES } from '../../../shared/domain/triage.js';

const idParams = z.object({ id: z.coerce.number().int().positive() }).strict();
// multipart fields arrive as strings: "12" or "12,13" or repeated itemIds fields
const ids = z.preprocess((v) => (v === undefined || v === '' ? [] : (Array.isArray(v) ? v : String(v).split(','))).map((x) => Number(x)), z.array(z.number().int().positive()).max(20));
const report = z
  .object({
    category: z.enum(Object.keys(COMPLAINT_TYPES)),
    subtype: z.string().regex(/^[A-Z_]{2,30}$/),
    description: z.string().trim().max(500).optional(),
    itemIds: ids.optional(),
  })
  .strict()
  .refine((b) => Boolean(COMPLAINT_TYPES[b.category].subtypes[b.subtype]), { message: 'Pick what went wrong from the list', path: ['subtype'] });
const paise = (max) => z.number().int().min(0).max(max).default(0);
const decision = z
  .object({
    resolution: z.enum(['VALID', 'PARTLY_VALID', 'INVALID']),
    reason: z.string().trim().min(3, 'Explain the decision').max(300),
    creditPaise: paise(50_000),
    riderFinePaise: paise(20_000),
    sellerFinePaise: paise(50_000),
  })
  .strict();
const reasonOnly = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(200) }).strict();

export function complaintsRoutes(deps) {
  const router = Router();
  const auth = requireAuth(deps.env);
  const c = complaintsController(deps);
  const reports = limit(deps, 'complaints.report', { minutes: 60, max: 10 }, byUser, 'Too many reports in an hour. Try again later.');
  const decisions = limit(deps, 'admin.decisions', { minutes: 1, max: 60 }, byUser);
  const staff = (permission) => [adminHostOnly(deps.env), auth, requirePermission(deps, permission), requireFreshMfa(8 * 60)];
  const stepUp = requireFreshMfa(5);

  router.post('/orders/:id/complaints', auth, requirePermission(deps, 'complaints.self'), reports, validateParams(idParams), uploadPhotos, validateBody(report), wrap(c.create));
  router.get('/me/credits', auth, requirePermission(deps, 'credits.self'), wrap(c.credits));
  router.get('/admin/complaints', ...staff('complaints.read'), validateQuery(listQuery), wrap(c.queue));
  router.post('/admin/complaints/:id/decide', ...staff('complaints.decide'), decisions, stepUp, validateParams(idParams), validateBody(decision), wrap(c.decide));
  router.get('/admin/fines', ...staff('complaints.read'), validateQuery(listQuery), wrap(c.fines));
  router.post('/admin/fines/:id/reverse', ...staff('fines.reverse'), decisions, stepUp, validateParams(idParams), validateBody(reasonOnly), wrap(c.reverseFine));
  return router;
}
