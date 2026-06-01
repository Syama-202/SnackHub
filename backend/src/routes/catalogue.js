// The shared product catalogue, admin side, on the admin host with recent MFA.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { catalogueController } from '../controllers/catalogue.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { requireAuth, requirePermission, requireFreshMfa, adminHostOnly } from '../middleware/auth.js';
import { limit, byUser } from '../middleware/rateLimit.js';
import { CATEGORIES, SHAPES } from '../../../shared/domain/menu.js';

const id = z.coerce.number().int().positive();
const idParams = z.object({ id }).strict();
const fields = {
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(500),
  category: z.enum(CATEGORIES),
  servingTemp: z.enum(['HOT', 'AMBIENT']),
  weight: z.string().trim().max(20),
  spice: z.number().int().min(0).max(3),
  vegetarian: z.boolean(),
  allergens: z.array(z.string().trim().min(2).max(20)).max(8),
  shape: z.enum(SHAPES),
};
const optional = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.optional()]));
const { title, category, servingTemp, ...rest } = fields;
const newEntry = z.object({ title, category, servingTemp, ...optional(rest) }).strict();
const changes = z
  .object({ ...optional(fields), active: z.boolean().optional() })
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'Nothing to change');
const link = z.object({ productId: id }).strict();
const listQuery = z.object({ q: z.string().trim().max(60).optional(), all: z.enum(['1']).optional() }).strict();

export function catalogueRoutes(deps) {
  const c = catalogueController(deps);
  const router = Router();
  const staff = [adminHostOnly(deps.env), requireAuth(deps.env), requirePermission(deps, 'catalogue.manage'), requireFreshMfa(8 * 60)];
  const edits = limit(deps, 'admin.catalogue', { minutes: 1, max: 60 }, byUser);
  router.get('/admin/catalogue', ...staff, validateQuery(listQuery), wrap(c.list));
  router.post('/admin/catalogue', ...staff, edits, validateBody(newEntry), wrap(c.create));
  router.patch('/admin/catalogue/:id', ...staff, edits, validateParams(idParams), validateBody(changes), wrap(c.update));
  router.post('/admin/catalogue/:id/link', ...staff, edits, validateParams(idParams), validateBody(link), wrap(c.link));
  return router;
}
