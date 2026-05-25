// The rider app (doc 11.3): going online, offers with a 20-second timer, the active delivery,
// GPS pings, pickup and handover. rider_id always comes from the token's account; a rider only
// ever reaches orders assigned to them. Going online and accepting offers need an approved
// application with valid documents; going offline (when not on a delivery) never does.
//   GET  /rider/me                  the rider's row
//   PUT  /rider/status              { status: ONLINE | OFFLINE }
//   POST /rider/location            { lat, lng }
//   GET  /rider/offers              open offers
//   POST /rider/offers/:id/:action  accept | decline
//   GET  /rider/active              the delivery in hand, with the server's distances
//   POST /rider/orders/:id/:step    picked-up | deliver | emergency | unreachable
//   GET  /rider/earnings            pay for each delivery
//   POST /rider/earnings/:id/dispute  question a lateness cut within 48 hours
import { collectCod } from '../utils/payments.js';
import { AppError } from '../utils/AppError.js';
import { loadApplicant, eligibilityOf } from '../utils/applicants.js';
import { inbox, move, policyOf, refreshRiderStatus, trackState, viewOrder } from '../utils/orders.js';
import { realtime } from '../utils/realtime.js';
import { acceptOffer, declineOffer, recordPosition, riderDistanceTo } from '../utils/dispatch.js';
import { deliveryCodeMatches } from '../utils/deliveryCode.js';
import { orderModel } from '../models/ordering/order.js';
import { outboxModel } from '../models/outbox.js';
import { riderModel } from '../models/dispatch/rider.js';
import { assignmentModel } from '../models/dispatch/assignment.js';
import { riderEarningModel } from '../models/dispatch/riderEarning.js';
import { sellerModel } from '../models/catalog/seller.js';
import { auditLogModel } from '../models/identity/auditLog.js';
import { computeEarning } from '../../../shared/domain/penalty.js';
import { distanceM } from '../../../shared/domain/geo.js';

const ms = (d) => (d ? new Date(d).getTime() : null);
const refuse = (verdict) => new AppError(403, 'NOT_ELIGIBLE', verdict.reasons[0]?.message ?? 'Not allowed yet', { reasons: verdict.reasons });
const NOT_APPROVED = { code: 'NOT_APPROVED', message: 'Your rider application has not been approved yet' };
const HOT_HOLD_WARN_MIN = 10;
const DISPUTE_HOURS = 48;

const earningView = (e) => ({
  id: e.id,
  orderId: e.order_id,
  basePaise: e.base_paise,
  distancePaise: e.distance_paise,
  bonusPaise: e.bonus_paise,
  penaltyPaise: e.penalty_paise,
  netPaise: e.net_paise,
  lateMin: e.late_min,
  sellerDelayMin: e.seller_delay_min,
  status: e.status,
  disputeReason: e.dispute_reason,
  adjustmentPaise: e.adjustment_paise,
  resolutionReason: e.resolution_reason,
  createdAt: ms(e.created_at),
});

const meView = (r) => ({ id: r.id, name: r.name, city: r.city, vehicle: r.vehicle, status: r.status, lat: r.last_lat == null ? null : Number(r.last_lat), lng: r.last_lng == null ? null : Number(r.last_lng), lastSeenAt: ms(r.last_seen_at) });

