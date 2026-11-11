// ordering.fines: deductions for a rider or seller, always with a written reason (doc 10.7).
const TABLE = 'fines';

export const fineModel = {
  create: (db, f) => db(TABLE).insert({ ...f, created_at: new Date() }).returning('id').then(([r]) => r.id),
  listForTarget: (db, targetType, targetId) => db(TABLE).where({ target_type: targetType, target_id: targetId }).orderBy('created_at', 'desc'),
  setStatus: (db, id, status) => db(TABLE).where({ id }).update({ status }),
};
