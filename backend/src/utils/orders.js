// The order flow across modules (doc 10.1 to 10.8). Each module keeps its own tables: the
// order and its history (ordering), stock and its holds (catalog), offers and positions
// (dispatch). A status change and the notifications it causes commit together in the
// ordering outbox; the relay puts them in the person's inbox. Every change goes through
// orderModel.transition, which applies canTransition() from the status the caller saw.
import { AppError } from './AppError.js';
import { deliveryCode } from './deliveryCode.js';
import { orderModel, WITH_RIDER } from '../models/ordering/order.js';
import { orderItemModel } from '../models/ordering/orderItem.js';
import { deliveryPolicyModel } from '../models/ordering/deliveryPolicy.js';
import { outboxModel } from '../models/outbox.js';
import { stockHoldModel } from '../models/catalog/stockHold.js';
import { sellerModel } from '../models/catalog/seller.js';
import { riderModel } from '../models/dispatch/rider.js';
import { assignmentModel } from '../models/dispatch/assignment.js';
import { realtime } from './realtime.js';
import { DEFAULT_POLICY, tempRules } from '../../../shared/domain/policy.js';
import { distanceM, clamp } from '../../../shared/domain/geo.js';

const ms = (d) => (d ? new Date(d).getTime() : null);

// ---------- delivery policy: every order is judged by the version it was promised under
const policies = new Map();

export async function currentPolicy(dbs) {
  let row = await deliveryPolicyModel.current(dbs.ordering);
  // a database without the seed still needs a first version for orders to point at
  if (!row) row = await deliveryPolicyModel.findById(dbs.ordering, await deliveryPolicyModel.create(dbs.ordering, { effectiveFrom: new Date(Date.now() - 1000), config: DEFAULT_POLICY }));
  policies.set(row.id, row.config);
  return { id: row.id, config: row.config };
}

export async function policyOf(dbs, order) {
  if (!policies.has(order.policy_id)) policies.set(order.policy_id, (await deliveryPolicyModel.findById(dbs.ordering, order.policy_id))?.config ?? DEFAULT_POLICY);
  return policies.get(order.policy_id);
}

// ---------- notifications: queued with the change that causes them, never with the code
export const inbox = (trx, { userId, orderId, type, body }) => outboxModel.addOnce(trx, 'notify.inbox', `inbox:${orderId}:${type}:${userId}`, { userId, orderId, type, body });

/**
 * Moves an order and queues its notifications in one transaction. Returns false when
 * someone else moved it first (the caller saw a stale status).
 */
export async function move(dbs, order, to, { role, actorId = null, set = {}, notify = [] }) {
  const done = await dbs.ordering.transaction(async (trx) => {
    const moved = await orderModel.transition(trx, order.id, { from: order.status, to, actorId, role, set });
    if (!moved) return false;
    for (const n of notify) await inbox(trx, { orderId: order.id, ...n });
    return true;
  });
  // after the commit, so an app that reads straight away sees the new status
  if (done) announceOrder(dbs, order.id);
  return done;
}

const sellerUserOf = async (dbs, order) => (await sellerModel.findById(dbs.catalog, order.seller_id))?.user_id ?? null;
const riderUserOf = async (dbs, order) => (order.rider_id ? ((await riderModel.findById(dbs.dispatch, order.rider_id))?.user_id ?? null) : null);

/**
 * Live hint that an order changed (utils/realtime.js): to its customer, its shop, its rider
 * and the operations room, each in their own portal. Reads the order again, so a rider
 * assigned a moment ago is included. Best effort and never awaited by the flow.
 */
export async function announceOrder(dbs, orderId, topic = 'order') {
  if (!realtime.active) return;
  try {
    const order = await orderModel.findById(dbs.ordering, orderId);
    if (!order) return;
    const [seller, rider] = await Promise.all([sellerUserOf(dbs, order), riderUserOf(dbs, order)]);
    realtime.publish([{ userId: order.customer_id, role: 'customer' }, { userId: seller, role: 'seller' }, { userId: rider, role: 'rider' }, 'ops'], topic, { orderId });
  } catch {
    // the apps still poll
  }
}

/** A rider with deliveries left stays BUSY; with none, back to ONLINE (never forced online from OFFLINE). */
export async function refreshRiderStatus(dbs, riderId) {
  if (!riderId) return;
  const rider = await riderModel.findById(dbs.dispatch, riderId);
  if (!rider || rider.status === 'OFFLINE') return;
  const active = await orderModel.listActiveForRider(dbs.ordering, riderId);
  const next = active.length ? 'BUSY' : 'ONLINE';
  if (rider.status !== next) {
    await riderModel.setStatus(dbs.dispatch, riderId, next);
    realtime.publish(['ops'], 'rider');
  }
}

