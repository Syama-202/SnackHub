// Complaints, app credit and fines (doc 10.7). A customer reports a delivered order within its
// window (food quality: 2 hours, with 1 to 3 photos; anything else: 24 hours), once per kind of
// problem. The system attaches the order's own timeline as evidence and triages it with the
// shared rules; a confident, cheap, safe case is resolved at once with a credit, everything else
// waits for an admin. An unsafe-food report hides the shop at once and alerts the admins.
//   POST /orders/:id/complaints          report a problem (multipart, photos in "photos")
//   GET  /me/credits                     the customer's app credit
//   GET  /admin/complaints               the review queue with evidence and photo links
//   POST /admin/complaints/:id/decide    decide one (fresh code): credit and fines
//   GET  /admin/fines                    the fines ledger
//   POST /admin/fines/:id/reverse        reverse a fine (fresh code), with a reason
import { createHash } from 'node:crypto';
import { AppError } from '../utils/AppError.js';
import { inspectUpload } from '../utils/fileCheck.js';
import { signFileLink } from '../utils/signedUrl.js';
import { inbox, policyOf } from '../utils/orders.js';
import { realtime } from '../utils/realtime.js';
import { orderModel } from '../models/ordering/order.js';
import { orderItemModel } from '../models/ordering/orderItem.js';
import { complaintModel } from '../models/ordering/complaint.js';
import { customerCreditModel } from '../models/ordering/customerCredit.js';
import { fineModel } from '../models/ordering/fine.js';
import { outboxModel } from '../models/outbox.js';
import { sellerModel } from '../models/catalog/seller.js';
import { riderEarningModel } from '../models/dispatch/riderEarning.js';
import { auditLogModel } from '../models/identity/auditLog.js';
import { triage, canAutoResolve } from '../../../shared/domain/triage.js';
import { riderLateMin } from '../../../shared/domain/penalty.js';

