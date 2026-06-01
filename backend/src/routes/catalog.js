import { PINCODE } from '../../../shared/domain/hours.js';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { catalogController } from '../controllers/catalog.js';
import { validateQuery, validateParams } from '../middleware/validate.js';
import { limit, byIp } from '../middleware/rateLimit.js';

// a delivery point inside India
const num = () => z.coerce.number({ error: 'Must be a number' });
const lat = num().min(6).max(38);
const lng = num().min(68).max(98);
const point = { lat, lng };

const pincode = z.string().regex(PINCODE).optional();
const nearQuery = z.object({ ...point, pincode }).strict();
const sellersQuery = z.object({ ...point, pincode, temp: z.enum(['HOT', 'AMBIENT']).optional() }).strict();
const shopQuery = z.object({ lat: lat.optional(), lng: lng.optional(), pincode }).strict();
const searchQuery = z.object({ ...point, pincode, q: z.string().trim().min(1).max(60) }).strict();
const idParams = z.object({ id: z.coerce.number().int().positive() });

// Public reads: no sign-in needed to browse (doc 11.2)
export function catalogRoutes(deps) {
  const c = catalogController(deps);
  const router = Router();
  // per address: browsing pages, and a tighter one for search, which costs the most
  const browse = limit(deps, 'catalog.browse.ip', { minutes: 1, max: 120 }, byIp);
  const search = limit(deps, 'catalog.search.ip', { minutes: 1, max: 60 }, byIp, 'Too many searches. Wait a moment and try again.');
  router.get('/cities', browse, wrap(c.cities));
  router.get('/sellers', browse, validateQuery(sellersQuery), wrap(c.sellers));
  router.get('/sellers/:id', browse, validateParams(idParams), validateQuery(shopQuery), wrap(c.seller));
  router.get('/products', browse, validateQuery(nearQuery), wrap(c.products));
  router.get('/catalogue/:id/offers', browse, validateParams(idParams), validateQuery(nearQuery), wrap(c.offers));
  router.get('/search', search, validateQuery(searchQuery), wrap(c.search));
  return router;
}
