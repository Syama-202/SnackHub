/**
 * Simulated shop, rider and location feed for the demo (decision register:
 * "Simulated location feed for the demo, labelled as simulated").
 * Time is compressed so a whole order plays out in about two minutes.
 * All progress, distance, arrival and code-unlock decisions happen here,
 * on the "server", never in the page.
 */
import { distanceM, lerpPoint, clamp } from '../domain/geo';
import { computeEarning } from '../domain/penalty';
import { nextId } from './db';

const SEC = 1000;
export const SIM = { accept: 5, packing: 8, packed: 16, pickup: 20, onWay: 22, ride: 75, deliverAfterArrive: 30, offerTimeout: 20 };

export function addEvent(db, order, to, role) {
  db.orderEvents.push({ id: nextId(db, 'event'), orderId: order.id, from: order.status, to, role, at: Date.now() });
  order.status = to;
  order.updatedAt = Date.now();
}

export function notify(db, userId, orderId, type, body) {
  // unique (order_id, type, user_id) so retries never send twice (doc 10.6)
  if (db.notifications.some((n) => n.orderId === orderId && n.type === type && n.userId === userId)) return;
  db.notifications.unshift({ id: nextId(db, 'notification'), userId, orderId, type, body, readAt: null, createdAt: Date.now() });
}

function makeOtp(db, order) {
  const code = String(1000 + Math.floor(Math.random() * 9000));
  db.otpPlain[order.id] = code; // demo only, see db.js
  order.otpHashSet = true;
}

/** Rider matching score from doc 10.2: distance_m + 300 x active + 500 x declines. */
export function pickRider(db, order, exclude = []) {
  const seller = db.sellers.find((s) => s.id === order.sellerId);
  const cap = order.tempClass === 'HOT' ? 1 : 2;
  const radius = (order.tempClass === 'HOT' ? 3000 : 5000) + 1000;
  const cands = db.riders
    .filter((r) => r.cityId === seller.cityId && r.status !== 'OFFLINE' && !exclude.includes(r.id))
    .map((r) => {
      const active = db.orders.filter((o) => o.riderId === r.id && ['ACCEPTED', 'PACKING', 'PACKED', 'PICKED_UP', 'ON_THE_WAY', 'ARRIVED'].includes(o.status)).length;
      const declines = db.assignments.filter((a) => a.riderId === r.id && a.status === 'DECLINED').length;
      const d = distanceM(r, seller);
      return { r, active, score: d + 300 * active + 500 * declines, d };
    })
    .filter((c) => c.d <= radius && c.active < cap)
    .sort((a, b) => a.score - b.score);
  return cands[0]?.r ?? db.riders.find((r) => r.cityId === seller.cityId && r.status !== 'OFFLINE');
}

export function acceptOrder(db, order, role = 'seller') {
  addEvent(db, order, 'ACCEPTED', role);
  order.acceptedAt = Date.now();
  makeOtp(db, order);
  notify(db, order.customerId, order.id, 'order.accepted', 'The shop accepted your order');
  if (!order.simRider) {
    // offer to the demo rider (rider 1) with a 20 s timer
    db.assignments.push({ id: nextId(db, 'assignment'), orderId: order.id, riderId: 1, status: 'OFFERED', offeredAt: Date.now() });
  }
}

export function assignRider(db, order, rider) {
  order.riderId = rider.id;
  order.riderStart = { lat: rider.lat, lng: rider.lng };
  order.riderAssignedAt = Date.now();
}

/** Close any open rider offers once an order can no longer be delivered. */
export function closeOffers(db, order) {
  db.assignments.filter((a) => a.orderId === order.id && a.status === 'OFFERED').forEach((a) => {
    a.status = 'EXPIRED';
    a.respondedAt = Date.now();
  });
}

/** A captured payment on an order that will not be delivered is refunded automatically (doc 10.9). */
export function refundIfCaptured(db, order) {
  if (order.paymentStatus !== 'CAPTURED') return;
  order.paymentStatus = 'REFUND_PENDING';
  const p = db.payments.find((x) => x.orderId === order.id);
  if (p) p.status = 'REFUND_PENDING';
  notify(db, order.customerId, order.id, 'payment.refund', 'Your payment is being refunded to the original method.');
}

