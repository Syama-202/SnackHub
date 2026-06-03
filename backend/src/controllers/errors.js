// Error monitoring (shared/domain/errors.js):
//   POST  /client-errors               a browser crash from the shop site or the admin console (no sign-in needed)
//   GET   /admin/errors                 groups, newest first, by status and source
//   GET   /admin/errors/:id             one group with its latest stack and context
//   POST  /admin/errors/:id/status      { status } resolved, ignored or open again
import { AppError } from '../utils/AppError.js';
import { recordError } from '../utils/errors.js';
import { routeShape } from '../../../shared/domain/errors.js';
import { auditLogModel } from '../models/identity/auditLog.js';

const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
const view = (r, full = false) => ({
  id: r.id,
  source: r.source,
  kind: r.kind,
  message: r.message,
  where: r.where_at,
  status: r.status,
  seen: r.seen,
  firstSeen: new Date(r.first_seen).getTime(),
  lastSeen: new Date(r.last_seen).getTime(),
  regressedAt: r.regressed_at ? new Date(r.regressed_at).getTime() : null,
  release: r.release_tag,
  requestId: r.last_request_id,
  resolvedAt: r.resolved_at ? new Date(r.resolved_at).getTime() : null,
  ...(full && { stack: r.stack, context: parse(r.context) ?? {} }),
});

export function errorsController({ dbs, logger }) {
  async function report(req, res) {
    const b = req.body;
    await recordError(dbs, { source: b.source, kind: b.kind, message: b.message, where: `page ${routeShape(b.page)}`, stack: b.stack, release: b.release, context: { browser: b.browser ?? null } }, { logger });
    res.status(202).json({ recorded: true });
  }

  async function list(req, res) {
    const { status = 'open', source } = req.query;
    const rows = await dbs.identity('error_groups')
      .where({ status })
      .modify((q) => source && q.where({ source }))
      .orderBy('last_seen', 'desc')
      .limit(100);
    const counts = await dbs.identity('error_groups').groupBy('status').select('status', dbs.identity.raw('COUNT(*) AS n'));
    res.json({ groups: rows.map((r) => view(r)), counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) });
  }

  const find = async (id) => {
    const row = await dbs.identity('error_groups').where({ id }).first();
    if (!row) throw new AppError(404, 'NOT_FOUND', 'No such error');
    return row;
  };

  async function show(req, res) {
    res.json(view(await find(req.params.id), true));
  }

  async function setStatus(req, res) {
    const before = await find(req.params.id);
    const { status } = req.body;
    const closing = status !== 'open';
    await dbs.identity('error_groups').where({ id: before.id }).update({ status, resolved_by: closing ? req.user.userId : null, resolved_at: closing ? new Date() : null });
    await auditLogModel.append(dbs.identity, { actorId: req.user.userId, action: `error.${status}`, target: `error:${before.id}`, before: { status: before.status }, after: { status } });
    res.json(view(await find(before.id), true));
  }

  return { report, list, show, setStatus };
}
