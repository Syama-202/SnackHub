// ordering.complaints and their evidence (doc 10.7, 16.4). One complaint per category per
// order; a decision moves it from IN_REVIEW only once.
const TABLE = 'complaints';
const EVIDENCE = 'complaint_evidence';

export const complaintModel = {
  findById: (db, id) => db(TABLE).where({ id }).first(),
  listByOrder: (db, orderId) => db(TABLE).where({ order_id: orderId }).orderBy('id'),
  listByStatus: (db, status, limit = 50) => db(TABLE).where({ status }).orderBy('created_at').limit(limit),
  create: (db, c) => db(TABLE).insert({ ...c, created_at: new Date() }).then(([id]) => id),
  /** Records the triage result (classification, confidence, fault shares, auto decision). */
  setTriage: (db, id, triage) => db(TABLE).where({ id }).update(triage),
  /** Decides a complaint under review; false if it was already decided. */
  resolve: (db, id, { resolvedBy, ...changes }) => db(TABLE).where({ id, status: 'IN_REVIEW' }).update({ ...changes, status: 'RESOLVED', resolved_by: resolvedBy }).then((n) => n === 1),
  addEvidence: (db, complaintId, e) => db(EVIDENCE).insert({ complaint_id: complaintId, ...e, content: e.content ? JSON.stringify(e.content) : null, created_at: new Date() }),
  evidence: (db, complaintId) => db(EVIDENCE).where({ complaint_id: complaintId }).orderBy('id'),
};
