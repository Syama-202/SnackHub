// Seller and rider applications and the admin decisions on them (doc 11.2 to 11.4, 16.4).
//   POST /seller/apply, GET /seller/application    a customer applies to sell
//   POST /rider/apply, GET /rider/application      a customer applies to ride
//   GET  /admin/applications                       the approvals queue
//   POST /admin/applications/:id/check|approve|reject|needs-info
// The applicant is always the signed-in user from the token. A role is granted only from
// customer, only by an admin with a fresh second factor, and every admin write is audited.
import { AppError } from '../utils/AppError.js';
import { userModel } from '../models/identity/user.js';
import { auditLogModel } from '../models/identity/auditLog.js';
import { sellerModel } from '../models/catalog/seller.js';
import { sellerApplicationModel } from '../models/catalog/sellerApplication.js';
import { riderModel } from '../models/dispatch/rider.js';
import { riderApplicationModel } from '../models/dispatch/riderApplication.js';
import { outboxModel } from '../models/outbox.js';
import {
  CHECKS, OPEN_STATUSES, emptyChecks, decide, ROLE_FOR, ROLE_BEFORE_APPROVAL, SELLER_STATUS_AFTER,
} from '../../../shared/domain/applications.js';

const REFUSALS = {
  ALREADY_DECIDED: [409, 'This application has already been decided'],
  CHECKS_INCOMPLETE: [422, 'Every verification check must pass before approval'],
  REASON_REQUIRED: [422, 'A written reason is required'],
  UNKNOWN_ACTION: [404, 'Unknown action'],
};
const refuse = (code) => new AppError(REFUSALS[code][0], code, REFUSALS[code][1]);

// ids in the queue say which kind they are: seller-12, rider-3
const parseId = (id) => {
  const [kind, n] = id.split('-');
  return { kind: kind === 'seller' ? 'SELLER' : 'RIDER', id: Number(n) };
};

const sellerView = (a) => ({
  id: `seller-${a.id}`, kind: 'SELLER', sellerId: a.seller_id, name: a.shop_name, city: a.city, licenceNo: a.licence_no,
  licenceExpiresOn: a.licence_expires_on, status: a.status, checks: a.checks ?? emptyChecks('SELLER'), decisionReason: a.decision_reason,
  submittedAt: a.submitted_at, decidedAt: a.decided_at,
});
const riderView = (a) => ({
  id: `rider-${a.id}`, kind: 'RIDER', riderId: a.rider_id, name: a.name, city: a.city, vehicle: a.vehicle, vehicleNo: a.vehicle_no,
  licenceNo: a.licence_no, status: a.status, checks: a.checks ?? emptyChecks('RIDER'), decisionReason: a.decision_reason,
  submittedAt: a.submitted_at, decidedAt: a.decided_at,
});

