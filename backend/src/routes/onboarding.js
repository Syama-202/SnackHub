import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as wrap } from '../utils/asyncHandler.js';
import { createLimiter } from '../utils/rateLimit.js';
import { onboardingController } from '../controllers/onboarding.js';
import { workController } from '../controllers/work.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { uploadOne } from '../middleware/upload.js';
import { fields } from './auth.js';
import { BUSINESS_TYPES, DELIVERY_MODES, MOTOR_MODES, STATES, docTypesFor } from '../../../shared/domain/documents.js';
import { IFSC, BANK_ACCOUNT, PIN, OPEN_HOURS, VEHICLE_REG, ageOn, MIN_RIDER_AGE } from '../../../shared/domain/onboarding.js';

const phone = z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Use the international format, like +919876543210');
const text = (min, max) => z.string().trim().min(min).max(max);
const bank = {
  bankHolder: fields.name.optional(),
  bankIfsc: z.string().trim().toUpperCase().regex(IFSC, 'An IFSC has 11 characters, like SBIN0001234').optional(),
  bankAccount: z.string().trim().regex(BANK_ACCOUNT, 'Account numbers have 9 to 18 digits').optional(),
};
const place = {
  addressLine: text(5, 255).optional(),
  state: z.enum(STATES).optional(),
  city: text(2, 40).optional(),
  pin: z.string().trim().regex(PIN, 'A PIN code has 6 digits').optional(),
};

// draft answers: every field optional, every field checked when present; .strict() refuses
// status, user id, checks and anything else that is not an answer
const sellerProfile = z
  .object({
    ownerLegalName: fields.name.optional(),
    businessType: z.enum(BUSINESS_TYPES).optional(),
    businessEmail: fields.email.optional(),
    businessPhone: phone.optional(),
    shopName: text(3, 120).optional(),
    kind: z.enum(['shop', 'stall', 'home']).optional(),
    ...place,
    lat: z.number().min(6).max(38).optional(),
    lng: z.number().min(68).max(98).optional(),
    radiusKm: z.number().min(1).max(10).optional(),
    openHours: z.string().regex(OPEN_HOURS, 'Use HH:MM-HH:MM').optional(),
    ...bank,
  })
  .strict()
  .refine((b) => (b.lat === undefined) === (b.lng === undefined), { message: 'Send the pickup latitude and longitude together', path: ['lat'] });

const riderProfile = z
  .object({
    legalName: fields.name.optional(),
    dob: z
      .string()
      .date()
      .refine((d) => ageOn(d) >= MIN_RIDER_AGE, `Riders must be at least ${MIN_RIDER_AGE}`)
      .refine((d) => ageOn(d) <= 80, 'Check the year of birth')
      .optional(),
    ...place,
    emergencyName: fields.name.optional(),
    emergencyPhone: phone.optional(),
    backgroundConsent: z.boolean().optional(),
    ...bank,
  })
  .strict();

const riderVehicle = z
  .object({
    mode: z.enum(DELIVERY_MODES),
    registrationNo: z.string().trim().toUpperCase().transform((v) => v.replace(/[\s-]/g, '')).pipe(z.string().regex(VEHICLE_REG, 'Like AP07AB1234')).optional(),
    makeModel: text(2, 60).optional(),
    ownedByRider: z.boolean().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (MOTOR_MODES.includes(v.mode) && !v.registrationNo) ctx.addIssue({ code: 'custom', path: ['registrationNo'], message: 'Enter the registration number' });
    if (v.mode === 'bicycle' && v.registrationNo) ctx.addIssue({ code: 'custom', path: ['registrationNo'], message: 'Bicycles have no registration number' });
  });

// multipart fields arrive as strings; an empty field means "not given"
const blank = (s) => z.preprocess((v) => (v === '' || v === undefined ? undefined : v), s);
const uploadFields = (kind) =>
  z
    .object({
      docType: z.enum(docTypesFor(kind)),
      number: blank(z.string().trim().toUpperCase().max(30).transform((v) => v.replace(/\s+/g, ' ')).optional()),
      issuer: blank(text(2, 120).optional()),
      issuedOn: blank(z.string().date().optional()),
      expiresOn: blank(z.string().date().optional()),
    })
    .strict();
const idParams = z.object({ id: z.coerce.number().int().positive() }).strict();
const availability = z.object({ status: z.enum(['ONLINE', 'OFFLINE']) }).strict();
const empty = z.object({}).strict();

export function onboardingRoutes(deps) {
  const router = Router();
  const auth = requireAuth(deps.env);
  const uploads = createLimiter({ windowMs: 60 * 60_000, max: 40 });
  const perUser = rateLimit(uploads, (req) => `upload:${req.user.userId}`, 'Too many uploads in an hour. Try again later.');

  for (const kind of ['seller', 'rider']) {
    const c = onboardingController(deps, kind);
    const me = [auth, requirePermission(deps, `${kind}.onboarding`)];
    router.get(`/${kind}/onboarding`, ...me, wrap(c.show));
    router.put(`/${kind}/onboarding/profile`, ...me, validateBody(kind === 'seller' ? sellerProfile : riderProfile), wrap(c.saveProfile));
    if (kind === 'rider') router.put('/rider/onboarding/vehicle', ...me, validateBody(riderVehicle), wrap(c.saveVehicle));
    router.post(`/${kind}/onboarding/documents`, ...me, perUser, uploadOne, validateBody(uploadFields(kind)), wrap(c.upload));
    router.delete(`/${kind}/onboarding/documents/:id`, ...me, validateParams(idParams), wrap(c.removeDocument));
    router.post(`/${kind}/onboarding/documents/:id/link`, ...me, validateParams(idParams), wrap(c.documentLink));
    router.post(`/${kind}/onboarding/submit`, ...me, validateBody(empty), wrap(c.submit));
    router.post(`/${kind}/onboarding/restart`, ...me, validateBody(empty), wrap(c.restart));
    router.get(`/${kind}/eligibility`, ...me, wrap(c.eligibility));
  }

  const w = workController(deps);
  router.get('/seller/products', auth, requirePermission(deps, 'seller.products.read'), wrap(w.products));
  router.post('/seller/products/:id/publish', auth, requirePermission(deps, 'seller.products.publish'), validateParams(idParams), wrap(w.publish));
  router.post('/seller/products/:id/unpublish', auth, requirePermission(deps, 'seller.products.read'), validateParams(idParams), wrap(w.unpublish));
  router.post('/rider/availability', auth, requirePermission(deps, 'rider.availability'), validateBody(availability), wrap(w.availability));
  return router;
}
