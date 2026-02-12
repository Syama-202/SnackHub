// Transactional outbox (doc 12.1). Every module schema has its own `outbox` table. A write
// that must notify others calls add() with the same transaction; the relay claims rows
// with FOR UPDATE SKIP LOCKED so several workers never block each other (query 3).
const TABLE = 'outbox';

export const outboxModel = {
  add: (trx, type, payload) => trx(TABLE).insert({ type, payload: JSON.stringify(payload) }),
  claim: (trx, limit = 50) =>
    trx.raw(`SELECT id, type, payload FROM ${TABLE} WHERE published_at IS NULL ORDER BY id LIMIT ? FOR UPDATE SKIP LOCKED`, [limit]).then(([rows]) => rows),
  markPublished: (trx, ids) => trx(TABLE).whereIn('id', ids).update({ published_at: trx.fn.now(3) }),
  markFailed: (trx, id) => trx(TABLE).where({ id }).increment('attempts', 1),
};
