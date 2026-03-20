// Shared shape of the verification tables. Sellers (catalog schema) and riders (dispatch
// schema) each have their own applications, documents, requirements and review history,
// with the same columns; these build the model for one table. The per-table files
// (models/catalog/sellerDocument.js and so on) are what the code imports.
import { OPEN_FOR_REVIEW } from '../../../shared/domain/verification.js';

const json = (v) => (v == null ? null : typeof v === 'string' ? JSON.parse(v) : v);

/** seller_applications / rider_applications */
export function applicationTable(TABLE) {
  const parse = (row) => row && { ...row, checks: json(row.checks) ?? {} };
  return {
    findById: (db, id) => db(TABLE).where({ id }).first().then(parse),
    /** The application that counts for a person: the newest one. */
    latestForUser: (db, userId) => db(TABLE).where({ user_id: userId }).orderBy('id', 'desc').first().then(parse),
    createDraft: (db, { userId, checks }) => db(TABLE).insert({ user_id: userId, status: 'DRAFT', checks: JSON.stringify(checks) }).then(([id]) => id),
    setChecks: (db, id, checks) => db(TABLE).where({ id }).update({ checks: JSON.stringify(checks) }),
    /**
     * Moves an application only from the status it was read in (optimistic: false if someone
     * moved it first). extra sets more columns in the same statement.
     */
    move: (db, id, { from, to, reason = null, reviewerId = null, extra = {} }) => {
      const set = { status: to, ...extra };
      if (['APPROVED', 'REJECTED', 'ACTION_REQUIRED', 'SUSPENDED'].includes(to)) Object.assign(set, { decision_reason: reason, reviewer_id: reviewerId, decided_at: new Date() });
      if (to === 'SUBMITTED') Object.assign(set, { submitted_at: new Date(), submit_count: db.raw('submit_count + 1'), decision_reason: null, decided_at: null });
      if (to === 'UNDER_REVIEW') Object.assign(set, { review_started_at: new Date(), reviewer_id: reviewerId });
      return db(TABLE).where({ id, status: from }).update(set).then((n) => n === 1);
    },
    /**
     * A page of the review queue, newest first. statuses filters; overdueBefore keeps only
     * items submitted before that moment.
     */
    page: (db, { statuses, overdueBefore, userIds, page = 1, pageSize = 20 }) => {
      const base = db(TABLE)
        .modify((q) => statuses && q.whereIn('status', statuses))
        .modify((q) => overdueBefore && q.whereIn('status', OPEN_FOR_REVIEW).andWhere('submitted_at', '<', overdueBefore))
        .modify((q) => userIds && q.whereIn('user_id', userIds.length ? userIds : [0]));
      return Promise.all([
        base.clone().count('* as n').first().then((r) => Number(r.n)),
        base
          .clone()
          .orderByRaw('submitted_at IS NULL, submitted_at ASC, id DESC')
          .limit(pageSize)
          .offset((page - 1) * pageSize)
          .then((rows) => rows.map(parse)),
      ]).then(([total, items]) => ({ total, items }));
    },
    countByStatus: (db) => db(TABLE).select('status').count('* as n').groupBy('status').then((rows) => Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]))),
  };
}

