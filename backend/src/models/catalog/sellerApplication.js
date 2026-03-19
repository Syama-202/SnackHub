// catalog.seller_applications: a shop's request to sell, the admin's checklist and the
// decision with its reason (doc 16.4).
const TABLE = 'seller_applications';

const parse = (row) => row && { ...row, checks: typeof row.checks === 'string' ? JSON.parse(row.checks) : row.checks };

export const sellerApplicationModel = {
  findById: (db, id) => db(TABLE).where({ id }).first().then(parse),
  /** The latest application of a shop. */
  latestForSeller: (db, sellerId) => db(TABLE).where({ seller_id: sellerId }).orderBy('id', 'desc').first().then(parse),
  /** With the shop's details, newest first; statuses limits the list. */
  list: (db, statuses) =>
    db(TABLE)
      .join('sellers', 'sellers.id', `${TABLE}.seller_id`)
      .select(`${TABLE}.*`, 'sellers.user_id', 'sellers.shop_name', 'sellers.city', 'sellers.licence_no', 'sellers.licence_expires_on')
      .modify((q) => statuses && q.whereIn(`${TABLE}.status`, statuses))
      .orderBy(`${TABLE}.submitted_at`, 'desc')
      .then((rows) => rows.map(parse)),
  create: (db, { sellerId, checks }) =>
    db(TABLE).insert({ seller_id: sellerId, status: 'SUBMITTED', checks: JSON.stringify(checks), submitted_at: new Date() }).then(([id]) => id),
  setChecks: (db, id, checks) =>
    db(TABLE).where({ id }).update({ checks: JSON.stringify(checks), status: db.raw("IF(status = 'SUBMITTED', 'UNDER_REVIEW', status)") }),
  /** Records a decision only while the application is still open; false if someone decided first. */
  decide: (db, id, { status, reason, reviewerId, openStatuses }) =>
    db(TABLE).where({ id }).whereIn('status', openStatuses).update({ status, decision_reason: reason, reviewer_id: reviewerId, decided_at: new Date() }).then((n) => n === 1),
};
