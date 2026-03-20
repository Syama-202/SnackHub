// Seller and rider onboarding, one controller for both (kind = 'seller' or 'rider'):
//   GET    /{kind}/onboarding                   where the application stands, with the checklist
//   PUT    /{kind}/onboarding/profile           save draft answers (business, or personal details)
//   PUT    /rider/onboarding/vehicle            how the rider delivers
//   POST   /{kind}/onboarding/documents         upload one document (a new version)
//   DELETE /{kind}/onboarding/documents/:id     remove an unreviewed upload from a draft
//   POST   /{kind}/onboarding/documents/:id/link  a five-minute link to view your own upload
//   POST   /{kind}/onboarding/submit            send it for review (only when complete)
//   POST   /{kind}/onboarding/restart           a new draft after a rejection (after the wait)
//   GET    /{kind}/eligibility                  may I trade / deliver right now, and if not, why
// Ownership always comes from the token: every query is for req.user.userId, so nobody can
// read or change someone else's application by changing an id.
import { createHash } from 'node:crypto';
import { AppError } from '../utils/AppError.js';
import { seal } from '../utils/keys.js';
import { inspectUpload } from '../utils/fileCheck.js';
import { signFileLink } from '../utils/signedUrl.js';
import { queueEmail } from '../utils/notify.js';
import { KINDS, kindDb, loadApplicant, eligibilityOf } from '../utils/applicants.js';
import { userModel } from '../models/identity/user.js';
import { auditLogModel } from '../models/identity/auditLog.js';
import { sellerBusinessModel } from '../models/catalog/sellerBusiness.js';
import { sellerApplicationModel } from '../models/catalog/sellerApplication.js';
import { sellerModel } from '../models/catalog/seller.js';
import { riderProfileModel } from '../models/dispatch/riderProfile.js';
import { riderVehicleModel } from '../models/dispatch/riderVehicle.js';
import { canMove, EDITABLE, emptyChecks, reapplyFrom } from '../../../shared/domain/verification.js';
import { DOC_TYPES, requirementsFor, currentDocuments, validApproved, expiryState, daysUntil, documentProblems, maskNumber } from '../../../shared/domain/documents.js';
import { profileGaps } from '../../../shared/domain/onboarding.js';

const REGION_OF_STATE = { 'Andhra Pradesh': 'Andhra Pradesh', Telangana: 'Telangana', 'Tamil Nadu': 'Tamil Nadu', Karnataka: 'Karnataka', Kerala: 'Kerala', Maharashtra: 'Maharashtra' };

/** A document as its owner sees it: masked number, no storage key or hash. */
export function documentView(d, now = Date.now()) {
  return {
    id: d.id,
    docType: d.docType,
    label: DOC_TYPES[d.docType]?.label ?? d.docType,
    version: d.version,
    status: d.status,
    number: maskNumber(d.numberLast4),
    issuer: d.issuer,
    issuedOn: d.issuedOn,
    expiresOn: d.expiresOn,
    expiry: expiryState(d.expiresOn, now),
    daysLeft: d.expiresOn ? daysUntil(d.expiresOn, now) : null,
    scanStatus: d.scanStatus,
    rejectionReason: d.rejectionReason,
    reviewerRemarks: d.reviewerRemarks,
    uploadedAt: d.uploadedAt,
    reviewedAt: d.reviewedAt,
    mime: d.mime,
    sizeBytes: d.sizeBytes,
  };
}

/** Per required or optional document: what the applicant still has to do. */
export function documentChecklist(kind, state, now = Date.now()) {
  const current = currentDocuments(state.documents);
  return requirementsFor(kind, state.requirementRows, state.ctx).map(({ docType, required }) => {
    const doc = current.get(docType);
    const valid = validApproved(state.documents, docType, now);
    let s = 'missing';
    if (doc?.status === 'REJECTED') s = 'rejected';
    else if (doc?.status === 'PENDING') s = valid ? 'renewal-pending' : 'pending';
    else if (valid) s = expiryState(valid.expiresOn, now) === 'expiring' ? 'expiring' : 'approved';
    else if (doc?.status === 'APPROVED') s = 'expired';
    return { docType, label: DOC_TYPES[docType].label, required, state: s };
  });
}

