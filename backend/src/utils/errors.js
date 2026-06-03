// Error monitoring (shared/domain/errors.js): records a crash as one row per bug, counting
// repeats. A new bug, or a resolved one that comes back, emails the admins at most once an
// hour. Recording never throws: a failure here is only logged, so it cannot hide the error
// being recorded.
import { createHash } from 'node:crypto';
import { LIMITS, fingerprintParts, scrub } from '../../../shared/domain/errors.js';
import { outboxModel } from '../models/outbox.js';

// a browser can report anything, so it may open at most this many new groups an hour
const NEW_BROWSER_GROUPS_PER_HOUR = 200;
const STACK_LINES = 15;

const stackOf = (stack) => (stack ? scrub(String(stack).split('\n').slice(0, STACK_LINES).join('\n'), LIMITS.stack) : null);

export async function recordError(dbs, e, { logger } = {}) {
  try {
    const row = {
      source: e.source,
      kind: scrub(e.kind || 'Error', LIMITS.kind),
      message: scrub(e.message || 'No message'),
      where: scrub(e.where || 'unknown', LIMITS.where),
    };
    const fingerprint = createHash('sha256').update(fingerprintParts(row)).digest('hex');
    const db = dbs.identity;
    const before = await db('error_groups').where({ fingerprint }).first('id', 'status');
    if (!before && ['web', 'admin'].includes(row.source)) {
      const recent = await db('error_groups').whereIn('source', ['web', 'admin']).andWhere('first_seen', '>', new Date(Date.now() - 3600_000)).count({ n: '*' }).first();
      if (Number(recent.n) >= NEW_BROWSER_GROUPS_PER_HOUR) return null;
    }
    const context = e.context ? JSON.stringify(e.context) : null;
    const release = e.release ? scrub(e.release, LIMITS.release) : null;
    // regressed_at is set before status changes, so it still sees the old status
    await db.raw(
      `INSERT INTO error_groups (fingerprint, source, kind, message, where_at, stack, context, last_request_id, release_tag)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE seen = seen + 1, last_seen = CURRENT_TIMESTAMP(3), message = VALUES(message), stack = VALUES(stack),
         context = VALUES(context), last_request_id = VALUES(last_request_id), release_tag = VALUES(release_tag),
         regressed_at = IF(status = 'resolved', CURRENT_TIMESTAMP(3), regressed_at), status = IF(status = 'resolved', 'open', status)`,
      [fingerprint, row.source, row.kind, row.message, row.where, stackOf(e.stack), context, e.requestId ?? null, release],
    );
    const group = await db('error_groups').where({ fingerprint }).first('id');
    if (!before || before.status === 'resolved') {
      const hour = Math.floor(Date.now() / 3600_000);
      const summary = `${before ? 'Came back' : 'New error'} (${row.source}): ${row.kind} at ${row.where}: ${row.message}`;
      await db.transaction((trx) => outboxModel.addOnce(trx, 'admin.alert', `error:${group.id}:${hour}`, { type: 'error', errorId: group.id, summary }));
    }
    return group.id;
  } catch (err) {
    logger?.error({ reason: err.code ?? err.message }, 'error not recorded');
    return null;
  }
}

/**
 * Kind, message and stack of a thrown error. A database error's message (and the first line
 * of its stack) is the whole SQL statement with its values, which can be what someone typed,
 * so only MySQL's own message is kept, with quoted values blanked.
 */
export function describeError(err) {
  if (err?.sqlMessage) {
    const stack = String(err.stack ?? '').split('\n').slice(1).join('\n');
    return { kind: err.code ?? 'DB_ERROR', message: err.sqlMessage.replace(/'[^']*'/g, "'?'"), stack };
  }
  return { kind: err?.code ?? err?.name ?? 'Error', message: err?.message ?? String(err), stack: err?.stack };
}

/** The route an API request matched, without ids: "POST /orders/:id/cancel". */
export const routeOf = (req) => `${req.method} ${req.route ? `${req.baseUrl}${req.route.path}` : (req.originalUrl ?? '').split('?')[0].replace(/^\/api\/v1/, '').replace(/\/\d+(?=\/|$)/g, '/:id')}`;