export function applicationsController({ dbs }) {
  // ---------- applicants

  async function applySeller(req, res) {
    const userId = req.user.userId;
    const result = await dbs.catalog.transaction(async (trx) => {
      const existing = await sellerModel.findByUser(trx, userId);
      let sellerId = existing?.id;
      if (existing) {
        // only a rejected shop may apply again, with corrected details
        if (!(await sellerModel.reopen(trx, existing.id, req.body))) throw new AppError(409, 'ALREADY_APPLIED', 'You already have a shop or an application in progress');
      } else {
        sellerId = await sellerModel.create(trx, userId, req.body);
      }
      const id = await sellerApplicationModel.create(trx, { sellerId, checks: emptyChecks('SELLER') });
      await outboxModel.add(trx, 'seller.applied', { applicationId: id, sellerId, userId });
      return { id, sellerId };
    });
    await auditLogModel.append(dbs.identity, { actorId: userId, action: 'application.submit', target: `seller-application:${result.id}` });
    res.status(201).json({ id: `seller-${result.id}`, sellerId: result.sellerId, status: 'SUBMITTED' });
  }

  async function sellerApplication(req, res) {
    const shop = await sellerModel.findByUser(dbs.catalog, req.user.userId);
    const app = shop && (await sellerApplicationModel.latestForSeller(dbs.catalog, shop.id));
    if (!app) throw new AppError(404, 'NOT_FOUND', 'You have not applied to sell yet');
    res.json(sellerView({ ...app, shop_name: shop.shop_name, city: shop.city, licence_no: shop.licence_no, licence_expires_on: shop.licence_expires_on }));
  }

  async function applyRider(req, res) {
    const userId = req.user.userId;
    const id = await dbs.dispatch.transaction(async (trx) => {
      const last = await riderApplicationModel.latestForUser(trx, userId);
      if (last && last.status !== 'REJECTED') throw new AppError(409, 'ALREADY_APPLIED', 'You already ride with us or have an application in progress');
      const appId = await riderApplicationModel.create(trx, { userId, ...req.body, checks: emptyChecks('RIDER') });
      await outboxModel.add(trx, 'rider.applied', { applicationId: appId, userId });
      return appId;
    });
    await auditLogModel.append(dbs.identity, { actorId: userId, action: 'application.submit', target: `rider-application:${id}` });
    res.status(201).json({ id: `rider-${id}`, status: 'SUBMITTED' });
  }

  async function riderApplication(req, res) {
    const app = await riderApplicationModel.latestForUser(dbs.dispatch, req.user.userId);
    if (!app) throw new AppError(404, 'NOT_FOUND', 'You have not applied to ride yet');
    res.json(riderView(app));
  }

  // ---------- admin

  async function list(req, res) {
    const statuses = req.query.status === 'all' ? null : OPEN_STATUSES;
    const [sellers, riders] = await Promise.all([sellerApplicationModel.list(dbs.catalog, statuses), riderApplicationModel.list(dbs.dispatch, statuses)]);
    const all = [...sellers.map(sellerView), ...riders.map(riderView)];
    res.json(all.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)));
  }

  const load = async (kind, id) => {
    const app = kind === 'SELLER' ? await sellerApplicationModel.findById(dbs.catalog, id) : await riderApplicationModel.findById(dbs.dispatch, id);
    if (!app) throw new AppError(404, 'NOT_FOUND', 'Application not found');
    return app;
  };

  /** Ticks or clears one verification check; routine work, so no step-up. */
  async function check(req, res) {
    const { kind, id } = parseId(req.params.id);
    const app = await load(kind, id);
    if (!OPEN_STATUSES.includes(app.status)) throw refuse('ALREADY_DECIDED');
    const { check: name, value } = req.body;
    if (!CHECKS[kind].includes(name)) throw new AppError(422, 'UNKNOWN_CHECK', `There is no "${name}" check for this application`);
    const checks = { ...emptyChecks(kind), ...app.checks, [name]: value };
    const model = kind === 'SELLER' ? sellerApplicationModel : riderApplicationModel;
    await model.setChecks(kind === 'SELLER' ? dbs.catalog : dbs.dispatch, id, checks);
    await auditLogModel.append(dbs.identity, { actorId: req.user.userId, action: 'application.check', target: req.params.id, before: { [name]: Boolean(app.checks?.[name]) }, after: { [name]: value } });
    const fresh = await load(kind, id);
    res.json(kind === 'SELLER' ? sellerView({ ...fresh, ...(await shopOf(fresh.seller_id)) }) : riderView(fresh));
  }

  const shopOf = async (sellerId) => {
    const s = await sellerModel.findById(dbs.catalog, sellerId);
    return { user_id: s.user_id, shop_name: s.shop_name, city: s.city, licence_no: s.licence_no, licence_expires_on: s.licence_expires_on };
  };

  /**
   * approve, reject or needs-info. The module's own transaction records the decision (and
   * the shop status or the rider row, plus an outbox row); the identity transaction inside
   * it grants the role and writes the audit rows, so a failure in the module never leaves a
   * role behind.
   */
  async function decideOne(req, res) {
    const { kind, id } = parseId(req.params.id);
    const action = req.params.action;
    const app = await load(kind, id);
    const outcome = decide(kind, app, action, req.body.reason);
    if (outcome.error) throw refuse(outcome.error);

    const shop = kind === 'SELLER' ? await shopOf(app.seller_id) : null;
    const applicantId = kind === 'SELLER' ? shop.user_id : app.user_id;
    const applicant = await userModel.findById(dbs.identity, applicantId);
    if (outcome.status === 'APPROVED') {
      if (!applicant || applicant.status !== 'active') throw new AppError(409, 'APPLICANT_BLOCKED', 'The applicant account is blocked');
      if (applicant.role !== ROLE_BEFORE_APPROVAL) throw new AppError(409, 'ROLE_CONFLICT', `The applicant is already a ${applicant.role}; only a customer can be approved`);
    }
    const reviewerId = req.user.userId;
    const audit = async (trx) => {
      await auditLogModel.append(trx, { actorId: reviewerId, action: `application.${action}`, target: req.params.id, before: { status: app.status }, after: { status: outcome.status, reason: outcome.reason } });
      if (outcome.status !== 'APPROVED') return;
      const role = ROLE_FOR[kind];
      if (!(await userModel.grantRole(trx, applicantId, ROLE_BEFORE_APPROVAL, role))) throw new AppError(409, 'ROLE_CONFLICT', 'The applicant role changed; nothing was approved');
      await auditLogModel.append(trx, { actorId: reviewerId, action: 'role.grant', target: `user:${applicantId}`, before: { role: ROLE_BEFORE_APPROVAL }, after: { role } });
    };

    if (kind === 'SELLER') {
      await dbs.catalog.transaction(async (trx) => {
        if (!(await sellerApplicationModel.decide(trx, id, { ...outcome, reviewerId, openStatuses: OPEN_STATUSES }))) throw refuse('ALREADY_DECIDED');
        const next = SELLER_STATUS_AFTER[outcome.status];
        if (outcome.status === 'APPROVED') await sellerModel.markVerified(trx, app.seller_id, next);
        else await sellerModel.setStatus(trx, app.seller_id, next);
        await outboxModel.add(trx, `seller.application.${outcome.status.toLowerCase()}`, { applicationId: id, sellerId: app.seller_id, userId: applicantId });
        await dbs.identity.transaction(audit);
      });
    } else {
      await dbs.dispatch.transaction(async (trx) => {
        const riderId = outcome.status === 'APPROVED' ? await riderModel.createApproved(trx, { userId: applicantId, name: app.name, city: app.city, vehicle: app.vehicle }) : null;
        if (!(await riderApplicationModel.decide(trx, id, { ...outcome, reviewerId, riderId, openStatuses: OPEN_STATUSES }))) throw refuse('ALREADY_DECIDED');
        await outboxModel.add(trx, `rider.application.${outcome.status.toLowerCase()}`, { applicationId: id, riderId, userId: applicantId });
        await dbs.identity.transaction(audit);
      });
    }
    const fresh = await load(kind, id);
    res.json(kind === 'SELLER' ? sellerView({ ...fresh, ...shop }) : riderView(fresh));
  }

  return { applySeller, sellerApplication, applyRider, riderApplication, list, check, decide: decideOne };
}