/** Cancel or reject an order: release the stock hold, close offers, refund if paid. */
export function closeOrder(db, order, to, role, reason) {
  addEvent(db, order, to, role);
  order.cancelReason = reason;
  releaseStock(db, order);
  closeOffers(db, order);
  refundIfCaptured(db, order);
}

/** The policy version the order was priced under; later changes never apply to it (doc 8.4a). */
export const policyFor = (db, order) => db.policyHistory.find((p) => p.version === order.policyVersion) || db.policy;

export function deliver(db, order, role = 'rider') {
  addEvent(db, order, 'DELIVERED', role);
  order.deliveredAt = Date.now();
  // A simulated rider collects the exact amount; a real one records it at the door
  if (order.paymentMode === 'COD' && order.paymentStatus !== 'COD_COLLECTED') {
    order.collectedPaise = order.totalPaise;
    order.paymentStatus = 'COD_COLLECTED';
  }
  notify(db, order.customerId, order.id, 'order.delivered', 'Delivered. Enjoy!');
  const seller = db.sellers.find((s) => s.id === order.sellerId);
  const km = distanceM(seller, order.drop) / 1000;
  const lateMin = (order.deliveredAt - order.promisedAt) / 60000;
  const sellerDelayMin = order.sellerDelayMin || 0;
  const e = computeEarning({ km, lateMin, sellerDelayMin }, policyFor(db, order));
  db.earnings.push({ id: nextId(db, 'earning'), orderId: order.id, riderId: order.riderId, status: 'OK', createdAt: Date.now(), ...e });
  delete db.otpPlain[order.id];
}

/** Server-side position, progress and stage for one order. */
export function trackState(db, order) {
  const seller = db.sellers.find((s) => s.id === order.sellerId);
  const totalM = distanceM(seller, order.drop);
  let pos = order.riderPos;
  let progress = 0;
  if (['PICKED_UP', 'ON_THE_WAY', 'ARRIVED', 'DELIVERED'].includes(order.status)) {
    pos = pos || { lat: seller.lat, lng: seller.lng };
    const remaining = distanceM(pos, order.drop);
    progress = clamp(1 - remaining / totalM, 0, 1);
    if (['ARRIVED', 'DELIVERED'].includes(order.status)) progress = 1;
  } else if (order.riderId && order.riderStart) {
    pos = pos || order.riderStart;
  }
  const remainingM = pos ? Math.max(0, distanceM(pos, order.drop)) : totalM;
  const road = (remainingM / 1000) * db.policy.roadFactor;
  const etaMin = Math.max(1, Math.ceil((road / db.policy.speedKmph) * 60));
  return { stage: order.status, progress, distanceM: Math.round(remainingM), totalM: Math.round(totalM), etaMin, riderPos: pos || null, shop: { lat: seller.lat, lng: seller.lng }, drop: order.drop };
}

