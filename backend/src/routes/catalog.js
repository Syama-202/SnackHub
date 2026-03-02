import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { catalogController } from '../controllers/catalog.js';
import { validateQuery, validateParams } from '../middleware/validate.js';

// a delivery point inside India
const num = () => z.coerce.number({ invalid_type_error: 'Must be a number' });
const lat = num().min(6).max(38);
const lng = num().min(68).max(98);
const point = { lat, lng };

const nearQuery = z.object(point).strict();
const sellersQuery = z.object({ ...point, temp: z.enum(['HOT', 'AMBIENT']).optional() }).strict();
const shopQuery = z.object({ lat: lat.optional(), lng: lng.optional() }).strict();
const searchQuery = z.object({ ...point, q: z.string().trim().min(1).max(60) }).strict();
const idParams = z.object({ id: z.coerce.number().int().positive() });

// Public reads: no sign-in needed to browse (doc 11.2)
export function catalogRoutes(deps) {
  const c = catalogController(deps);
  const router = Router();
  router.get('/cities', wrap(c.cities));
  router.get('/sellers', validateQuery(sellersQuery), wrap(c.sellers));
  router.get('/sellers/:id', validateParams(idParams), validateQuery(shopQuery), wrap(c.seller));
  router.get('/products', validateQuery(nearQuery), wrap(c.products));
  router.get('/search', validateQuery(searchQuery), wrap(c.search));
  return router;
}