const maskedProfile = (kind, profile, vehicle) => {
  if (!profile && !vehicle) return { profile: null, vehicle: null };
  const { bankAccountEnc: _e, ...rest } = profile ?? {};
  return { profile: profile ? { ...rest, bankAccount: maskNumber(profile.bankAccountLast4) } : null, vehicle: kind === 'rider' ? vehicle : undefined };
};

export function onboardingController(deps, kind) {
  const { env, dbs, storage, scanner } = deps;
  const k = KINDS[kind];
  const db = kindDb(dbs, kind);

  async function present(userId, now = Date.now()) {
    const state = await loadApplicant(dbs, kind, userId);
    const app = state.application;
    const current = currentDocuments(state.documents);
    const reviews = app ? await k.reviews.listForApplications(db, [app.id]) : [];
    const gaps = profileGaps(kind, state.profile, state.vehicle, now);
    const checklist = documentChecklist(kind, state, now);
    const docsReady = checklist.every((c) => !c.required || ['pending', 'approved', 'expiring', 'renewal-pending'].includes(c.state));
    return {
      kind,
      status: app?.status ?? 'NOT_STARTED',
      applicationId: app ? `${kind}-${app.id}` : null,
      submittedAt: app?.submitted_at ?? null,
      decidedAt: app?.decided_at ?? null,
      decisionReason: app?.decision_reason ?? null,
      reapplyFrom: app?.status === 'REJECTED' ? reapplyFrom(app.decided_at) : null,
      canEdit: !app || EDITABLE.includes(app.status),
      canUpload: !app || EDITABLE.includes(app.status) || app.status === 'APPROVED',
      ...maskedProfile(kind, state.profile, state.vehicle),
      requirements: requirementsFor(kind, state.requirementRows, state.ctx).map((r) => ({ ...r, ...DOC_TYPES[r.docType], roles: undefined })),
      documents: [...current.values()].map((d) => documentView(d, now)),
      approvedVersions: state.documents.filter((d) => d.status === 'APPROVED').map((d) => documentView(d, now)),
      checklist: { profile: gaps, documents: checklist, ready: gaps.length === 0 && docsReady },
      eligibility: eligibilityOf(kind, state, now),
      // who reviewed stays inside the team; the applicant sees what happened and why
      history: reviews.map((r) => ({ action: r.action, from: r.from_status, to: r.to_status, reason: r.reason, at: r.at, by: r.actor_id === userId ? 'you' : 'SnackHub team', documentId: r.document_id })),
    };
  }

  /** The person's application, created as a draft the first time they save anything. */
  async function draftFor(trx, userId) {
    const app = await k.applications.latestForUser(trx, userId);
    if (!app) {
      const id = await k.applications.createDraft(trx, { userId, checks: emptyChecks(k.checks) });
      return k.applications.findById(trx, id);
    }
    return app;
  }

  const editable = (app) => {
    if (app && !EDITABLE.includes(app.status)) {
      const why = app.status === 'APPROVED' ? 'Your application is approved; contact support to change these details' : app.status === 'REJECTED' ? 'This application was not approved. Start a new one.' : 'Your application is being reviewed; you can change it if the team asks for changes';
      throw new AppError(409, 'NOT_EDITABLE', why, { status: app.status });
    }
  };

  async function show(req, res) {
    res.json(await present(req.user.userId));
  }

  /** Draft answers; bank account numbers are sealed, never stored or returned in full. */
  async function saveProfile(req, res) {
    const userId = req.user.userId;
    const { bankAccount, backgroundConsent, ...fields } = req.body;
    if (bankAccount) Object.assign(fields, { bankAccountEnc: seal(env, 'pii', bankAccount), bankAccountLast4: bankAccount.slice(-4) });
    if (kind === 'rider' && backgroundConsent !== undefined) fields.backgroundConsentAt = backgroundConsent ? new Date() : null;
    await db.transaction(async (trx) => {
      const app = await draftFor(trx, userId);
      editable(app);
      await (kind === 'seller' ? sellerBusinessModel : riderProfileModel).save(trx, userId, fields);
    });
    await auditLogModel.append(dbs.identity, { actorId: userId, action: `${kind}.onboarding.saved`, target: `user:${userId}`, after: { fields: Object.keys(fields).filter((f) => !f.startsWith('bank')) } });
    res.json(await present(userId));
  }

  async function saveVehicle(req, res) {
    const userId = req.user.userId;
    await db.transaction(async (trx) => {
      editable(await draftFor(trx, userId));
      await riderVehicleModel.save(trx, userId, req.body);
    });
    res.json(await present(userId));
  }

  async function upload(req, res) {
    const userId = req.user.userId;
    const { docType, number, issuer, issuedOn, expiresOn } = req.body;
    const state = await loadApplicant(dbs, kind, userId);
    const app = state.application;
    if (app && !EDITABLE.includes(app.status) && app.status !== 'APPROVED') editable(app);
    if (!requirementsFor(kind, state.requirementRows, state.ctx).some((r) => r.docType === docType)) {
      throw new AppError(422, 'DOC_NOT_APPLICABLE', `${DOC_TYPES[docType]?.label ?? 'This document'} is not asked for with your current answers`);
    }
    const problems = documentProblems(docType, { number, issuer, issuedOn, expiresOn });
    if (Object.keys(problems).length) throw new AppError(422, 'DOCUMENT_INVALID', Object.values(problems)[0], Object.entries(problems).map(([field, message]) => ({ field, message })));

    const file = req.file.buffer;
    const checked = inspectUpload(file);
    if (checked.error) throw new AppError(422, 'FILE_INVALID', checked.error);
    const scanStatus = await scanner.scan(file);
    if (scanStatus === 'infected') {
      await auditLogModel.append(dbs.identity, { actorId: userId, action: 'document.upload.infected', target: `user:${userId}`, after: { kind, docType } });
      throw new AppError(422, 'FILE_INFECTED', 'This file did not pass the virus check and was not saved');
    }
    const storageKey = await storage.put(file);
    let id;
    try {
      id = await db.transaction(async (trx) => {
        const application = await draftFor(trx, userId);
        const version = await k.documents.nextVersion(trx, userId, docType);
        const docId = await k.documents.create(trx, {
          userId,
          applicationId: application.id,
          docType,
          version,
          numberEnc: number ? seal(env, 'pii', number) : null,
          numberLast4: number ? number.replace(/\s/g, '').slice(-4) : null,
          issuer: issuer || null,
          issuedOn: issuedOn || null,
          expiresOn: expiresOn || null,
          storageKey,
          mime: checked.mime,
          sizeBytes: file.length,
          sha256: createHash('sha256').update(file).digest('hex'),
          scanStatus,
        });
        await k.documents.supersedeUnapproved(trx, userId, docType, docId);
        await k.reviews.add(trx, { applicationId: application.id, documentId: docId, actorId: userId, action: 'upload', to: 'PENDING', reason: `${DOC_TYPES[docType].label}, version ${version}` });
        return docId;
      });
    } catch (err) {
      // nothing points at the file, so it goes too
      await storage.remove(storageKey);
      throw err;
    }
    await auditLogModel.append(dbs.identity, { actorId: userId, action: 'document.upload', target: `${kind}-doc:${id}`, after: { docType, scanStatus } });
    res.status(201).json(await present(userId));
  }

  async function removeDocument(req, res) {
    const userId = req.user.userId;
    const doc = await k.documents.findById(db, req.params.id);
    if (!doc || doc.userId !== userId) throw new AppError(404, 'NOT_FOUND', 'No such document');
    const app = await k.applications.latestForUser(db, userId);
    editable(app);
    const withdrawn = await db.transaction(async (trx) => {
      if (!(await k.documents.withdrawPending(trx, doc.id, userId))) return false;
      await k.reviews.add(trx, { applicationId: doc.applicationId, documentId: doc.id, actorId: userId, action: 'withdraw', from: 'PENDING', to: 'SUPERSEDED' });
      return true;
    });
    if (!withdrawn) throw new AppError(409, 'NOT_REMOVABLE', 'Only an upload the team has not looked at yet can be removed; upload a new version instead');
    // the file is not needed any more; the row keeps its hash for the history
    await storage.remove(doc.storageKey);
    res.json(await present(userId));
  }

  async function documentLink(req, res) {
    const doc = await k.documents.findById(db, req.params.id);
    if (!doc || doc.userId !== req.user.userId) throw new AppError(404, 'NOT_FOUND', 'No such document');
    res.set('Cache-Control', 'no-store');
    res.json({ url: `/api/v1/files/${signFileLink(env, { ref: `${kind}-doc:${doc.id}`, viewerId: req.user.userId })}` });
  }

  async function submit(req, res) {
    const userId = req.user.userId;
    const view = await present(userId);
    const app = await k.applications.latestForUser(db, userId);
    if (!app) throw new AppError(409, 'NOT_STARTED', 'Fill in your details first');
    const move = canMove(app.status, 'SUBMITTED', 'applicant');
    if (!move.ok) throw new AppError(409, 'NOT_EDITABLE', 'This application cannot be submitted now', { status: app.status });
    if (!view.checklist.ready) {
      const missing = [...view.checklist.profile.map((g) => g.label), ...view.checklist.documents.filter((d) => d.required && !['pending', 'approved', 'expiring', 'renewal-pending'].includes(d.state)).map((d) => d.label)];
      throw new AppError(422, 'INCOMPLETE', `Still needed: ${missing.join(', ')}`, { missing });
    }
    const user = await userModel.findById(dbs.identity, userId);
    await db.transaction(async (trx) => {
      if (kind === 'seller') {
        const b = await sellerBusinessModel.find(trx, userId);
        const docs = await k.documents.listForUser(trx, userId);
        const fssai = currentDocuments(docs).get('FSSAI');
        const sellerId = await sellerModel.upsertFromBusiness(trx, userId, b, { region: REGION_OF_STATE[b.state] ?? b.state, licenceLast4: fssai?.numberLast4, licenceExpiresOn: fssai?.expiresOn });
        await sellerApplicationModel.setSeller(trx, app.id, sellerId);
      }
      if (!(await k.applications.move(trx, app.id, { from: app.status, to: 'SUBMITTED' }))) throw new AppError(409, 'CHANGED', 'Your application changed in another tab; reload and try again');
      await k.reviews.add(trx, { applicationId: app.id, actorId: userId, action: app.status === 'DRAFT' ? 'submit' : 'resubmit', from: app.status, to: 'SUBMITTED' });
      const fresh = await k.applications.findById(trx, app.id);
      await queueEmail(env, trx, {
        template: 'application_submitted',
        to: user.email,
        data: { name: user.name, role: kind, link: `${env.APP_URL}/${kind}/onboarding` },
        dedupeKey: `${kind}-app:${app.id}:submitted:${fresh.submit_count}`,
      });
    });
    await auditLogModel.append(dbs.identity, { actorId: userId, action: 'application.submit', target: `${kind}-application:${app.id}`, before: { status: app.status }, after: { status: 'SUBMITTED' } });
    res.json(await present(userId));
  }

  async function restart(req, res) {
    const userId = req.user.userId;
    const app = await k.applications.latestForUser(db, userId);
    if (!app || app.status !== 'REJECTED') throw new AppError(409, 'NOT_REJECTED', 'Only a rejected application can be started again');
    const from = reapplyFrom(app.decided_at);
    if (from > new Date()) throw new AppError(409, 'TOO_SOON', `You can apply again from ${from.toISOString().slice(0, 10)}`, { reapplyFrom: from });
    await db.transaction((trx) => k.applications.createDraft(trx, { userId, checks: emptyChecks(k.checks) }));
    await auditLogModel.append(dbs.identity, { actorId: userId, action: 'application.restart', target: `${kind}-application:${app.id}` });
    res.status(201).json(await present(userId));
  }

  async function eligibilityView(req, res) {
    const state = await loadApplicant(dbs, kind, req.user.userId);
    res.json(eligibilityOf(kind, state));
  }

  return { show, saveProfile, saveVehicle, upload, removeDocument, documentLink, submit, restart, eligibility: eligibilityView, present };
}