const DUPLICATE = 1062;
const PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const CREDIT_DAYS = 30;
// the old food-quality detail column, for the subtypes that have one
const KIND = { STALE: 'STALE', NOT_HOT: 'COLD', WRONG_ITEM: 'WRONG_ITEM', MISSING_ITEM: 'WRONG_ITEM', DAMAGED: 'PACKAGING', UNSAFE: 'SAFETY' };
const ms = (d) => (d ? new Date(d).getTime() : null);
const minutes = (a, b) => (a && b ? (new Date(b).getTime() - new Date(a).getTime()) / 60_000 : 0);
const json = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export function complaintsController({ env, dbs, storage, scanner }) {
  async function complaintView(c, { viewerId = null, withPhotos = false } = {}) {
    const evidence = await complaintModel.evidence(dbs.ordering, c.id);
    const timeline = evidence.find((e) => e.kind === 'SYSTEM_TIMELINE');
    const photos = evidence.filter((e) => e.kind === 'PHOTO');
    return {
      id: c.id,
      orderId: c.order_id,
      category: c.category,
      subtype: c.subtype,
      description: c.description,
      itemIds: json(c.item_ids) ?? [],
      status: c.status,
      classification: c.classification,
      confidence: c.confidence == null ? null : Number(c.confidence),
      riderSharePct: c.rider_share_pct,
      sellerSharePct: c.seller_share_pct,
      autoDecided: Boolean(c.auto_decided),
      safety: Boolean(c.safety),
      resolution: c.resolution,
      reason: c.decision_reason,
      creditPaise: c.credit_paise,
      lateAlreadyCut: Boolean(c.late_already_cut),
      evidence: timeline ? json(timeline.content) : null,
      photoCount: photos.length,
      ...(withPhotos && { photos: photos.map((p) => ({ id: p.id, url: `/api/v1/files/${signFileLink(env, { ref: `complaint-photo:${p.id}`, viewerId })}` })) }),
      createdAt: ms(c.created_at),
      resolvedAt: ms(c.resolved_at),
    };
  }

  // ---------- customer
  async function create(req, res) {
    const customerId = req.user.userId;
    const order = await orderModel.findForCustomer(dbs.ordering, req.params.id, customerId);
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found');
    const { category, subtype, description, itemIds = [] } = req.body;
    if (order.status !== 'DELIVERED') throw new AppError(409, 'NOT_DELIVERED', 'You can report a problem after delivery');
    const windowMin = category === 'FOOD_QUALITY' ? 120 : 24 * 60;
    if (minutes(order.delivered_at, new Date()) > windowMin) throw new AppError(409, 'WINDOW_CLOSED', category === 'FOOD_QUALITY' ? 'Food quality reports close 2 hours after delivery' : 'Reports close 24 hours after delivery');
    if ((await complaintModel.listByOrder(dbs.ordering, order.id)).some((c) => c.category === category)) throw new AppError(409, 'DUPLICATE', 'You already reported this kind of problem for this order');
    const files = req.files ?? [];
    if (category === 'FOOD_QUALITY' && !files.length) throw new AppError(422, 'PHOTO_REQUIRED', 'Add 1 to 3 photos for a food quality report');
    const items = await orderItemModel.listByOrder(dbs.ordering, order.id);
    if (itemIds.some((id) => !items.some((i) => i.product_id === id))) throw new AppError(422, 'ITEM_NOT_IN_ORDER', 'Pick items from this order');

    // photos: real images only, scanned, stored privately before anything is written
    const stored = [];
    for (const f of files) {
      const checked = inspectUpload(f.buffer);
      if (checked.error || !PHOTO_MIME.includes(checked.mime)) throw new AppError(422, 'FILE_INVALID', checked.error ?? 'Photos must be JPEG, PNG or WebP');
      if ((await scanner.scan(f.buffer)) === 'infected') throw new AppError(422, 'FILE_INFECTED', 'A photo did not pass the virus check and was not saved');
      stored.push({ key: await storage.put(f.buffer), sha256: createHash('sha256').update(f.buffer).digest('hex'), mime: checked.mime, sizeBytes: f.buffer.length });
    }

    // the evidence the system already holds: no one types it in
    const policy = await policyOf(dbs, order);
    const lateMin = Math.max(0, minutes(order.promised_at, order.delivered_at));
    const evidence = {
      promisedAt: ms(order.promised_at),
      deliveredAt: ms(order.delivered_at),
      lateMin: Math.round(lateMin * 10) / 10,
      sellerDelayMin: order.seller_delay_min ?? 0,
      riderLateMin: Math.round(riderLateMin({ lateMin, sellerDelayMin: order.seller_delay_min ?? 0, graceMin: policy.graceMin }) * 10) / 10,
      packedToPickedMin: Math.round(minutes(order.packed_at, order.picked_at) * 10) / 10,
      rideMin: Math.round(minutes(order.ride_started_at, order.arrived_at) * 10) / 10,
      otpVerified: true, // a real order is delivered only with the customer's code
      geofencePassed: Boolean(order.arrived_at),
      pickupSealed: Boolean(order.pickup_sealed),
      hasPhoto: stored.length > 0,
    };
    const t = triage({ subtype, evidence, rideLimitMin: order.temp_class === 'HOT' ? policy.hot.maxRideMin : policy.ambient.maxRideMin });
    const affected = items.filter((i) => itemIds.includes(i.product_id)).reduce((s, i) => s + i.unit_price_paise * i.qty, 0) || order.subtotal_paise;
    // a late order gets a small apology credit; an item problem credits what was affected
    const creditValue = subtype === 'LATE' ? Math.min(5000, Math.round(order.subtotal_paise * 0.2)) : affected;
    const auto = canAutoResolve(t, creditValue);

    let id;
    try {
      id = await dbs.ordering.transaction(async (trx) => {
        const cid = await complaintModel.create(trx, {
          order_id: order.id,
          seller_id: order.seller_id,
          customer_id: customerId,
          rider_id: order.rider_id,
          category,
          subtype,
          kind: KIND[subtype] ?? null,
          description: description || null,
          item_ids: JSON.stringify(itemIds),
          status: auto ? 'RESOLVED' : 'IN_REVIEW',
          classification: t.classification,
          confidence: t.confidence,
          rider_share_pct: t.riderSharePct,
          seller_share_pct: t.sellerSharePct,
          auto_decided: auto,
          safety: Boolean(t.safety),
          ...(auto && { resolution: 'VALID', decision_reason: 'Resolved at once from the order’s own timeline', credit_paise: creditValue, resolved_at: new Date() }),
        });
        await complaintModel.addEvidence(trx, cid, { kind: 'SYSTEM_TIMELINE', content: evidence });
        for (const p of stored) await complaintModel.addEvidence(trx, cid, { kind: 'PHOTO', storage_key: p.key, sha256: p.sha256, content: { mime: p.mime, sizeBytes: p.sizeBytes } });
        if (auto) await customerCreditModel.create(trx, { customerId, complaintId: cid, amountPaise: creditValue, expiresAt: inDays(CREDIT_DAYS) });
        await inbox(trx, { userId: customerId, orderId: order.id, type: `complaint.${category.toLowerCase()}`, body: auto ? 'Complaint resolved. A credit was added to your account for your next pay-on-delivery order.' : 'Complaint received. An admin will review it.' });
        if (t.safety) await outboxModel.add(trx, 'admin.alert', { type: 'unsafe_food_report', userId: customerId, orderId: order.id });
        return cid;
      });
    } catch (err) {
      for (const p of stored) await storage.remove(p.key);
      if (err.errno === DUPLICATE) throw new AppError(409, 'DUPLICATE', 'You already reported this kind of problem for this order');
      throw err;
    }
    // unsafe food: the shop is hidden at once, until an admin looks at it
    if (t.safety) {
      await sellerModel.setPaused(dbs.catalog, order.seller_id, true);
      await auditLogModel.append(dbs.identity, { actorId: null, action: 'shop.paused_for_safety', target: `seller:${order.seller_id}`, after: { complaintId: id } });
      const shop = await sellerModel.findById(dbs.catalog, order.seller_id);
      realtime.publish([{ userId: shop?.user_id, role: 'seller' }], 'shop');
    }
    realtime.publish(['complaints'], 'complaint', { orderId: order.id });
    res.status(201).json(await complaintView(await complaintModel.findById(dbs.ordering, id)));
  }

  async function credits(req, res) {
    const rows = await dbs.ordering('customer_credits').where({ customer_id: req.user.userId }).orderBy('id', 'desc').limit(20);
    res.json(rows.map((c) => ({ id: c.id, amountPaise: c.amount_paise, expiresAt: ms(c.expires_at), usedOrderId: c.used_order_id, complaintId: c.complaint_id })));
  }

  // ---------- admin
  async function queue(req, res) {
    const rows = await dbs.ordering('complaints').orderByRaw("status = 'IN_REVIEW' DESC").orderBy('created_at', 'desc').orderBy('id', 'desc').limit(req.query.limit ?? 100);
    res.json(await Promise.all(rows.map((c) => complaintView(c, { viewerId: req.user.userId, withPhotos: true }))));
  }

  async function decide(req, res) {
    const staffId = req.user.userId;
    const c = await complaintModel.findById(dbs.ordering, req.params.id);
    if (!c) throw new AppError(404, 'NOT_FOUND', 'Complaint not found');
    if (c.status !== 'IN_REVIEW') throw new AppError(409, 'ALREADY_DECIDED', 'This complaint was already decided');
    const { resolution, reason } = req.body;
    const valid = resolution !== 'INVALID';
    const creditPaise = valid ? req.body.creditPaise : 0;
    // no second rider fine for lateness that the rider's pay already lost (doc 10.7)
    const earning = c.rider_id ? await riderEarningModel.findByOrder(dbs.dispatch, c.order_id) : null;
    const lateAlreadyCut = c.subtype === 'LATE' && Boolean(earning?.penalty_paise);
    const riderFine = valid && c.rider_id && !lateAlreadyCut ? req.body.riderFinePaise : 0;
    const sellerFine = valid ? req.body.sellerFinePaise : 0;
    const done = await dbs.ordering.transaction(async (trx) => {
      const ok = await complaintModel.resolve(trx, c.id, { resolvedBy: staffId, resolution, decision_reason: reason, credit_paise: creditPaise || null, late_already_cut: lateAlreadyCut, resolved_at: new Date() });
      if (!ok) return false;
      if (creditPaise) await customerCreditModel.create(trx, { customerId: c.customer_id, complaintId: c.id, amountPaise: creditPaise, expiresAt: inDays(CREDIT_DAYS) });
      if (riderFine) await fineModel.create(trx, { complaint_id: c.id, order_id: c.order_id, target_type: 'RIDER', target_id: c.rider_id, reason, amount_paise: riderFine, status: 'APPLIED', decided_by: staffId });
      if (sellerFine) await fineModel.create(trx, { complaint_id: c.id, order_id: c.order_id, target_type: 'SELLER', target_id: c.seller_id, reason, amount_paise: sellerFine, status: 'APPLIED', decided_by: staffId });
      await inbox(trx, { userId: c.customer_id, orderId: c.order_id, type: `complaint.decided.${c.id}`, body: valid ? `Your complaint was resolved${creditPaise ? ' and a credit was added to your account' : ''}: ${reason}` : `Your complaint was reviewed and not upheld: ${reason}` });
      return true;
    });
    if (!done) throw new AppError(409, 'ALREADY_DECIDED', 'This complaint was already decided');
    await auditLogModel.append(dbs.identity, { actorId: staffId, action: 'complaint.decide', target: `complaint:${c.id}`, before: { status: 'IN_REVIEW' }, after: { resolution, creditPaise, riderFine, sellerFine, lateAlreadyCut } });
    realtime.publish(['complaints'], 'complaint', { orderId: c.order_id });
    res.json(await complaintView(await complaintModel.findById(dbs.ordering, c.id), { viewerId: staffId, withPhotos: true }));
  }

  const fineView = (f) => ({ id: f.id, complaintId: f.complaint_id, orderId: f.order_id, targetType: f.target_type, targetId: f.target_id, reason: f.reason, amountPaise: f.amount_paise, status: f.status, reverseReason: f.reverse_reason, createdAt: ms(f.created_at) });

  async function fines(req, res) {
    res.json((await dbs.ordering('fines').orderBy('id', 'desc').limit(req.query.limit ?? 200)).map(fineView));
  }

  async function reverseFine(req, res) {
    const staffId = req.user.userId;
    const n = await dbs.ordering('fines').where({ id: req.params.id, status: 'APPLIED' }).update({ status: 'REVERSED', reversed_by: staffId, reverse_reason: req.body.reason });
    if (!n) throw new AppError(409, 'NOT_REVERSIBLE', 'Only an applied fine can be reversed');
    await auditLogModel.append(dbs.identity, { actorId: staffId, action: 'fine.reverse', target: `fine:${req.params.id}`, before: { status: 'APPLIED' }, after: { status: 'REVERSED', reason: req.body.reason } });
    realtime.publish(['complaints'], 'complaint');
    res.json(fineView(await dbs.ordering('fines').where({ id: req.params.id }).first()));
  }

  return { create, credits, queue, decide, fines, reverseFine };
}
