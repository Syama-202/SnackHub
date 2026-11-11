// identity.user_roles: the roles an account holds, each active or suspended with a reason.
// Customers, sellers and riders add their own role by signing up through that portal;
// reviewer and admin come only from `npm run create-admin`.
const TABLE = 'user_roles';

export const userRoleModel = {
  listForUser: (db, userId) => db(TABLE).where({ user_id: userId }).orderBy('granted_at'),
  find: (db, userId, role) => db(TABLE).where({ user_id: userId, role }).first(),
  /** Adds a role once; false if the account already holds it. */
  // ON CONFLICT on the key only: an existing role is left alone (false), a new one added (true),
  // and any other error still surfaces
  add: (db, { userId, role, grantedBy = null }) =>
    db(TABLE)
      .insert({ user_id: userId, role, granted_at: new Date(), granted_by: grantedBy })
      .onConflict(['user_id', 'role'])
      .ignore()
      .returning('user_id')
      .then((rows) => rows.length === 1),
  setStatus: (db, userId, role, status, reason = null) =>
    db(TABLE).where({ user_id: userId, role }).update({ status, status_reason: status === 'active' ? null : reason }).then((n) => n === 1),
  remove: (db, userId, role) => db(TABLE).where({ user_id: userId, role }).del(),
  /** roles by user id, for a page of accounts */
  forUsers: (db, userIds) =>
    userIds.length
      ? db(TABLE).whereIn('user_id', userIds).then((rows) => rows.reduce((m, r) => m.set(r.user_id, [...(m.get(r.user_id) || []), { role: r.role, status: r.status }]), new Map()))
      : Promise.resolve(new Map()),
};
