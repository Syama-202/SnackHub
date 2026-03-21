// Riders for orders (doc 10.2 to 10.4): offers with a 20-second timer, one accepted rider
// per order (the database refuses a second), GPS pings checked for impossible jumps, and the
// two distances that unlock the delivery: the code shows at 500 m, the door at 150 m.
import { AppError } from './AppError.js';
import { inbox, move, policyOf, refreshRiderStatus } from './orders.js';
import { orderModel, NEEDS_RIDER } from '../models/ordering/order.js';
import { assignmentModel } from '../models/dispatch/assignment.js';
import { riderModel } from '../models/dispatch/rider.js';
import { riderTrailModel } from '../models/dispatch/riderTrail.js';
import { sellerModel } from '../models/catalog/seller.js';
import { rankRiders, speedMps, MAX_SPEED_MPS, TRAIL_MIN_INTERVAL_MS } from '../../../shared/domain/dispatch.js';
import { distanceM } from '../../../shared/domain/geo.js';

const point = (row, lat = 'lat', lng = 'lng') => ({ lat: Number(row[lat]), lng: Number(row[lng]) });
const lastTrailAt = new Map();

/**
 * Offers an order that needs a rider to the best one not asked yet. Nothing happens if an
 * offer is already open or nobody fits; the timer job tries again on its next pass.
 */
export async function offerNext(dbs, order) {
  if (!NEEDS_RIDER.includes(order.status) || order.rider_id) return null;
  if (await assignmentModel.hasOpen(dbs.dispatch, order.id)) return null;
  const policy = await policyOf(dbs, order);
  const shop = await sellerModel.findById(dbs.catalog, order.seller_id);
  const riders = await riderModel.listDispatchable(dbs.dispatch);
  if (!shop || !riders.length) return null;
  const ids = riders.map((r) => r.id);
  const [asked, loads, declines] = await Promise.all([assignmentModel.riderIdsAsked(dbs.dispatch, order.id), orderModel.loadByRider(dbs.ordering, ids), assignmentModel.declinesToday(dbs.dispatch, ids)]);
  // a rider carrying hot food takes nothing else on the way
  const carryingHot = riders.filter((r) => loads.get(r.id)?.hot).map((r) => r.id);
  const ranked = rankRiders(
    riders.map((r) => ({ id: r.id, ...point(r, 'last_lat', 'last_lng'), lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at).getTime() : null })),
    point(shop),
    { policy, temp: order.temp_class, activeById: new Map([...loads].map(([id, l]) => [id, l.active])), declinesById: declines, exclude: [...asked, ...carryingHot] },
  );
  if (!ranked.length) return null;
  return assignmentModel.offer(dbs.dispatch, order.id, ranked[0].rider.id);
}

/** The rider takes the order. Exactly one rider wins; everyone else is told it is gone. */
export async function acceptOffer(dbs, rider, offerId) {
  const offer = await assignmentModel.findForRider(dbs.dispatch, offerId, rider.id);
  if (!offer || offer.status !== 'OFFERED') throw new AppError(410, 'OFFER_GONE', 'This offer expired or went to another rider');
  const order = await orderModel.findById(dbs.ordering, offer.order_id);
  const policy = await policyOf(dbs, order);
  if (Date.now() - new Date(offer.offered_at).getTime() > policy.offerTimeoutSec * 1000) {
    await assignmentModel.expire(dbs.dispatch, offer.id);
    throw new AppError(410, 'OFFER_GONE', 'This offer timed out');
  }
  if (!NEEDS_RIDER.includes(order.status) || order.rider_id) {
    await assignmentModel.expire(dbs.dispatch, offer.id);
    throw new AppError(410, 'OFFER_GONE', 'This order no longer needs a rider');
  }
  if (!(await assignmentModel.accept(dbs.dispatch, offer.id, rider.id))) throw new AppError(409, 'ALREADY_ASSIGNED', 'Another rider took this order');
  // the order side: only while it still has no rider (UPDATE ... WHERE rider_id IS NULL)
  if (!(await orderModel.assignRider(dbs.ordering, order.id, rider.id))) {
    await dbs.dispatch('assignments').where({ id: offer.id }).update({ status: 'EXPIRED' });
    throw new AppError(410, 'OFFER_GONE', 'This order no longer needs a rider');
  }
  await assignmentModel.expireOthers(dbs.dispatch, order.id);
  await refreshRiderStatus(dbs, rider.id);
  return order.id;
}

