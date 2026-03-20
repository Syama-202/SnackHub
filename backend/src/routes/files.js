import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { filesController } from '../controllers/files.js';
import { validateParams } from '../middleware/validate.js';

// the signed link is the whole credential: body.signature, both base64url / hex
const tokenParams = z.object({ token: z.string().regex(/^[\w-]{20,400}\.[a-f0-9]{64}$/) }).strict();

export function filesRoutes(deps) {
  const c = filesController(deps);
  const router = Router();
  router.get('/files/:token', validateParams(tokenParams), wrap(c.show));
  return router;
}
