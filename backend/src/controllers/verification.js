// The verification team's console (admin host only, second factor within 8 hours):
//   GET  /admin/verification/:kind              the queue: filters, pagination, overdue flags
//   GET  /admin/verification/item/:ref          one application with its documents and history
//   POST /admin/verification/item/:ref/check    tick or clear a manual check
//   POST /admin/verification/item/:ref/:action  start-review, request-changes, reject, approve,
//                                               suspend, reinstate (decisions need a fresh code)
//   POST /admin/documents/:ref/review           approve or reject one document
//   POST /admin/documents/:ref/link             a five-minute link to the file (logged)
//   POST /admin/documents/:ref/number           the full document number (logged)
//   GET  /admin/expiring                        documents expiring within 30 days, or expired
//   GET  /admin/requirements/:kind | PUT        which documents apply, by type and state
// Every decision is checked by shared/domain/verification.js and recorded twice: in the
// application's review history and in the audit log, with who, when and why.
import { AppError } from '../utils/AppError.js';
import { open } from '../utils/keys.js';
import { signFileLink } from '../utils/signedUrl.js';
import { queueEmail } from '../utils/notify.js';
import { KINDS, kindDb, loadApplicant, eligibilityOf, refreshValidity } from '../utils/applicants.js';
import { documentView, documentChecklist } from './onboarding.js';
import { userModel } from '../models/identity/user.js';
import { auditLogModel } from '../models/identity/auditLog.js';
import { sellerModel } from '../models/catalog/seller.js';
import { riderModel } from '../models/dispatch/rider.js';
import { decide, isOverdue, OPEN_FOR_REVIEW, CHECKS, emptyChecks, OVERDUE_HOURS, STATUSES, SELLER_STATUS_AFTER } from '../../../shared/domain/verification.js';
import { readyToApprove } from '../../../shared/domain/eligibility.js';
import { DOC_TYPES, docTypesFor, BUSINESS_TYPES, DELIVERY_MODES, DELIVERY_MODE_LABELS, STATES, EXPIRY_WARN_DAYS, expiryState, daysUntil, maskNumber } from '../../../shared/domain/documents.js';
import { can } from '../../../shared/domain/permissions.js';

const refuse = (code) =>
  ({
    NOT_ALLOWED: new AppError(409, 'NOT_ALLOWED', 'That action is not possible in the current status'),
    FORBIDDEN_MOVE: new AppError(403, 'FORBIDDEN', 'Your role cannot make this decision'),
    REASON_REQUIRED: new AppError(422, 'REASON_REQUIRED', 'Write the reason; the applicant will see it'),
    NOT_READY: new AppError(409, 'NOT_READY', 'Every required document must be approved and every check ticked first'),
    UNKNOWN_ACTION: new AppError(400, 'UNKNOWN_ACTION', 'Unknown action'),
  })[code];

/** "seller-12" -> { kind: 'seller', id: 12 }; "rider-doc-4" -> { kind: 'rider', id: 4 } */
const parseRef = (ref) => {
  const m = /^(seller|rider)-(?:doc-)?(\d{1,12})$/.exec(ref);
  return { kind: m[1], id: Number(m[2]) };
};

const VEHICLE_LABEL = { motorcycle: 'Motorbike', scooter: 'Scooter', ev_scooter: 'EV scooter', bicycle: 'Bicycle' };

