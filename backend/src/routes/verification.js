import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { verificationController } from '../controllers/verification.js';
import { adminUsersController } from '../controllers/adminUsers.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { requireAuth, requirePermission, requireFreshMfa, adminHostOnly } from '../middleware/auth.js';
import { limit, byUser } from '../middleware/rateLimit.js';
import { STATUSES, ACTIONS, CHECKS } from '../../../shared/domain/verification.js';
import { ROLES } from '../../../shared/domain/permissions.js';

const text = (min, max) => z.string().trim().min(min).max(max);
const page = { page: z.coerce.number().int().min(1).max(10_000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) };
const kindParams = z.object({ kind: z.enum(['seller', 'rider']) }).strict();
const appRef = z.string().regex(/^(seller|rider)-\d{1,12}$/);
const docRef = z.string().regex(/^(seller|rider)-doc-\d{1,12}$/);
const queueQuery = z
  .object({
    status: z.enum(['open', 'all', 'renewals', ...STATUSES.filter((s) => s !== 'DRAFT')]).default('open'),
    overdue: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    q: text(2, 80).optional(),
    ...page,
  })
  .strict();
const itemParams = z.object({ ref: appRef }).strict();
const actionParams = z.object({ ref: appRef, action: z.enum(Object.keys(ACTIONS)) }).strict();
const docParams = z.object({ ref: docRef }).strict();
const checkBody = z.object({ check: z.enum([...new Set(Object.values(CHECKS).flat())]), value: z.boolean() }).strict();
const reasonBody = z.object({ reason: text(3, 500).optional() }).strict();
const reviewBody = z.object({ decision: z.enum(['approve', 'reject']), remarks: text(2, 500).optional(), reason: text(3, 500).optional() }).strict();
const list = (item) => z.array(item).min(1).max(30).nullable();
const requirementsBody = z
  .object({
    rows: z.array(z.object({ docType: z.string().regex(/^[A-Z_]{2,30}$/), mode: z.enum(['required', 'optional']), types: list(z.string().max(30)), states: list(z.string().max(40)) }).strict()).max(60),
  })
  .strict();
const usersQuery = z.object({ role: z.enum(ROLES).optional(), status: z.enum(['active', 'suspended']).optional(), q: text(2, 80).optional(), ...page }).strict();
const userParams = z.object({ id: z.coerce.number().int().positive() }).strict();
const userRoleParams = userParams.extend({ role: z.enum(['customer', 'seller', 'rider']) });
const mustReason = z.object({ reason: text(3, 500) }).strict();
const auditQuery = z
  .object({
    action: z.string().regex(/^[a-z_.]{2,60}$/).optional(),
    actorId: z.coerce.number().int().positive().optional(),
    target: z.string().regex(/^[\w:.-]{2,80}$/).optional(),
    page: page.page,
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export function verificationRoutes(deps) {
  const v = verificationController(deps);
  const u = adminUsersController(deps);
  const router = Router();
  // admin host only, a valid staff token, the permission re-checked against the database, and a
  // second factor in the last 8 hours; decisions need one in the last 5 minutes (doc 16.3)
  const staff = (permission) => [adminHostOnly(deps.env), requireAuth(deps.env), requirePermission(deps, permission), requireFreshMfa(8 * 60)];
  const stepUp = requireFreshMfa(5);
  // one counter per staff member for every decision; opening private documents is tighter
  const decisions = limit(deps, 'admin.decisions', { minutes: 1, max: 60 }, byUser);
  const documents = limit(deps, 'admin.documents', { minutes: 15, max: 120 }, byUser);
  const numbers = limit(deps, 'admin.document-numbers', { minutes: 60, max: 30 }, byUser, 'Too many document numbers shown in an hour. Try again later.');
  const decisionStepUp = (req, res, next) => (req.params.action === 'start-review' ? next() : stepUp(req, res, next));

  router.get('/admin/verification/item/:ref', ...staff('verification.read'), validateParams(itemParams), wrap(v.detail));
  router.post('/admin/verification/item/:ref/check', ...staff('verification.review'), decisions, validateParams(itemParams), validateBody(checkBody), wrap(v.check));
  router.post('/admin/verification/item/:ref/:action', ...staff('verification.decide'), decisions, validateParams(actionParams), decisionStepUp, validateBody(reasonBody), wrap(v.decide));
  router.get('/admin/verification/:kind', ...staff('verification.read'), validateParams(kindParams), validateQuery(queueQuery), wrap(v.queue));
  router.post('/admin/documents/:ref/review', ...staff('verification.review'), decisions, validateParams(docParams), validateBody(reviewBody), wrap(v.reviewDocument));
  router.post('/admin/documents/:ref/link', ...staff('verification.documents.read'), documents, validateParams(docParams), wrap(v.documentLink));
  router.post('/admin/documents/:ref/number', ...staff('verification.documents.read'), numbers, stepUp, validateParams(docParams), wrap(v.revealNumber));
  router.get('/admin/expiring', ...staff('verification.read'), wrap(v.expiring));
  router.get('/admin/requirements/:kind', ...staff('verification.read'), validateParams(kindParams), wrap(v.requirements));
  router.put('/admin/requirements/:kind', ...staff('verification.requirements.write'), decisions, stepUp, validateParams(kindParams), validateBody(requirementsBody), wrap(v.saveRequirements));

  router.get('/admin/users', ...staff('users.read'), validateQuery(usersQuery), wrap(u.list));
  router.post('/admin/users/:id/suspend', ...staff('users.suspend'), decisions, stepUp, validateParams(userParams), validateBody(mustReason), wrap(u.suspend));
  router.post('/admin/users/:id/reactivate', ...staff('users.suspend'), decisions, stepUp, validateParams(userParams), validateBody(mustReason), wrap(u.reactivate));
  router.post('/admin/users/:id/roles/:role/suspend', ...staff('users.suspend'), decisions, stepUp, validateParams(userRoleParams), validateBody(mustReason), wrap(u.suspendRole));
  router.post('/admin/users/:id/roles/:role/reactivate', ...staff('users.suspend'), decisions, stepUp, validateParams(userRoleParams), validateBody(mustReason), wrap(u.reactivateRole));
  router.post('/admin/users/:id/mfa-reset', ...staff('users.mfa.reset'), decisions, stepUp, validateParams(userParams), validateBody(mustReason), wrap(u.mfaReset));
  router.get('/admin/audit', ...staff('audit.read'), validateQuery(auditQuery), wrap(u.audit));
  return router;
}
