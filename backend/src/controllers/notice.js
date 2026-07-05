// The shop-wide announcement: anyone reads the current one, an admin sets or clears it.
import { siteNoticeModel } from '../models/notify/siteNotice.js';
import { auditLogModel } from '../models/identity/auditLog.js';

const CACHE_MS = 30_000;

export function noticeController({ dbs }) {
  // every page of the shop asks for this, so the answer is kept for half a minute
  let cached = null;
  const view = (n) => (n ? { id: n.id, message: n.message, tone: n.tone, endsAt: n.ends_at ? new Date(n.ends_at).getTime() : null } : null);
  const live = (n) => Boolean(n?.message) && (!n.ends_at || new Date(n.ends_at).getTime() > Date.now());

  async function show(req, res) {
    if (!cached || cached.at < Date.now() - CACHE_MS) cached = { at: Date.now(), row: await siteNoticeModel.latest(dbs.notify) };
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ notice: live(cached.row) ? view(cached.row) : null });
  }

  /** What is set now, shown or not, for the admin form. */
  async function current(req, res) {
    const row = await siteNoticeModel.latest(dbs.notify);
    res.json({ notice: row?.message ? view(row) : null, showing: live(row) });
  }

  async function save(req, res) {
    const { message, tone, endsAt } = req.body;
    const before = await siteNoticeModel.latest(dbs.notify);
    await siteNoticeModel.create(dbs.notify, { message, tone, endsAt: message && endsAt ? new Date(endsAt) : null, changedBy: req.user.userId });
    cached = null;
    await auditLogModel.append(dbs.identity, { actorId: req.user.userId, action: message ? 'notice.set' : 'notice.clear', target: 'site:notice', before: { message: before?.message ?? '' }, after: { message, tone } });
    await current(req, res);
  }

  return { show, current, save };
}
