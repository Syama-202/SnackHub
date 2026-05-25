import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { cartController } from '../controllers/cart.js';
import { ordersController } from '../controllers/orders.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { limit, byUser } from '../middleware/rateLimit.js';

const id = z.coerce.number().int().positive();
const idParams = z.object({ id }).strict();
const cartLine = z.object({ productId: id, qty: z.number().int().min(0).max(20), replace: z.boolean().optional().default(false) }).strict();
const forAddress = z.object({ addressId: id }).strict();
const checkout = z.object({ addressId: id, paymentMode: z.enum(['COD', 'ONLINE']).default('COD') }).strict();
const review = z
  .object({
    rating: z.number().int().min(1).max(5),
    tags: z.array(z.string().trim().min(1).max(30)).max(5).optional(),
    comment: z.string().trim().max(500).optional(),
  })
  .strict();
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,64}$/;

/** One order per tap (doc 10.8): the client sends a fresh key for each checkout attempt. */
const idempotencyKey = (req, res, next) => {
  const key = req.get('Idempotency-Key');
  if (!key || !IDEMPOTENCY_KEY.test(key)) return next(new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Send an Idempotency-Key header of 8 to 64 letters, digits, - or _'));
  req.idempotencyKey = key;
  next();
};

export function ordersRoutes(deps) {
  const router = Router();
  const auth = requireAuth(deps.env);
  const cart = cartController(deps);
  const c = ordersController(deps);
  const perUser = (name, minutes, max, message) => limit(deps, `orders.${name}`, { minutes, max }, byUser, message);
  const asCustomer = (permission) => [auth, requirePermission(deps, permission)];

  router.get('/cart', ...asCustomer('cart.self'), wrap(cart.show));
  router.put('/cart', ...asCustomer('cart.self'), perUser('cart', 1, 120), validateBody(cartLine), wrap(cart.setLine));
  router.delete('/cart', ...asCustomer('cart.self'), perUser('cart-clear', 1, 30), wrap(cart.clear));

  router.post('/orders/quote', ...asCustomer('orders.self'), perUser('quote', 1, 60), validateBody(forAddress), wrap(c.quote));
  router.post('/orders', ...asCustomer('orders.self'), perUser('checkout', 10, 10, 'Too many orders in a few minutes. Wait a little and try again.'), idempotencyKey, validateBody(checkout), wrap(c.place));
  router.get('/orders', ...asCustomer('orders.self'), wrap(c.list));
  router.get('/orders/:id', ...asCustomer('orders.self'), validateParams(idParams), wrap(c.show));
  router.get('/orders/:id/track', ...asCustomer('orders.self'), perUser('track', 1, 120), validateParams(idParams), wrap(c.track));
  router.get('/orders/:id/otp', ...asCustomer('orders.self'), perUser('otp', 1, 30), validateParams(idParams), wrap(c.otp));
  router.post('/orders/:id/payment/check', ...asCustomer('orders.self'), perUser('payment-check', 1, 40), validateParams(idParams), validateBody(z.object({}).strict()), wrap(c.checkPayment));
  router.post('/orders/:id/cancel', ...asCustomer('orders.self'), perUser('cancel', 10, 10, 'Too many cancellations in a few minutes. Wait a little and try again.'), validateParams(idParams), validateBody(z.object({}).strict()), wrap(c.cancel));
  router.post('/orders/:id/review', ...asCustomer('orders.self'), perUser('review', 60, 20, 'Too many reviews in an hour. Try again later.'), validateParams(idParams), validateBody(review), wrap(c.review));
  return router;
}