/** seller_documents / rider_documents */
export function documentTable(TABLE) {
  const view = (r) =>
    r && {
      id: r.id,
      userId: r.user_id,
      applicationId: r.application_id,
      docType: r.doc_type,
      version: r.version,
      numberEnc: r.number_enc,
      numberLast4: r.number_last4,
      issuer: r.issuer,
      issuedOn: r.issued_on ? String(r.issued_on instanceof Date ? r.issued_on.toISOString() : r.issued_on).slice(0, 10) : null,
      expiresOn: r.expires_on ? String(r.expires_on instanceof Date ? r.expires_on.toISOString() : r.expires_on).slice(0, 10) : null,
      storageKey: r.storage_key,
      mime: r.mime,
      sizeBytes: r.size_bytes,
      sha256: r.sha256,
      scanStatus: r.scan_status,
      status: r.status,
      reviewerId: r.reviewer_id,
      reviewerRemarks: r.reviewer_remarks,
      rejectionReason: r.rejection_reason,
      reviewedAt: r.reviewed_at,
      remindedDays: r.reminded_days,
      uploadedAt: r.uploaded_at,
    };
  return {
    view,
    findById: (db, id) => db(TABLE).where({ id }).first().then(view),
    listForUser: (db, userId) => db(TABLE).where({ user_id: userId }).orderBy([{ column: 'doc_type' }, { column: 'version', order: 'desc' }]).then((rows) => rows.map(view)),
    forUsers: (db, userIds) => (userIds.length ? db(TABLE).whereIn('user_id', userIds).then((rows) => rows.map(view)) : Promise.resolve([])),
    nextVersion: (db, userId, docType) => db(TABLE).where({ user_id: userId, doc_type: docType }).max('version as v').first().then((r) => Number(r?.v ?? 0) + 1),
    create: (db, d) =>
      db(TABLE)
        .insert({
          user_id: d.userId,
          application_id: d.applicationId,
          doc_type: d.docType,
          version: d.version,
          number_enc: d.numberEnc ?? null,
          number_last4: d.numberLast4 ?? null,
          issuer: d.issuer ?? null,
          issued_on: d.issuedOn ?? null,
          expires_on: d.expiresOn ?? null,
          storage_key: d.storageKey,
          mime: d.mime,
          size_bytes: d.sizeBytes,
          sha256: d.sha256,
          scan_status: d.scanStatus,
          status: 'PENDING',
          uploaded_at: new Date(),
        })
        .then(([id]) => id),
    /**
     * A new upload replaces the earlier versions of that document that are not approved; an
     * approved version stays valid until its replacement is approved.
     */
    supersedeUnapproved: (db, userId, docType, keepId) =>
      db(TABLE).where({ user_id: userId, doc_type: docType }).whereIn('status', ['PENDING', 'REJECTED']).whereNot({ id: keepId }).update({ status: 'SUPERSEDED' }),
    /** Once a version is approved, older approved versions of the same document retire. */
    supersedeOlderApproved: (db, userId, docType, version) =>
      db(TABLE).where({ user_id: userId, doc_type: docType, status: 'APPROVED' }).andWhere('version', '<', version).update({ status: 'SUPERSEDED' }),
    review: (db, id, { status, reviewerId, remarks = null, rejectionReason = null }) =>
      db(TABLE)
        .where({ id, status: 'PENDING' })
        .update({ status, reviewer_id: reviewerId, reviewer_remarks: remarks, rejection_reason: status === 'REJECTED' ? rejectionReason : null, reviewed_at: new Date() })
        .then((n) => n === 1),
    /**
     * Withdraws an unreviewed upload from a draft: it stops counting (SUPERSEDED) but the row
     * stays, because the review history points at it. False if it was reviewed or is not theirs.
     */
    withdrawPending: (db, id, userId) => db(TABLE).where({ id, user_id: userId, status: 'PENDING' }).whereNull('reviewed_at').update({ status: 'SUPERSEDED' }).then((n) => n === 1),
    /** Approved documents expiring on or before a date (and not yet reminded at this threshold). */
    expiringBy: (db, lastDay) => db(TABLE).where({ status: 'APPROVED' }).whereNotNull('expires_on').andWhere('expires_on', '<=', lastDay).then((rows) => rows.map(view)),
    markReminded: (db, id, days) => db(TABLE).where({ id }).update({ reminded_days: days }),
    pendingCounts: (db, userIds) =>
      userIds.length
        ? db(TABLE).whereIn('user_id', userIds).where({ status: 'PENDING' }).select('user_id').count('* as n').groupBy('user_id').then((rows) => new Map(rows.map((r) => [r.user_id, Number(r.n)])))
        : Promise.resolve(new Map()),
  };
}

/** document_requirements (types column: business_types or vehicle_types) */
export function requirementTable(typesColumn) {
  const TABLE = 'document_requirements';
  const view = (r) => ({ id: r.id, docType: r.doc_type, mode: r.mode, types: json(r[typesColumn]), states: json(r.states), updatedAt: r.updated_at, updatedBy: r.updated_by });
  return {
    list: (db) => db(TABLE).orderBy('id').then((rows) => rows.map(view)),
    /** Replaces every row in one transaction; returns the new rows. */
    replaceAll: async (trx, rows, updatedBy) => {
      await trx(TABLE).del();
      if (rows.length) {
        await trx(TABLE).insert(
          rows.map((r) => ({ doc_type: r.docType, mode: r.mode, [typesColumn]: r.types ? JSON.stringify(r.types) : null, states: r.states ? JSON.stringify(r.states) : null, updated_by: updatedBy, updated_at: new Date() })),
        );
      }
      return trx(TABLE).orderBy('id').then((list) => list.map(view));
    },
  };
}

/** seller_reviews / rider_reviews: append only (database triggers refuse changes) */
export function reviewTable(TABLE) {
  return {
    // actorId: the reviewer, or the applicant for their own submissions
    add: (db, { applicationId, documentId = null, actorId, action, from = null, to = null, reason = null }) =>
      db(TABLE).insert({ application_id: applicationId, document_id: documentId, actor_id: actorId, action, from_status: from, to_status: to, reason, at: new Date() }),
    listForApplications: (db, ids) => (ids.length ? db(TABLE).whereIn('application_id', ids).orderBy('at', 'desc').orderBy('id', 'desc') : Promise.resolve([])),
  };
}
