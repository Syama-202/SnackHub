import { Router } from 'express';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { z } from 'zod';
import { meController } from '../controllers/me.js';
import { addressesController } from '../controllers/addresses.js';
import { notificationsController } from '../controllers/notifications.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { requireAuth, requireRole, requirePermission } from '../middleware/auth.js';
import { limit, byUser } from '../middleware/rateLimit.js';
import { ROLES } from '../../../shared/domain/permissions.js';
import { ADDRESS_KINDS, ADDRESS_LIMITS } from '../../../shared/domain/addresses.js';
import { PINCODE } from '../../../shared/domain/hours.js';

// a pin anywhere in India; the city is the key the frontend uses (guntur, chennai, ...)
const text = (k) => z.string().trim().min(ADDRESS_LIMITS[k][0]).max(ADDRESS_LIMITS[k][1]);
// optional details: an empty box clears the field
const detail = (k) => z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), text(k).nullable().optional());
const lat = z.number().min(6).max(38);
const lng = z.number().min(68).max(98);
const fields = {
  kind: z.enum(ADDRESS_KINDS),
  label: text('label'),
  line: text('line'),
  pincode: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().regex(PINCODE, 'A pincode is six digits and does not start with 0').nullable().optional()),
  house: detail('house'),
  floor: detail('floor'),
  landmark: detail('landmark'),
  instructions: detail('instructions'),
  cityId: z.string().trim().regex(/^[a-z-]{2,40}$/),
  lat,
  lng,
  isDefault: z.boolean(),
};
const named = (b) => b.kind !== 'OTHER' || Boolean(b.label);
const address = z
  .object({ ...fields, kind: fields.kind.default('HOME'), label: fields.label.optional(), cityId: fields.cityId.optional(), isDefault: fields.isDefault.optional() })
  .strict()
  .refine(named, { message: 'Give this place a name', path: ['label'] });
const addressChange = z
  .object(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()])))
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change' })
  .refine((b) => (b.lat === undefined) === (b.lng === undefined), { message: 'Send the pin as lat and lng together', path: ['lat'] })
  .refine((b) => b.isDefault !== false, { message: 'Make another address the default instead', path: ['isDefault'] });
const placeQuery = z.object({ q: z.string().trim().min(3).max(120) }).strict();
const pin = z.object({ lat, lng }).strict();
const idParams = z.object({ id: z.coerce.number().int().positive() }).strict();

export function meRoutes(deps) {
  const c = meController(deps);
  const a = addressesController(deps);
  const n = notificationsController(deps);
  const auth = requireAuth(deps.env);
  const router = Router();
  const addresses = limit(deps, 'me.addresses', { minutes: 60, max: 30 }, byUser, 'Too many address changes in an hour. Try again later.');
  // place search goes to an outside server: a few lookups while setting a pin is plenty
  const places = limit(deps, 'me.places', { minutes: 10, max: 30 }, byUser, 'Too many place searches. Drop the pin on the map instead, or try again in a few minutes.');
  const reads = limit(deps, 'me.notifications.read', { minutes: 1, max: 30 }, byUser);
  router.get('/me', auth, requireRole(deps.dbs, ...ROLES), wrap(c.show));
  router.get('/me/addresses', auth, requirePermission(deps, 'addresses.self'), wrap(a.list));
  router.post('/me/addresses', auth, requirePermission(deps, 'addresses.self'), addresses, validateBody(address), wrap(a.create));
  router.patch('/me/addresses/:id', auth, requirePermission(deps, 'addresses.self'), addresses, validateParams(idParams), validateBody(addressChange), wrap(a.update));
  router.post('/me/places/search', auth, requirePermission(deps, 'addresses.self'), places, validateBody(placeQuery), wrap(a.search));
  router.post('/me/places/reverse', auth, requirePermission(deps, 'addresses.self'), places, validateBody(pin), wrap(a.reverse));
  router.delete('/me/addresses/:id', auth, requirePermission(deps, 'addresses.self'), addresses, validateParams(idParams), wrap(a.remove));
  router.get('/me/notifications', auth, requirePermission(deps, 'notifications.self'), wrap(n.list));
  router.post('/me/notifications/read', auth, requirePermission(deps, 'notifications.self'), reads, validateBody(z.object({}).strict()), wrap(n.readAll));
  return router;
}