export async function declineOffer(dbs, rider, offerId) {
  const offer = await assignmentModel.findForRider(dbs.dispatch, offerId, rider.id);
  if (!offer || offer.status !== 'OFFERED') throw new AppError(410, 'OFFER_GONE', 'This offer expired or went to another rider');
  await assignmentModel.decline(dbs.dispatch, offer.id, rider.id);
  const order = await orderModel.findById(dbs.ordering, offer.order_id);
  if (order) await offerNext(dbs, order);
}

/**
 * A GPS ping. Positions that would need more than about 120 km/h are refused. During a
 * delivery the point goes on the trail, and the server alone decides when the code shows
 * (500 m) and when the rider has arrived (150 m).
 */
export async function recordPosition(dbs, rider, at) {
  if (rider.status === 'OFFLINE') throw new AppError(409, 'OFFLINE', 'Go online to share your location');
  const now = Date.now();
  if (rider.last_lat != null && rider.last_seen_at) {
    const v = speedMps(point(rider, 'last_lat', 'last_lng'), at, now - new Date(rider.last_seen_at).getTime());
    if (v > MAX_SPEED_MPS) throw new AppError(422, 'GPS_JUMP', 'Location jump rejected');
  }
  await riderModel.setPosition(dbs.dispatch, rider.id, at);
  const active = await orderModel.listActiveForRider(dbs.ordering, rider.id);
  const writeTrail = now - (lastTrailAt.get(rider.id) ?? 0) >= TRAIL_MIN_INTERVAL_MS;
  if (writeTrail) lastTrailAt.set(rider.id, now);
  for (const order of active) {
    if (writeTrail) await riderTrailModel.append(dbs.dispatch, { orderId: order.id, riderId: rider.id, lat: at.lat, lng: at.lng });
    if (!['PICKED_UP', 'ON_THE_WAY', 'ARRIVED'].includes(order.status)) continue;
    const policy = await policyOf(dbs, order);
    const d = distanceM(at, point(order, 'drop_lat', 'drop_lng'));
    if (d <= policy.otpRevealM && !order.otp_revealed_at) {
      await dbs.ordering.transaction(async (trx) => {
        const n = await trx('orders').where({ id: order.id }).whereNull('otp_revealed_at').update({ otp_revealed_at: new Date() });
        // the notification says the code is ready; it never contains it
        if (n) await inbox(trx, { userId: order.customer_id, orderId: order.id, type: 'rider.nearby', body: 'Your rider is nearby. Your delivery code is now available.' });
      });
    }
    if (order.status === 'ON_THE_WAY' && d <= policy.arrivalGeofenceM) {
      await move(dbs, order, 'ARRIVED', { role: 'system', set: { arrived_at: new Date() }, notify: [{ userId: order.customer_id, type: 'order.arrived', body: 'Your rider has reached. Share your code at the door.' }] });
    }
  }
}

/** Offers that ran out of time close, and the order goes to the next rider. */
export async function expireOffers(dbs) {
  const before = new Date(Date.now() - 20_000);
  let moved = 0;
  for (const offer of await assignmentModel.listOpenBefore(dbs.dispatch, before)) {
    const order = await orderModel.findById(dbs.ordering, offer.order_id);
    const policy = order ? await policyOf(dbs, order) : null;
    if (policy && Date.now() - new Date(offer.offered_at).getTime() < policy.offerTimeoutSec * 1000) continue;
    if (!(await assignmentModel.expire(dbs.dispatch, offer.id))) continue;
    moved += 1;
    if (order) await offerNext(dbs, await orderModel.findById(dbs.ordering, order.id));
  }
  return moved;
}

/** Distance from the rider's last position to a point, or Infinity without a recent one. */
export function riderDistanceTo(rider, target, maxAgeMs = 2 * 60_000) {
  if (rider.last_lat == null || !rider.last_seen_at || Date.now() - new Date(rider.last_seen_at).getTime() > maxAgeMs) return Infinity;
  return distanceM(point(rider, 'last_lat', 'last_lng'), target);
}
