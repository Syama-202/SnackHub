// dispatch.rider_applications: a person's request to ride, the admin's checklist and the
// decision. The rider row is created only on approval (doc 11.3).
const TABLE = 'rider_applications';

const parse = (row) => row && { ...row, checks: typeof row.checks === 'string' ? JSON.parse(row.checks) : row.checks };

export const riderApplicationModel = {
  findById: (db, id) => db(TABLE).where({ id }).first().then(parse),
  latestForUser: (db, userId) => db(TABLE).where({ user_id: userId }).orderBy('id', 'desc').first().then(parse),
  list: (db, statuses) =>
    db(TABLE)
      .modify((q) => statuses && q.whereIn('status', statuses))
      .orderBy('submitted_at', 'desc')
      .then((rows) => rows.map(parse)),
  create: (db, { userId, name, city, vehicle, vehicleNo, licenceNo, checks }) =>
    db(TABLE)
      .insert({ user_id: userId, name, city, vehicle, vehicle_no: vehicleNo, licence_no: licenceNo, status: 'SUBMITTED', checks: JSON.stringify(checks), submitted_at: new Date() })
      .then(([id]) => id),
  setChecks: (db, id, checks) =>
    db(TABLE).where({ id }).update({ checks: JSON.stringify(checks), status: db.raw("IF(status = 'SUBMITTED', 'UNDER_REVIEW', status)") }),
  decide: (db, id, { status, reason, reviewerId, riderId = null, openStatuses }) =>
    db(TABLE)
      .where({ id })
      .whereIn('status', openStatuses)
      .update({ status, decision_reason: reason, reviewer_id: reviewerId, rider_id: riderId, decided_at: new Date() })
      .then((n) => n === 1),
};
