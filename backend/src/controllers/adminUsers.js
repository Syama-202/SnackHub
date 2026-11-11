// Accounts, for admins only (admin host, second factor):
//   GET  /admin/users                          customers, sellers and riders, filtered, paginated
//   POST /admin/users/:id/suspend | reactivate the whole account, with a reason
//   POST /admin/users/:id/roles/:role/suspend | reactivate   one role only
//   POST /admin/users/:id/mfa-reset            remove a lost authenticator after an identity check
//   GET  /admin/audit                          the audit log, filtered, paginated
// Staff accounts are managed only by the server owner (create-admin), never from here, so an
// admin cannot lock other admins out. Every change needs a reason, is audited and emails the person.
import { AppError } from '../utils/AppError.js';
import { queueEmail } from '../utils/notify.js';
import { userModel } from '../models/identity/user.js';
import { userRoleModel } from '../models/identity/userRole.js';
import { mfaTotpModel } from '../models/identity/mfaTotp.js';
import { recoveryCodeModel } from '../models/identity/recoveryCode.js';
import { refreshTokenModel } from '../models/identity/refreshToken.js';
import { mfaChallengeModel } from '../models/identity/mfaChallenge.js';
import { auditLogModel } from '../models/identity/auditLog.js';
import { STAFF_ROLES } from '../../../shared/domain/permissions.js';
import { isErased } from '../../../shared/domain/accounts.js';
import { realtime } from '../utils/realtime.js';

export function adminUsersController({ env, dbs }) {
  const db = dbs.identity;

  /** The account an admin may act on: exists, is not staff, is not themselves. */
  async function target(req) {
    const id = Number(req.params.id);
    if (id === req.user.userId) throw new AppError(403, 'SELF_TARGET', 'You cannot change your own account here');
    const user = await userModel.findById(db, id);
    if (!user) throw new AppError(404, 'NOT_FOUND', 'No such account');
    const roles = await userRoleModel.listForUser(db, id);
    if (roles.some((r) => STAFF_ROLES.includes(r.role))) throw new AppError(403, 'STAFF_TARGET', 'Staff accounts are managed by the server owner');
    return { user, roles };
  }

  async function list(req, res) {
    const { role, status, q, page, pageSize } = req.query;
    const like = q?.replace(/[%_\\]/g, (c) => `\\${c}`);
    const { total, items } = await userModel.list(db, { role, status, q: like, page, pageSize });
    const roles = await userRoleModel.forUsers(db, items.map((u) => u.id));
    const mfa = new Set(items.length ? await db('mfa_totp').whereIn('user_id', items.map((u) => u.id)).pluck('user_id') : []);
    res.json({
      total,
      page,
      pageSize,
      items: items.map((u) => ({ id: u.id, name: u.name, email: u.email, status: u.status, statusReason: u.status_reason, emailVerified: Boolean(u.email_verified_at), mobileVerified: Boolean(u.mobile_verified_at), mfaEnrolled: mfa.has(u.id), roles: roles.get(u.id) ?? [], createdAt: u.created_at })),
    });
  }

  const setAccount = (status) => async (req, res) => {
    const { user } = await target(req);
    if (user.status === status) throw new AppError(409, 'NO_CHANGE', `The account is already ${status}`);
    // an account its owner deleted has nothing left to bring back
    if (isErased(user.email)) throw new AppError(409, 'ACCOUNT_DELETED', 'The owner deleted this account. It cannot be changed.');
    await db.transaction(async (trx) => {
      await userModel.setStatus(trx, user.id, status, req.body.reason);
      // a suspension ends every session now; requireRole re-reads the status on every request too
      if (status === 'suspended') await refreshTokenModel.revokeUser(trx, user.id);
      await auditLogModel.append(trx, { actorId: req.user.userId, action: `user.${status === 'suspended' ? 'suspend' : 'reactivate'}`, target: `user:${user.id}`, before: { status: user.status }, after: { status, reason: req.body.reason } });
      await queueEmail(env, trx, { template: status === 'suspended' ? 'account_suspended' : 'account_reactivated', to: user.email, data: { name: user.name, reason: req.body.reason } });
    });
    // live sockets close too; a reactivated person simply signs in again
    if (status === 'suspended') realtime.kick(user.id);
    res.json({ id: user.id, status });
  };

  const setRole = (status) => async (req, res) => {
    const { user, roles } = await target(req);
    const role = req.params.role;
    const m = roles.find((r) => r.role === role);
    if (!m) throw new AppError(404, 'NOT_FOUND', `This account has no ${role} role`);
    if (m.status === status) throw new AppError(409, 'NO_CHANGE', `The ${role} role is already ${status}`);
    await db.transaction(async (trx) => {
      await userRoleModel.setStatus(trx, user.id, role, status, req.body.reason);
      await auditLogModel.append(trx, { actorId: req.user.userId, action: `role.${status === 'suspended' ? 'suspend' : 'reactivate'}`, target: `user:${user.id}`, before: { role, status: m.status }, after: { role, status, reason: req.body.reason } });
    });
    // every live socket of the person closes; the ones for other roles reconnect and pass the checks again
    if (status === 'suspended') realtime.kick(user.id);
    res.json({ id: user.id, role, status });
  };

  async function mfaReset(req, res) {
    const { user } = await target(req);
    if (!(await mfaTotpModel.find(db, user.id))) throw new AppError(409, 'NO_CHANGE', 'This account has no authenticator');
    await db.transaction(async (trx) => {
      await mfaTotpModel.remove(trx, user.id);
      await recoveryCodeModel.removeAll(trx, user.id);
      await mfaChallengeModel.expireForUser(trx, user.id);
      await refreshTokenModel.revokeUser(trx, user.id);
      await auditLogModel.append(trx, { actorId: req.user.userId, action: 'user.mfa_reset', target: `user:${user.id}`, after: { reason: req.body.reason } });
      await queueEmail(env, trx, { template: 'mfa_reset', to: user.email, data: { name: user.name } });
    });
    res.json({ id: user.id, mfaEnrolled: false });
  }

  async function audit(req, res) {
    const { action, actorId, target: t, page, pageSize } = req.query;
    const base = db('audit_log')
      .modify((q) => action && q.where('action', 'ilike', `${action.replace(/[%_\\]/g, (c) => `\\${c}`)}%`))
      .modify((q) => actorId && q.where({ actor_id: actorId }))
      .modify((q) => t && q.where({ target: t }));
    const [{ n }] = await base.clone().count('* as n');
    const rows = await base.clone().orderBy('id', 'desc').limit(pageSize).offset((page - 1) * pageSize);
    const ids = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))];
    const names = new Map((ids.length ? await db('users').whereIn('id', ids).select('id', 'name') : []).map((u) => [u.id, u.name]));
    const json = (v) => (v == null ? null : typeof v === 'string' ? JSON.parse(v) : v);
    res.json({ total: Number(n), page, pageSize, items: rows.map((r) => ({ id: r.id, at: r.at, actorId: r.actor_id, actor: names.get(r.actor_id) ?? null, action: r.action, target: r.target, before: json(r.before_state), after: json(r.after_state) })) });
  }

  return { list, suspend: setAccount('suspended'), reactivate: setAccount('active'), suspendRole: setRole('suspended'), reactivateRole: setRole('active'), mfaReset, audit };
}