/**
 * Cancel or reject before pickup: the order closes with a reason, its units go back on the
 * shelf, open offers close, and the customer (and the rider, if one was on the way) is told.
 */
export async function closeOrder(dbs, order, to, { role, actorId = null, reason, customerBody }) {
  const riderUser = await riderUserOf(dbs, order);
  const notify = [{ userId: order.customer_id, type: `order.${to.toLowerCase()}`, body: customerBody }];
  if (riderUser) notify.push({ userId: riderUser, type: 'delivery.cancelled', body: `Order #${order.id} was cancelled. You do not need to collect it.` });
  const done = await move(dbs, order, to, { role, actorId, set: { cancel_reason: reason, closed_at: new Date() }, notify });
  if (!done) return false;
  if (order.order_key) await stockHoldModel.returnToShelf(dbs.catalog, order.order_key);
  // credit spent on an order that will not arrive goes back to the customer
  if (order.credit_paise) await dbs.ordering('customer_credits').where({ used_order_id: order.id }).update({ used_order_id: null });
  await assignmentModel.expireOthers(dbs.dispatch, order.id);
  announceOffers(dbs, order.id);
  await refreshRiderStatus(dbs, order.rider_id);
  return true;
}

/** Live hint to every rider who was offered this order: their offer list changed. */
export async function announceOffers(dbs, orderId) {
  if (!realtime.active) return;
  try {
    const users = await dbs.dispatch('assignments').join('riders', 'riders.id', 'assignments.rider_id').where('assignments.order_id', orderId).distinct('riders.user_id');
    realtime.publish(users.map((u) => ({ userId: u.user_id, role: 'rider' })), 'offer', { orderId });
  } catch {
    // as above
  }
}

export const notifySeller = async (dbs, trx, order, type, body) => {
  const userId = await sellerUserOf(dbs, order);
  if (userId) await inbox(trx, { userId, orderId: order.id, type, body });
};

// ---------- what each side sees of an order

/**
 * The order as a page shows it (the demo mock answers the same shape). Times are epoch
 * milliseconds. No payload ever carries the delivery code; the seller never sees the drop
 * point, and the rider sees the full address only once the order is in their hands.
 */
export async function viewOrders(dbs, orders, viewer) {
  if (!orders.length) return [];
  const ids = orders.map((o) => o.id);
  const [items, events, sellers, riders, reviews] = await Promise.all([
    orderItemModel.listForOrders(dbs.ordering, ids),
    orderModel.eventsFor(dbs.ordering, ids),
    sellerModel.listByIds(dbs.catalog, [...new Set(orders.map((o) => o.seller_id))]),
    riderModel.listByIds(dbs.dispatch, [...new Set(orders.map((o) => o.rider_id).filter(Boolean))]),
    viewer === 'customer' ? dbs.ordering('order_reviews').whereIn('order_id', ids) : [],
  ]);
  const shop = new Map(sellers.map((s) => [s.id, s]));
  const rider = new Map(riders.map((r) => [r.id, r]));
  const review = new Map(reviews.map((r) => [r.order_id, r]));
  return orders.map((o) => {
    const s = shop.get(o.seller_id);
    const r = rider.get(o.rider_id);
    const v = {
      id: o.id,
      status: o.status,
      tempClass: o.temp_class,
      items: items.filter((i) => i.order_id === o.id).map((i) => ({ productId: i.product_id, title: i.title, unitPricePaise: i.unit_price_paise, qty: i.qty })),
      subtotalPaise: o.subtotal_paise,
      deliveryFeePaise: o.delivery_fee_paise,
      creditPaise: o.credit_paise ?? 0,
      totalPaise: o.total_paise,
      paymentMode: o.payment_mode,
      paymentStatus: o.payment_mode === 'COD' ? (o.collected_paise != null ? 'COD_COLLECTED' : 'COD_PENDING') : 'CAPTURED',
      placedAt: ms(o.placed_at),
      promisedAt: ms(o.promised_at),
      acceptedAt: ms(o.accepted_at),
      packedAt: ms(o.packed_at),
      pickedAt: ms(o.picked_at),
      arrivedAt: ms(o.arrived_at),
      deliveredAt: ms(o.delivered_at),
      promiseWindow: o.promise_lo_min != null ? [o.promise_lo_min, o.promise_hi_min] : null,
      cancelReason: o.cancel_reason,
      simulated: false,
      seller: s ? { id: s.id, shopName: s.shop_name, city: s.city, lat: Number(s.lat), lng: Number(s.lng) } : null,
      rider: r ? { id: r.id, name: r.name, vehicle: r.vehicle, rating: null } : null,
      events: events.filter((e) => e.order_id === o.id).map((e) => ({ id: e.id, orderId: o.id, from: e.from_status, to: e.to_status, role: e.actor_role, at: ms(e.at) })),
      otpRevealed: Boolean(o.otp_revealed_at),
      otpLocked: Boolean(o.otp_locked_at),
    };
    const detail = parseDetail(o.address_detail);
    const atTheDoor = ['PICKED_UP', 'ON_THE_WAY', 'ARRIVED', 'DELIVERED'].includes(o.status);
    if (viewer === 'customer') {
      v.addressText = o.address_text;
      v.addressDetail = detail;
      v.review = review.has(o.id) ? { rating: review.get(o.id).rating } : null;
    }
    if (viewer === 'rider') {
      // before pickup a rider sees the area only; the door, floor and instructions after
      v.addressText = atTheDoor ? o.address_text : areaOf(detail?.line ?? o.address_text);
      v.addressDetail = atTheDoor ? detail : null;
    }
    if (viewer !== 'seller') v.drop = { lat: Number(o.drop_lat), lng: Number(o.drop_lng) };
    if (viewer === 'seller' && o.collected_paise != null) v.collectedPaise = o.collected_paise;
    return v;
  });
}