/** Run every request: advance simulated orders and expire offers. */
export function tick(db) {
  const now = Date.now();
  for (const o of db.orders) {
    // Unpaid orders hold stock for the 10 minute payment window, then release it (doc 10.9)
    if (o.status === 'PENDING_PAYMENT') {
      if (o.holdExpiresAt && now > o.holdExpiresAt) {
        closeOrder(db, o, 'CANCELLED', 'system', 'Payment was not completed within 10 minutes');
        o.paymentStatus = 'EXPIRED';
        const p = db.payments.find((x) => x.orderId === o.id);
        if (p && p.status === 'CREATED') p.status = 'EXPIRED';
      }
      continue;
    }
    if (['DELIVERED', 'CANCELLED', 'REJECTED'].includes(o.status)) continue;
    const t = (now - o.placedAt) / SEC;

    // Seller auto-cancel after 2 minutes without acceptance (doc 10.1)
    if (o.status === 'PLACED' && !o.simSeller && now - o.placedAt > db.policy.sellerAcceptTimeoutSec * SEC) {
      closeOrder(db, o, 'CANCELLED', 'system', 'The shop did not accept in 2 minutes');
      notify(db, o.customerId, o.id, 'order.cancelled', o.paymentMode === 'ONLINE' ? 'The shop did not respond, so your order was cancelled and your payment is being refunded.' : 'The shop did not respond, so your order was cancelled. You were not charged.');
      continue;
    }

    if (o.simSeller) {
      if (o.status === 'PLACED' && t >= SIM.accept) acceptOrder(db, o, 'seller');
      if (o.status === 'ACCEPTED' && t >= SIM.packing) addEvent(db, o, 'PACKING', 'system');
      if (o.status === 'PACKING' && t >= SIM.packed) {
        addEvent(db, o, 'PACKED', 'seller');
        o.packedAt = now;
        notify(db, o.customerId, o.id, 'order.packed', 'Your snacks are packed');
      }
    }

    // Offers to the demo rider expire after 20 s and move to the next rider
    for (const a of db.assignments.filter((x) => x.orderId === o.id && x.status === 'OFFERED')) {
      if (now - a.offeredAt > SIM.offerTimeout * SEC) {
        a.status = 'EXPIRED';
        a.respondedAt = now;
        o.simRider = true;
      }
    }

    if (o.simRider) {
      if (!o.riderId && ['ACCEPTED', 'PACKING', 'PACKED'].includes(o.status)) {
        const r = pickRider(db, o, [1]);
        if (r) assignRider(db, o, r);
      }
      const seller = db.sellers.find((s) => s.id === o.sellerId);
      if (o.riderId && ['ACCEPTED', 'PACKING', 'PACKED'].includes(o.status) && o.riderStart) {
        const k = clamp((now - o.riderAssignedAt) / ((SIM.pickup - SIM.accept) * SEC), 0, 1);
        o.riderPos = lerpPoint(o.riderStart, seller, k);
      }
      if (o.status === 'PACKED' && t >= SIM.pickup && o.riderId) {
        addEvent(db, o, 'PICKED_UP', 'rider');
        o.pickedAt = now;
        o.pickupSealed = true;
        o.riderPos = { lat: seller.lat, lng: seller.lng };
      }
      if (o.status === 'PICKED_UP' && t >= SIM.onWay) {
        addEvent(db, o, 'ON_THE_WAY', 'system');
        o.rideStartedAt = now;
        notify(db, o.customerId, o.id, 'order.picked_up', 'Your rider is on the way');
      }
      if (o.status === 'ON_THE_WAY') {
        const k = clamp((now - o.rideStartedAt) / (SIM.ride * SEC), 0, 1);
        const eased = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        o.riderPos = lerpPoint(seller, o.drop, eased);
      }
    }

    // Geofence and code unlock: decided here, from the server's distance
    if (['ON_THE_WAY', 'PICKED_UP'].includes(o.status) && o.riderPos) {
      const d = distanceM(o.riderPos, o.drop);
      if (d <= db.policy.otpRevealM && !o.otpRevealed) {
        o.otpRevealed = true;
        o.otpRevealedAt = now;
        // the notification never contains the code (doc 10.3)
        notify(db, o.customerId, o.id, 'rider.nearby', 'Your rider is nearby. Your delivery code is now available.');
      }
      if (o.status === 'ON_THE_WAY' && d <= db.policy.arrivalGeofenceM) {
        addEvent(db, o, 'ARRIVED', 'system');
        o.arrivedAt = now;
        notify(db, o.customerId, o.id, 'order.arrived', 'Your rider has reached. Share your code at the door');
      }
    }
    if (o.status === 'ARRIVED' && o.simRider && now - o.arrivedAt > SIM.deliverAfterArrive * SEC) deliver(db, o, 'rider');
  }
}

export function releaseStock(db, order) {
  if (order.stockReleased) return;
  for (const it of order.items) {
    const p = db.products.find((x) => x.id === it.productId);
    if (p) p.stock += it.qty;
  }
  order.stockReleased = true;
}
