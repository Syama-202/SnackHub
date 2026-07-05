// The shop-wide announcement. Anyone may read it; setting or clearing it is an admin action on
// the admin host with a second factor from the last five minutes, like the delivery policy.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { noticeController } from '../controllers/notice.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, requirePermission, requireFreshMfa, adminHostOnly } from '../middleware/auth.js';
import { limit, byIp, byUser } from '../middleware/rateLimit.js';

// one line of plain text; an empty message clears the announcement
const notice = z
  .object({
    message: z.string().trim().max(200).regex(/^[^\u0000-\u001f\u007f<>]*$/, 'Use plain text only'),
    tone: z.enum(['info', 'warning']).default('info'),
    // when it stops showing by itself (ms since 1970), at most 60 days ahead
    endsAt: z.number().int().positive().nullable().optional(),
  })
  .strict()
  .refine((b) => !b.endsAt || (b.endsAt > Date.now() && b.endsAt < Date.now() + 60 * 86_400_000), { path: ['endsAt'], message: 'Pick a time in the next 60 days' });

export function noticeRoutes(deps) {
  const c = noticeController(deps);
  const router = Router();
  const staff = (permission) => [adminHostOnly(deps.env), requireAuth(deps.env), requirePermission(deps, permission), requireFreshMfa(8 * 60)];
  router.get('/notice', limit(deps, 'notice.read.ip', { minutes: 1, max: 120 }, byIp), wrap(c.show));
  router.get('/admin/notice', ...staff('operations.read'), wrap(c.current));
  router.put('/admin/notice', ...staff('policy.write'), limit(deps, 'admin.decisions', { minutes: 1, max: 60 }, byUser), requireFreshMfa(5), validateBody(notice), wrap(c.save));
  return router;
}