export function verificationController({ env, dbs }) {
  const actorOf = (req) => (req.user.role === 'admin' ? 'admin' : 'reviewer');

  async function loadApp(kind, id) {
    const app = await KINDS[kind].applications.findById(kindDb(dbs, kind), id);
    if (!app || app.status === 'DRAFT') throw new AppError(404, 'NOT_FOUND', 'Application not found');
    return app;
  }

  const displayName = (kind, state, user) => (kind === 'seller' ? state.profile?.shopName : state.profile?.legalName) || user?.name || 'Applicant';

  async function queue(req, res) {
    const { kind } = req.params;
    const { status = 'open', overdue, q, page, pageSize } = req.query;
    const k = KINDS[kind];
    const db = kindDb(dbs, kind);
    let userIds;
    if (q) {
      const like = q.replace(/[%_\\]/g, (c) => `\\${c}`);
      userIds = (await dbs.identity('users').where('email', 'like', `%${like}%`).orWhere('name', 'like', `%${like}%`).limit(200).pluck('id')).map(Number);
    }
    let statuses = status === 'all' ? STATUSES.filter((s) => s !== 'DRAFT') : status === 'open' ? OPEN_FOR_REVIEW : status === 'renewals' ? ['APPROVED'] : [status];
    if (status === 'renewals') {
      const withPending = (await db(`${kind}_documents`).where({ status: 'PENDING' }).distinct('user_id').pluck('user_id')).map(Number);
      userIds = userIds ? userIds.filter((id) => withPending.includes(id)) : withPending;
      statuses = ['APPROVED'];
    }
    const overdueBefore = overdue ? new Date(Date.now() - OVERDUE_HOURS * 3_600_000) : null;
    const { total, items } = await k.applications.page(db, { statuses, overdueBefore, userIds, page, pageSize });
    const ids = items.map((a) => a.user_id);
    const [users, pending] = await Promise.all([ids.length ? dbs.identity('users').whereIn('id', ids).select('id', 'name', 'email') : [], k.documents.pendingCounts(db, ids)]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const states = await Promise.all(items.map((a) => k.profile(db, a.user_id)));
    res.json({
      kind,
      total,
      page,
      pageSize,
      counts: await k.applications.countByStatus(db),
      items: items.map((a, i) => ({
        ref: `${kind}-${a.id}`,
        kind,
        status: a.status,
        name: displayName(kind, states[i], userById.get(a.user_id)),
        applicant: { id: a.user_id, name: userById.get(a.user_id)?.name, email: userById.get(a.user_id)?.email },
        city: states[i].profile?.city ?? null,
        type: kind === 'seller' ? states[i].profile?.businessType : states[i].vehicle?.mode,
        submittedAt: a.submitted_at,
        submitCount: a.submit_count,
        overdue: Boolean(isOverdue({ status: a.status, submittedAt: a.submitted_at })),
        pendingDocuments: pending.get(a.user_id) ?? 0,
      })),
    });
  }

  async function detailOf(kind, app, viewerId) {
    const k = KINDS[kind];
    const db = kindDb(dbs, kind);
    const state = await loadApplicant(dbs, kind, app.user_id);
    const user = state.account;
    const history = await k.reviews.listForApplications(db, [app.id]);
    const actorIds = [...new Set(history.map((h) => h.actor_id))];
    const actors = new Map((actorIds.length ? await dbs.identity('users').whereIn('id', actorIds).select('id', 'name') : []).map((u) => [u.id, u.name]));
    const { bankAccountEnc: _b, ...profile } = state.profile ?? {};
    return {
      ref: `${kind}-${app.id}`,
      kind,
      status: app.status,
      name: displayName(kind, state, user),
      submittedAt: app.submitted_at,
      submitCount: app.submit_count,
      reviewStartedAt: app.review_started_at,
      decidedAt: app.decided_at,
      decisionReason: app.decision_reason,
      overdue: Boolean(isOverdue({ status: app.status, submittedAt: app.submitted_at })),
      applicant: { id: user.id, name: user.name, email: user.email, emailVerified: Boolean(user.email_verified_at), mobile: user.mobile, mobileVerified: Boolean(user.mobile_verified_at), accountStatus: user.status, roleStatus: state.membership?.status ?? null },
      profile: state.profile ? { ...profile, bankAccount: maskNumber(state.profile.bankAccountLast4) } : null,
      vehicle: state.vehicle ?? null,
      checks: { ...emptyChecks(k.checks), ...app.checks },
      checkNames: CHECKS[k.checks],
      checklist: documentChecklist(kind, state),
      documents: state.documents.map((d) => ({ ...documentView(d), ref: `${kind}-doc-${d.id}`, hasNumber: Boolean(d.numberEnc) })),
      ready: readyToApprove(kind, app, state.documents, state.requirementRows, state.ctx),
      eligibility: eligibilityOf(kind, state),
      history: history.map((h) => ({ action: h.action, from: h.from_status, to: h.to_status, reason: h.reason, at: h.at, by: actors.get(h.actor_id) ?? `user ${h.actor_id}`, byApplicant: h.actor_id === app.user_id, documentRef: h.document_id ? `${kind}-doc-${h.document_id}` : null })),
      viewerId,
    };
  }

  async function detail(req, res) {
    const { kind, id } = parseRef(req.params.ref);
    const app = await loadApp(kind, id);
    await auditLogModel.append(dbs.identity, { actorId: req.user.userId, action: 'application.viewed', target: req.params.ref });
    res.json(await detailOf(kind, app, req.user.userId));
  }

  /** A queued item moves to UNDER_REVIEW as soon as a reviewer works on it. */
  async function startIfSubmitted(kind, app, reviewerId) {
    if (app.status !== 'SUBMITTED') return app;
    const k = KINDS[kind];
    const db = kindDb(dbs, kind);
    await db.transaction(async (trx) => {
      if (await k.applications.move(trx, app.id, { from: 'SUBMITTED', to: 'UNDER_REVIEW', reviewerId })) {
        await k.reviews.add(trx, { applicationId: app.id, actorId: reviewerId, action: 'start-review', from: 'SUBMITTED', to: 'UNDER_REVIEW' });
      }
    });
    return k.applications.findById(db, app.id);
  }

  async function check(req, res) {
    const { kind, id } = parseRef(req.params.ref);
    const k = KINDS[kind];
    let app = await loadApp(kind, id);
    if (!OPEN_FOR_REVIEW.includes(app.status)) throw refuse('NOT_ALLOWED');
    const { check: name, value } = req.body;
    if (!CHECKS[k.checks].includes(name)) throw new AppError(422, 'UNKNOWN_CHECK', `There is no "${name}" check for this application`);
    app = await startIfSubmitted(kind, app, req.user.userId);
    const checks = { ...emptyChecks(k.checks), ...app.checks, [name]: value };
    await k.applications.setChecks(kindDb(dbs, kind), id, checks);
    await auditLogModel.append(dbs.identity, { actorId: req.user.userId, action: 'application.check', target: req.params.ref, before: { [name]: Boolean(app.checks?.[name]) }, after: { [name]: value } });
    res.json(await detailOf(kind, await loadApp(kind, id), req.user.userId));
  }

  async function decideOne(req, res) {
    const { kind, id } = parseRef(req.params.ref);
    const { action } = req.params;
    if (['suspend', 'reinstate'].includes(action) && !can(req.user.role, 'verification.suspend')) throw refuse('FORBIDDEN_MOVE');
    const k = KINDS[kind];
    const db = kindDb(dbs, kind);
    const app = await loadApp(kind, id);
    const state = await loadApplicant(dbs, kind, app.user_id);
    const ready = readyToApprove(kind, app, state.documents, state.requirementRows, state.ctx);
    const outcome = decide(app, action, { actor: actorOf(req), reason: req.body.reason, ready });
    if (outcome.error) throw refuse(outcome.error);
    if (outcome.status === 'APPROVED' && (state.account.status !== 'active' || state.membership?.status !== 'active')) throw new AppError(409, 'APPLICANT_SUSPENDED', 'The applicant account or role is suspended');

    const reviewerId = req.user.userId;
    await db.transaction(async (trx) => {
      const extra = {};
      if (kind === 'rider' && outcome.status === 'APPROVED' && !app.rider_id) {
        extra.rider_id = await riderModel.createApproved(trx, { userId: app.user_id, name: state.profile.legalName, city: state.profile.city, vehicle: VEHICLE_LABEL[state.vehicle.mode] });
      }
      if (!(await k.applications.move(trx, app.id, { from: app.status, to: outcome.status, reason: outcome.reason, reviewerId, extra }))) {
        throw new AppError(409, 'CHANGED', 'Someone else changed this application; reload it');
      }
      if (kind === 'seller' && app.seller_id) {
        if (outcome.status === 'APPROVED') await sellerModel.markVerified(trx, app.seller_id, 'probation');
        else if (SELLER_STATUS_AFTER[outcome.status]) await sellerModel.setStatus(trx, app.seller_id, SELLER_STATUS_AFTER[outcome.status]);
      }
      if (kind === 'rider' && outcome.status === 'SUSPENDED') {
        const rider = await riderModel.findByUser(trx, app.user_id);
        if (rider) await riderModel.setStatus(trx, rider.id, 'OFFLINE');
      }
      await k.reviews.add(trx, { applicationId: app.id, actorId: reviewerId, action, from: app.status, to: outcome.status, reason: outcome.reason });
      if (outcome.status !== 'UNDER_REVIEW') {
        await queueEmail(env, trx, {
          template: 'application_decision',
          to: state.account.email,
          data: { name: state.account.name, role: kind, status: outcome.status, reason: outcome.status === 'APPROVED' ? null : outcome.reason, link: `${env.APP_URL}/${kind}/onboarding` },
          dedupeKey: `${kind}-app:${app.id}:${action}:${app.submit_count}:${app.status}`,
        });
      }
      if (['APPROVED', 'SUSPENDED'].includes(outcome.status)) await refreshValidity(dbs, kind, app.user_id, trx);
    });
    await auditLogModel.append(dbs.identity, { actorId: reviewerId, action: `application.${action}`, target: req.params.ref, before: { status: app.status }, after: { status: outcome.status, reason: outcome.reason } });
    res.json(await detailOf(kind, await loadApp(kind, id), reviewerId));
  }

  async function loadDoc(ref) {
    const { kind, id } = parseRef(ref);
    const doc = await KINDS[kind].documents.findById(kindDb(dbs, kind), id);
    if (!doc) throw new AppError(404, 'NOT_FOUND', 'Document not found');
    return { kind, doc };
  }

  async function reviewDocument(req, res) {
    const { kind, doc } = await loadDoc(req.params.ref);
    const k = KINDS[kind];
    const db = kindDb(dbs, kind);
    const { decision, remarks, reason } = req.body;
    if (doc.status !== 'PENDING') throw new AppError(409, 'ALREADY_REVIEWED', 'This version was already reviewed or replaced');
    let app = await k.applications.latestForUser(db, doc.userId);
    if (!app || ![...OPEN_FOR_REVIEW, 'APPROVED', 'SUSPENDED'].includes(app.status)) throw new AppError(409, 'NOT_ALLOWED', 'Documents are reviewed after the application is submitted');
    if (decision === 'reject' && !reason?.trim()) throw refuse('REASON_REQUIRED');
    if (decision === 'approve' && expiryState(doc.expiresOn) === 'expired') throw new AppError(409, 'DOCUMENT_EXPIRED', 'This document has expired; reject it and ask for the renewal');
    if (doc.scanStatus === 'infected') throw new AppError(409, 'FILE_INFECTED', 'This file failed the virus check');
    app = await startIfSubmitted(kind, app, req.user.userId);
    const status = decision === 'approve' ? 'APPROVED' : 'REJECTED';
    const account = await userModel.findById(dbs.identity, doc.userId);
    await db.transaction(async (trx) => {
      if (!(await k.documents.review(trx, doc.id, { status, reviewerId: req.user.userId, remarks: remarks?.trim() || null, rejectionReason: reason?.trim() || null }))) {
        throw new AppError(409, 'ALREADY_REVIEWED', 'Someone else reviewed this version first');
      }
      if (status === 'APPROVED') await k.documents.supersedeOlderApproved(trx, doc.userId, doc.docType, doc.version);
      await k.reviews.add(trx, { applicationId: app.id, documentId: doc.id, actorId: req.user.userId, action: `document.${decision}`, from: 'PENDING', to: status, reason: status === 'REJECTED' ? reason.trim() : remarks?.trim() || null });
      if (status === 'REJECTED') {
        await queueEmail(env, trx, {
          template: 'document_rejected',
          to: account.email,
          data: { name: account.name, docLabel: DOC_TYPES[doc.docType].label, reason: reason.trim(), link: `${env.APP_URL}/${kind}/onboarding` },
          dedupeKey: `${kind}-doc:${doc.id}:rejected`,
        });
      }
      await refreshValidity(dbs, kind, doc.userId, trx);
    });
    await auditLogModel.append(dbs.identity, { actorId: req.user.userId, action: `document.${decision}`, target: req.params.ref, after: { docType: doc.docType, version: doc.version, status } });
    res.json(await detailOf(kind, await k.applications.findById(db, app.id), req.user.userId));
  }

  async function documentLink(req, res) {
    const { kind, doc } = await loadDoc(req.params.ref);
    await auditLogModel.append(dbs.identity, { actorId: req.user.userId, action: 'document.link', target: req.params.ref, after: { docType: doc.docType } });
    res.set('Cache-Control', 'no-store');
    res.json({ url: `/api/v1/files/${signFileLink(env, { ref: `${kind}-doc:${doc.id}`, viewerId: req.user.userId })}`, mime: doc.mime });
  }

  async function revealNumber(req, res) {
    const { doc } = await loadDoc(req.params.ref);
    if (!doc.numberEnc) throw new AppError(404, 'NO_NUMBER', 'This document has no number');
    await auditLogModel.append(dbs.identity, { actorId: req.user.userId, action: 'document.number.revealed', target: req.params.ref, after: { docType: doc.docType } });
    res.set('Cache-Control', 'no-store');
    res.json({ number: open(env, 'pii', doc.numberEnc) });
  }

  async function expiring(req, res) {
    const lastDay = new Date(Date.now() + EXPIRY_WARN_DAYS * 86_400_000).toISOString().slice(0, 10);
    const out = [];
    for (const kind of Object.keys(KINDS)) {
      const k = KINDS[kind];
      const db = kindDb(dbs, kind);
      const docs = await k.documents.expiringBy(db, lastDay);
      const ids = [...new Set(docs.map((d) => d.userId))];
      const users = new Map((ids.length ? await dbs.identity('users').whereIn('id', ids).select('id', 'name', 'email') : []).map((u) => [u.id, u]));
      for (const d of docs) {
        const app = await k.applications.latestForUser(db, d.userId);
        if (!app || !['APPROVED', 'SUSPENDED'].includes(app.status)) continue;
        out.push({ kind, ref: `${kind}-doc-${d.id}`, applicationRef: `${kind}-${app.id}`, applicant: users.get(d.userId)?.name, email: users.get(d.userId)?.email, docType: d.docType, label: DOC_TYPES[d.docType].label, expiresOn: d.expiresOn, daysLeft: daysUntil(d.expiresOn), state: expiryState(d.expiresOn) });
      }
    }
    res.json(out.sort((a, b) => a.daysLeft - b.daysLeft));
  }

  async function requirements(req, res) {
    const { kind } = req.params;
    const rows = await KINDS[kind].requirements.list(kindDb(dbs, kind));
    res.json({
      kind,
      rows,
      docTypes: docTypesFor(kind).map((t) => ({ docType: t, label: DOC_TYPES[t].label })),
      types: kind === 'seller' ? BUSINESS_TYPES : DELIVERY_MODES,
      typeLabels: kind === 'seller' ? null : DELIVERY_MODE_LABELS,
      states: STATES,
    });
  }

  async function saveRequirements(req, res) {
    const { kind } = req.params;
    const k = KINDS[kind];
    const db = kindDb(dbs, kind);
    const allowedDocs = docTypesFor(kind);
    const allowedTypes = kind === 'seller' ? BUSINESS_TYPES : DELIVERY_MODES;
    for (const r of req.body.rows) {
      if (!allowedDocs.includes(r.docType)) throw new AppError(422, 'UNKNOWN_DOCUMENT', `${r.docType} is not a ${kind} document`);
      if (r.types && r.types.some((t) => !allowedTypes.includes(t))) throw new AppError(422, 'UNKNOWN_TYPE', `Unknown ${kind === 'seller' ? 'business type' : 'delivery mode'}`);
      if (r.states && r.states.some((s) => !STATES.includes(s))) throw new AppError(422, 'UNKNOWN_STATE', 'Unknown state');
    }
    const before = await k.requirements.list(db);
    const rows = await db.transaction((trx) => k.requirements.replaceAll(trx, req.body.rows, req.user.userId));
    // a new required document applies to approved people at once
    const approved = await db(`${kind}_applications`).whereIn('status', ['APPROVED', 'SUSPENDED']).pluck('user_id');
    for (const userId of approved) await refreshValidity(dbs, kind, Number(userId), db);
    await auditLogModel.append(dbs.identity, {
      actorId: req.user.userId,
      action: 'requirements.update',
      target: `${kind}-requirements`,
      before: before.map(({ docType, mode, types, states }) => ({ docType, mode, types, states })),
      after: rows.map(({ docType, mode, types, states }) => ({ docType, mode, types, states })),
    });
    res.json({ kind, rows });
  }

  return { queue, detail, check, decide: decideOne, reviewDocument, documentLink, revealNumber, expiring, requirements, saveRequirements };
}
