// Transactional outbox (doc 12.1). Every module schema has its own `outbox` table. A write
// that must notify others calls add() with the same transaction; the relay claims rows
// with FOR UPDATE SKIP LOCKED so several workers never block each other (query 3).
const TABLE = 'outbox';

export const outboxModel = {
  add: (trx, type, payload) => trx(TABLE).insert({ type, payload: JSON.stringify(payload) }),
  /**
   * Queues a message once per dedupe key: a second add with the same key is a no-op, so a
   * retried request or a job that runs twice sends one email. Returns true if it was queued.
   */
  addOnce: (trx, type, dedupeKey, payload) =>
    trx(TABLE)
      .insert({ type, dedupe_key: dedupeKey, payload: JSON.stringify(payload) })
      .onConflict('dedupe_key')
      .ignore()
      .returning('id')
      .then((rows) => rows.length === 1),
  claim: (trx, limit = 50) =>
    trx.raw(`SELECT id, type, payload FROM ${TABLE} WHERE published_at IS NULL ORDER BY id LIMIT ? FOR UPDATE SKIP LOCKED`, [limit]).then((r) => r.rows),
  /** Rows of the given types that are due now, oldest first, locked for this worker. */
  claimDue: (trx, types, { limit = 20, maxAttempts = 8 } = {}) =>
    trx
      .raw(
        `SELECT id, type, payload, attempts FROM ${TABLE}
         WHERE published_at IS NULL AND type IN (${types.map(() => '?').join(',')}) AND attempts < ? AND (available_at IS NULL OR available_at <= ?)
         ORDER BY id LIMIT ? FOR UPDATE SKIP LOCKED`,
        // due by the app's clock, which retryLater writes available_at with
        [...types, maxAttempts, new Date(), limit],
      )
      .then((r) => r.rows),
  markPublished: (trx, ids) => trx(TABLE).whereIn('id', ids).update({ published_at: trx.fn.now(3) }),
  markFailed: (trx, id) => trx(TABLE).where({ id }).increment('attempts', 1),
  /** A failed send tries again later: 1, 2, 4, 8 ... minutes after each failure. */
  retryLater: (trx, id, attempts) =>
    trx(TABLE)
      .where({ id })
      .update({ attempts: attempts + 1, available_at: new Date(Date.now() + 2 ** attempts * 60_000) }),
};