export const viewOrder = async (dbs, order, viewer) => (await viewOrders(dbs, [order], viewer))[0];

/** The parts of the address an order keeps (orders.address_detail). */
export const addressDetail = (a) => ({ kind: a.kind ?? 'HOME', label: a.label, house: a.house ?? null, floor: a.floor ?? null, line: a.line, landmark: a.landmark ?? null, instructions: a.instructions ?? null });

const parseDetail = (d) => {
  if (!d) return null;
  if (typeof d === 'object') return d;
  try {
    return JSON.parse(d);
  } catch {
    return null;
  }
};

// before pickup a rider sees the area, not the door
const areaOf = (address) => address.split(',').slice(1).join(',').trim() || 'Address shown after pickup';

/** Where the rider is on the way to the door, as the server sees it (doc 10.4). */
export function trackState(order, { seller, rider, policy }) {
  const shop = { lat: Number(seller.lat), lng: Number(seller.lng) };
  const drop = { lat: Number(order.drop_lat), lng: Number(order.drop_lng) };
  const totalM = distanceM(shop, drop);
  const here = rider?.last_lat != null ? { lat: Number(rider.last_lat), lng: Number(rider.last_lng) } : null;
  let pos = null;
  let progress = 0;
  if (order.status === 'DELIVERED') {
    pos = drop;
    progress = 1;
  } else if (['PICKED_UP', 'ON_THE_WAY', 'ARRIVED'].includes(order.status)) {
    pos = here ?? shop;
    progress = order.status === 'ARRIVED' ? 1 : clamp(1 - distanceM(pos, drop) / Math.max(totalM, 1), 0, 1);
  } else if (WITH_RIDER.includes(order.status) && here) pos = here;
  const remainingM = pos ? distanceM(pos, drop) : totalM;
  const etaMin = Math.max(1, Math.ceil((((remainingM / 1000) * policy.roadFactor) / policy.speedKmph) * 60));
  return { stage: order.status, progress, distanceM: Math.round(remainingM), totalM: Math.round(totalM), etaMin, riderPos: pos, shop, drop };
}

/** The code for the customer's screen, only while it may be shown. */
export function codeForCustomer(env, order) {
  if (order.status === 'DELIVERED') throw new AppError(410, 'OTP_USED', 'The code stopped working after delivery');
  if (!order.otp_revealed_at || !['PICKED_UP', 'ON_THE_WAY', 'ARRIVED'].includes(order.status)) throw new AppError(403, 'OTP_LOCKED', 'Your code appears when the rider is about 500 m away');
  return deliveryCode(env, order.order_key);
}

/** Prep time the shop took beyond the class maximum, in whole minutes (doc 8.4a). */
export function sellerDelayMin(order, policy, packedAt = new Date()) {
  const prep = tempRules(policy, order.temp_class).prepMin[1] * 60_000;
  return Math.max(0, Math.round((packedAt.getTime() - new Date(order.accepted_at).getTime() - prep) / 60_000));
}
