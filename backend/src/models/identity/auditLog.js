// identity.audit_log: who did what, with the state before and after (doc 16.2, 16.3).
// Append only: triggers in the database refuse updates and deletes. Never store tokens,
// codes or addresses here.
const TABLE = 'audit_log';

export const auditLogModel = {
  append: (db, { actorId = null, action, target = null, before = null, after = null }) =>
    db(TABLE).insert({
      actor_id: actorId,
      action,
      target,
      before_state: before ? JSON.stringify(before) : null,
      after_state: after ? JSON.stringify(after) : null,
      at: new Date(),
    }),
  listForActor: (db, actorId, limit = 50) => db(TABLE).where({ actor_id: actorId }).orderBy('at', 'desc').limit(limit),
};
