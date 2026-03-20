// Everything that decides where a seller or rider applicant stands, loaded in one place so
// onboarding, the review console, the publish and availability checks and the expiry job
// all judge the same facts the same way (shared/domain/eligibility.js).
import { userModel } from '../models/identity/user.js';
import { userRoleModel } from '../models/identity/userRole.js';
import { sellerApplicationModel } from '../models/catalog/sellerApplication.js';
import { sellerDocumentModel } from '../models/catalog/sellerDocument.js';
import { sellerReviewModel } from '../models/catalog/sellerReview.js';
import { sellerRequirementModel } from '../models/catalog/documentRequirement.js';
import { sellerBusinessModel } from '../models/catalog/sellerBusiness.js';
import { sellerModel } from '../models/catalog/seller.js';
import { riderApplicationModel } from '../models/dispatch/riderApplication.js';
import { riderDocumentModel } from '../models/dispatch/riderDocument.js';
import { riderReviewModel } from '../models/dispatch/riderReview.js';
import { riderRequirementModel } from '../models/dispatch/documentRequirement.js';
import { riderProfileModel } from '../models/dispatch/riderProfile.js';
import { riderVehicleModel } from '../models/dispatch/riderVehicle.js';
import { riderModel } from '../models/dispatch/rider.js';
import { eligibility, documentReadiness } from '../../../shared/domain/eligibility.js';

export const KINDS = {
  seller: {
    role: 'seller',
    checks: 'SELLER',
    module: 'catalog',
    applications: sellerApplicationModel,
    documents: sellerDocumentModel,
    reviews: sellerReviewModel,
    requirements: sellerRequirementModel,
    async profile(db, userId) {
      return { profile: await sellerBusinessModel.find(db, userId), vehicle: null };
    },
    ctx: ({ profile }) => ({ type: profile?.businessType ?? null, state: profile?.state ?? null }),
    /** The shop or rider row customers and dispatch see, if one exists yet. */
    liveRow: (db, userId) => sellerModel.findByUser(db, userId),
    setValidUntil: (db, row, date) => sellerModel.setDocsValidUntil(db, row.id, date),
  },
  rider: {
    role: 'rider',
    checks: 'RIDER',
    module: 'dispatch',
    applications: riderApplicationModel,
    documents: riderDocumentModel,
    reviews: riderReviewModel,
    requirements: riderRequirementModel,
    async profile(db, userId) {
      const [profile, vehicle] = await Promise.all([riderProfileModel.find(db, userId), riderVehicleModel.find(db, userId)]);
      return { profile, vehicle };
    },
    ctx: ({ profile, vehicle }) => ({ type: vehicle?.mode ?? null, state: profile?.state ?? null }),
    liveRow: (db, userId) => riderModel.findByUser(db, userId),
    setValidUntil: (db, row, date) => riderModel.setDocsValidUntil(db, row.id, date),
  },
};

export const kindDb = (dbs, kind) => dbs[KINDS[kind].module];

/**
 * { account, membership, application, documents, requirementRows, profile, vehicle, ctx } for
 * one person. `db` may be a transaction on the kind's module.
 */
export async function loadApplicant(dbs, kind, userId, db = kindDb(dbs, kind)) {
  const k = KINDS[kind];
  const [account, membership, application, documents, requirementRows, extra] = await Promise.all([
    userModel.findById(dbs.identity, userId),
    userRoleModel.find(dbs.identity, userId, k.role),
    k.applications.latestForUser(db, userId),
    k.documents.listForUser(db, userId),
    k.requirements.list(db),
    k.profile(db, userId),
  ]);
  return { account, membership, application, documents, requirementRows, ...extra, ctx: k.ctx(extra) };
}

export const eligibilityOf = (kind, state, now = Date.now()) => eligibility(kind, state, now);

/**
 * Keeps docs_valid_until on the shop or rider row in step with the documents: the earliest
 * expiry among the required approved ones, or yesterday when an approved applicant is missing
 * a required document (a requirement added later), so listings and dispatch stop at once.
 */
export async function refreshValidity(dbs, kind, userId, db = kindDb(dbs, kind), now = Date.now()) {
  const k = KINDS[kind];
  const row = await k.liveRow(db, userId);
  if (!row) return null;
  const state = await loadApplicant(dbs, kind, userId, db);
  const { missing, expired, validUntil } = documentReadiness(kind, state.documents, state.requirementRows, state.ctx, now);
  const approved = ['APPROVED', 'SUSPENDED'].includes(state.application?.status);
  const yesterday = new Date(now - 86_400_000).toISOString().slice(0, 10);
  const date = approved && (missing.length || expired.length) ? yesterday : validUntil;
  await k.setValidUntil(db, row, date);
  return date;
}
