import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { shopController } from '../controllers/shop.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { limit, byUser } from '../middleware/rateLimit.js';
import { CATEGORIES, SHAPES, STOCK_REASONS, MIN_PRICE_PAISE, MAX_PRICE_PAISE, MAX_STOCK } from '../../../shared/domain/menu.js';

const id = z.coerce.number().int().positive();
const idParams = z.object({ id }).strict();
const atLeastOne = (o) => Object.keys(o).length > 0;
const price = z.number().int().min(MIN_PRICE_PAISE, `At least ₹${MIN_PRICE_PAISE / 100}`).max(MAX_PRICE_PAISE, `At most ₹${MAX_PRICE_PAISE / 100}`);

const settings = z.object({ busyExtraMin: z.number().int().min(0).max(60).optional(), paused: z.boolean().optional() }).strict().refine(atLeastOne, 'Nothing to change');
const orderAction = z.object({ id, action: z.enum(['accept', 'reject', 'start', 'packed']) }).strict();
const menuFields = {
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(500),
  category: z.enum(CATEGORIES),
  servingTemp: z.enum(['HOT', 'AMBIENT']),
  prepMinutes: z.number().int().min(1).max(60),
  pricePaise: price,
  mrpPaise: price.nullable(),
  weight: z.string().trim().max(20),
  spice: z.number().int().min(0).max(3),
  vegetarian: z.boolean(),
  allergens: z.array(z.string().trim().min(2).max(20)).max(8),
  shape: z.enum(SHAPES),
};
const optional = (fields) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()]));
const { title, category, servingTemp, prepMinutes, pricePaise, ...rest } = menuFields;
const newProduct = z
  .object({ title, category, servingTemp, prepMinutes, pricePaise, ...optional(rest) })
  .strict()
  .refine((b) => b.mrpPaise == null || b.mrpPaise >= b.pricePaise, { message: 'The MRP cannot be below the price', path: ['mrpPaise'] });
const productChanges = z
  .object({ ...optional(menuFields), active: z.boolean().optional() })
  .strict()
  .refine(atLeastOne, 'Nothing to change');
const stock = z
  .object({ delta: z.number().int().min(-MAX_STOCK).max(MAX_STOCK).refine((d) => d !== 0, 'A change of zero changes nothing'), reason: z.enum(STOCK_REASONS) })
  .strict();

export function shopRoutes(deps) {
  const router = Router();
  const auth = requireAuth(deps.env);
  const c = shopController(deps);
  const can = (permission) => [auth, requirePermission(deps, permission)];
  // per seller: order actions, new snacks (rarely more than a few an hour), and menu and stock edits
  const actions = limit(deps, 'seller.orders', { minutes: 1, max: 60 }, byUser);
  const creates = limit(deps, 'seller.products.create', { minutes: 60, max: 30 }, byUser, 'Too many new snacks in an hour. Try again later.');
  const edits = limit(deps, 'seller.products.edit', { minutes: 1, max: 120 }, byUser);
  const shopEdits = limit(deps, 'seller.shop', { minutes: 1, max: 30 }, byUser);

  router.get('/seller/shop', ...can('seller.shop.manage'), wrap(c.shop));
  router.patch('/seller/shop', ...can('seller.shop.manage'), shopEdits, validateBody(settings), wrap(c.updateShop));
  router.get('/seller/orders', ...can('seller.orders.read'), wrap(c.orders));
  router.post('/seller/orders/:id/:action', ...can('seller.orders.accept'), actions, validateParams(orderAction), validateBody(z.object({}).strict()), wrap(c.orderAction));
  router.get('/seller/products', ...can('seller.products.read'), wrap(c.products));
  router.post('/seller/products', ...can('seller.products.write'), creates, validateBody(newProduct), wrap(c.createProduct));
  router.patch('/seller/products/:id', ...can('seller.products.write'), edits, validateParams(idParams), validateBody(productChanges), wrap(c.updateProduct));
  router.patch('/seller/products/:id/stock', ...can('seller.products.write'), edits, validateParams(idParams), validateBody(stock), wrap(c.adjustStock));
  return router;
}
