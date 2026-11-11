// ordering.delivery_policy: versioned delivery rules (doc 8.2 to 8.4). Every order keeps
// the version it was promised under, so pay and lateness are judged by that version.
const TABLE = 'delivery_policy';

const parse = (row) => row && { ...row, config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config };

export const deliveryPolicyModel = {
  // two versions saved in the same second: the later row wins. "Now" is the app's clock, the
  // one effective_from is written with: PostgreSQL's now() is when the transaction began.
  current: (db) => db(TABLE).where('effective_from', '<=', new Date()).orderBy('effective_from', 'desc').orderBy('id', 'desc').first().then(parse),
  findById: (db, id) => db(TABLE).where({ id }).first().then(parse),
  create: (db, { effectiveFrom, config }) => db(TABLE).insert({ effective_from: effectiveFrom, config: JSON.stringify(config) }).returning('id').then(([r]) => r.id),
};
