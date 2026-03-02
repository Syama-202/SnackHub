import { Router } from 'express';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { z } from 'zod';
import { authController } from '../controllers/auth.js';
import { validateBody } from '../middleware/validate.js';
import { requireClientHeader } from '../middleware/auth.js';

const googleBody = z
  .object({
    // the ID token from Google Identity Services: a JWT, so three base64url parts
    credential: z.string().min(100).max(4096).regex(/^[\w-]+\.[\w-]+\.[\w-]+$/),
    // a random id the browser keeps for itself, one session per device
    deviceId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  })
  .strict();

export function authRoutes(deps) {
  const c = authController(deps);
  const router = Router();
  router.post('/auth/google', validateBody(googleBody), wrap(c.google));
  router.post('/auth/refresh', requireClientHeader, wrap(c.refresh));
  router.post('/auth/logout', requireClientHeader, wrap(c.logout));
  return router;
}