export function deliveryController({ env, dbs }) {
  async function ownRider(userId) {
    const rider = await riderModel.findByUser(dbs.dispatch, userId);
    if (!rider) throw new AppError(403, 'NOT_ELIGIBLE', NOT_APPROVED.message, { reasons: [NOT_APPROVED] });
    return rider;
  }
  const mustBeEligible = async (userId) => {
    const verdict = eligibilityOf('rider', await loadApplicant(dbs, 'rider', userId));
    // being online never overrides a missing or expired licence or insurance
    if (!verdict.ok) throw refuse(verdict);
  };
  const audit = (userId, action, target, before, after) => auditLogModel.append(dbs.identity, { actorId: userId, action, target, before, after });

  async function me(req, res) {
    res.json(meView(await ownRider(req.user.userId)));
  }

  async function setStatus(req, res) {
    const userId = req.user.userId;
    const rider = await ownRider(userId);
    const status = req.body.status;
    if (status === 'ONLINE') await mustBeEligible(userId);
    if (status === 'OFFLINE' && (await orderModel.listActiveForRider(dbs.ordering, rider.id)).length) throw new AppError(409, 'ON_A_DELIVERY', 'Finish the delivery you are on before going offline');
    // online with a delivery in hand stays BUSY; the dispatch side sets that
    if (!(status === 'ONLINE' && rider.status === 'BUSY')) await riderModel.setStatus(dbs.dispatch, rider.id, status);
    if (status === 'OFFLINE') await assignmentModel.listOpenForRider(dbs.dispatch, rider.id).then((open) => Promise.all(open.map((o) => assignmentModel.expire(dbs.dispatch, o.id))));
    await refreshRiderStatus(dbs, rider.id);
    await audit(userId, 'rider.availability', `rider:${rider.id}`, { status: rider.status }, { status });
    realtime.publish(['ops'], 'rider');
    res.json(meView(await riderModel.findById(dbs.dispatch, rider.id)));
  }

  async function location(req, res) {
    const rider = await ownRider(req.user.userId);
    await recordPosition(dbs, rider, { lat: req.body.lat, lng: req.body.lng });
    res.json({ ok: true });
  }

  async function offers(req, res) {
    const rider = await ownRider(req.user.userId);
    if (rider.status === 'OFFLINE') return res.json([]);
    const open = await assignmentModel.listOpenForRider(dbs.dispatch, rider.id);
    const list = [];
    for (const a of open) {
      const order = await orderModel.findById(dbs.ordering, a.order_id);
      if (!order || order.rider_id || !['ACCEPTED', 'PACKING', 'PACKED'].includes(order.status)) continue;
      const policy = await policyOf(dbs, order);
      const expiresAt = ms(a.offered_at) + policy.offerTimeoutSec * 1000;
      if (expiresAt <= Date.now()) continue;
      const shop = await sellerModel.findById(dbs.catalog, order.seller_id);
      const e = computeEarning({ km: order.distance_m / 1000, lateMin: 0 }, policy);
      const here = rider.last_lat == null ? null : { lat: Number(rider.last_lat), lng: Number(rider.last_lng) };
      list.push({
        id: a.id,
        orderId: order.id,
        offeredAt: ms(a.offered_at),
        expiresAt,
        tempClass: order.temp_class,
        shop: shop.shop_name,
        pickupKm: here ? +(distanceM(here, { lat: Number(shop.lat), lng: Number(shop.lng) }) / 1000).toFixed(1) : null,
        dropKm: +(order.distance_m / 1000).toFixed(1),
        estPayPaise: e.basePaise + e.distancePaise,
        items: Number((await dbs.ordering('order_items').where({ order_id: order.id }).sum({ n: 'qty' }))[0].n),
      });
    }
    res.json(list);
  }

  async function respond(req, res) {
    const userId = req.user.userId;
    const rider = await ownRider(userId);
    if (req.params.action === 'decline') {
      await declineOffer(dbs, rider, req.params.id);
      return res.json({ declined: true });
    }
    await mustBeEligible(userId);
    const orderId = await acceptOffer(dbs, rider, req.params.id);
    await audit(userId, 'delivery.accept', `order:${orderId}`);
    res.json({ accepted: true, orderId });
  }

  async function active(req, res) {
    const rider = await ownRider(req.user.userId);
    const [order] = await orderModel.listActiveForRider(dbs.ordering, rider.id);
    if (!order) return res.json(null);
    const [seller, policy] = await Promise.all([sellerModel.findById(dbs.catalog, order.seller_id), policyOf(dbs, order)]);
    const track = trackState(order, { seller, rider, policy });
    const heldMin = order.status === 'PACKED' && order.temp_class === 'HOT' && order.packed_at ? (Date.now() - ms(order.packed_at)) / 60_000 : 0;
    const view = await viewOrder(dbs, order, 'rider');
    res.json({ ...view, track, insideGeofence: ['ON_THE_WAY', 'ARRIVED'].includes(order.status) && track.distanceM <= policy.arrivalGeofenceM, hotHoldWarning: heldMin > HOT_HOLD_WARN_MIN });
  }

  // ---------- delivery steps on an order assigned to this rider
  const alertAdmins = (order, type, userId) => dbs.ordering.transaction((trx) => outboxModel.add(trx, 'admin.alert', { type, userId, orderId: order.id }));

  async function pickedUp(rider, order, userId) {
    const ok = await move(dbs, order, 'PICKED_UP', { role: 'rider', actorId: userId, set: { picked_at: new Date(), pickup_sealed: true } });
    if (!ok) throw new AppError(409, 'ORDER_CHANGED', 'This order changed a moment ago');
    // the ride starts at once; the customer follows it from here
    await move(dbs, { ...order, status: 'PICKED_UP' }, 'ON_THE_WAY', { role: 'system', set: { ride_started_at: new Date() }, notify: [{ userId: order.customer_id, type: 'order.picked_up', body: 'Your rider is on the way' }] });
  }

  async function deliver(rider, order, userId, { code, collectedPaise }) {
    const policy = await policyOf(dbs, order);
    if (order.status !== 'ARRIVED') throw new AppError(409, 'NOT_ARRIVED', `The code works only inside ${policy.arrivalGeofenceM} m of the drop point`);
    if (riderDistanceTo(rider, { lat: Number(order.drop_lat), lng: Number(order.drop_lng) }) > policy.arrivalGeofenceM) throw new AppError(409, 'NOT_ARRIVED', `Move within ${policy.arrivalGeofenceM} m of the drop point to enter the code`);
    if (order.otp_locked_at) throw new AppError(423, 'OTP_LOCKED_ATTEMPTS', 'Too many wrong codes. An admin has been alerted.');
    if (order.payment_mode === 'COD' && collectedPaise == null) throw new AppError(422, 'CASH_REQUIRED', 'Enter the cash you collected');
    if (!deliveryCodeMatches(env, order.order_key, await orderModel.otpHash(dbs.ordering, order.id), code)) {
      const used = await orderModel.addOtpAttempt(dbs.ordering, order.id);
      if (used >= policy.otpMaxAttempts) {
        await orderModel.update(dbs.ordering, order.id, { otp_locked_at: new Date() });
        await alertAdmins(order, 'delivery_code_locked', userId);
        throw new AppError(423, 'OTP_LOCKED_ATTEMPTS', 'Too many wrong codes. An admin has been alerted.');
      }
      throw new AppError(422, 'OTP_INVALID', `Wrong code. ${policy.otpMaxAttempts - used} ${policy.otpMaxAttempts - used === 1 ? 'try' : 'tries'} left.`);
    }
    const deliveredAt = new Date();
    const ok = await move(dbs, order, 'DELIVERED', {
      role: 'rider',
      actorId: userId,
      set: { delivered_at: deliveredAt, closed_at: deliveredAt, ...(order.payment_mode === 'COD' && { collected_paise: collectedPaise }) },
      notify: [{ userId: order.customer_id, type: 'order.delivered', body: 'Delivered. Enjoy!' }],
    });
    if (!ok) throw new AppError(409, 'ORDER_CHANGED', 'This order changed a moment ago');
    if (order.payment_mode === 'COD') await collectCod(dbs, order, collectedPaise);
    if (order.payment_mode === 'COD' && collectedPaise !== order.total_paise) await alertAdmins(order, 'cash_mismatch', userId);
    // pay for this delivery, judged by the policy version the order was promised under
    const seller = await sellerModel.findById(dbs.catalog, order.seller_id);
    const km = distanceM({ lat: Number(seller.lat), lng: Number(seller.lng) }, { lat: Number(order.drop_lat), lng: Number(order.drop_lng) }) / 1000;
    const lateMin = (deliveredAt.getTime() - ms(order.promised_at)) / 60_000;
    const e = computeEarning({ km, lateMin, sellerDelayMin: order.seller_delay_min ?? 0 }, policy);
    await riderEarningModel.create(dbs.dispatch, {
      order_id: order.id,
      rider_id: rider.id,
      base_paise: e.basePaise,
      distance_paise: e.distancePaise,
      bonus_paise: e.bonusPaise,
      penalty_paise: e.penaltyPaise,
      late_min: Math.round(e.inputs.riderLateMin),
      seller_delay_min: order.seller_delay_min ?? 0,
      net_paise: e.netPaise,
    });
    await refreshRiderStatus(dbs, rider.id);
  }

  async function step(req, res) {
    const userId = req.user.userId;
    const rider = await ownRider(userId);
    // only an order with rider_id = this rider
    const order = await orderModel.findForRider(dbs.ordering, req.params.id, rider.id);
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found');
    const s = req.params.step;
    if (s === 'picked-up') await pickedUp(rider, order, userId);
    else if (s === 'deliver') await deliver(rider, order, userId, req.body);
    else {
      // emergency or customer not reachable: an admin takes over; nothing changes on the order
      await alertAdmins(order, s === 'emergency' ? 'rider_emergency' : 'customer_unreachable', userId);
      await audit(userId, `delivery.${s}`, `order:${order.id}`, null, req.body.note ? { note: req.body.note } : null);
      if (s === 'unreachable') await dbs.ordering.transaction((trx) => inbox(trx, { userId: order.customer_id, orderId: order.id, type: 'order.unreachable', body: 'Your rider could not reach you. Please answer your phone or open the door.' }));
      return res.json({ ok: true });
    }
    res.json(await viewOrder(dbs, await orderModel.findById(dbs.ordering, order.id), 'rider'));
  }

  async function earnings(req, res) {
    const rider = await ownRider(req.user.userId);
    res.json((await riderEarningModel.listByRider(dbs.dispatch, rider.id, 50)).map(earningView));
  }

  async function dispute(req, res) {
    const rider = await ownRider(req.user.userId);
    const e = await dbs.dispatch('rider_earnings').where({ id: req.params.id, rider_id: rider.id }).first();
    if (!e) throw new AppError(404, 'NOT_FOUND', 'Pay row not found');
    if (!e.penalty_paise) throw new AppError(409, 'NOTHING_TO_DISPUTE', 'There was no lateness cut on this delivery');
    if (Date.now() - ms(e.created_at) > DISPUTE_HOURS * 3_600_000) throw new AppError(409, 'APPEAL_WINDOW_CLOSED', `Disputes close ${DISPUTE_HOURS} hours after delivery`);
    const n = await dbs.dispatch('rider_earnings').where({ id: e.id, status: 'OK' }).update({ status: 'DISPUTED', dispute_reason: req.body.reason, disputed_at: new Date() });
    if (!n) throw new AppError(409, 'ALREADY_DISPUTED', 'This pay row was already disputed');
    await audit(req.user.userId, 'earning.dispute', `earning:${e.id}`, null, { reason: req.body.reason });
    realtime.publish(['complaints'], 'earning', { orderId: e.order_id });
    res.json(earningView(await dbs.dispatch('rider_earnings').where({ id: e.id }).first()));
  }

  return { me, setStatus, location, offers, respond, active, step, earnings, dispute };
}
