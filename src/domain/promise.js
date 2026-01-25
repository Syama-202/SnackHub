import { tempRules } from './policy';

/** A cart takes the strictest class of its items (doc 8.2). */
export function cartTempClass(items) {
  return items.some((i) => i.servingTemp === 'HOT') ? 'HOT' : 'AMBIENT';
}

/** ride_min = (straight_km x road factor) / speed x 60 (doc 8.3) */
export function rideMin(straightKm, policy) {
  return ((straightKm * policy.roadFactor) / policy.speedKmph) * 60;
}

/**
 * ETA = accept + max(prep, rider_to_seller) + ride + handover.
 * Serviceable only if ETA <= 30, ride within the class cap, and distance within range.
 */
export function deliveryPromise({ straightKm, temp, busyExtraMin = 0, riderToSellerMin = 4, sellerRadiusKm }, policy) {
  const rules = tempRules(policy, temp);
  const prep = rules.prepMin[1] + busyExtraMin;
  const ride = rideMin(straightKm, policy);
  const eta = policy.acceptMin + Math.max(prep, riderToSellerMin) + ride + policy.handoverMin;
  const maxKm = Math.min(rules.maxKm, sellerRadiusKm ?? rules.maxKm);
  const reasons = [];
  if (straightKm > maxKm) reasons.push(`Outside the ${maxKm} km range for ${temp === 'HOT' ? 'hot' : 'sweet and dry'} snacks`);
  if (ride > rules.maxRideMin) reasons.push(`Ride would take over ${rules.maxRideMin} min`);
  if (eta > policy.maxPromiseMin) reasons.push('Cannot reach you within 30 min right now');
  const etaMin = Math.ceil(eta);
  // The customer sees a window, never above 30 (doc 8.3).
  const hi = Math.min(policy.maxPromiseMin, Math.max(etaMin + 5, 25));
  const lo = Math.max(10, hi - 5);
  return { serviceable: reasons.length === 0, etaMin, window: [lo, hi], rideMin: ride, prepMin: prep, reasons };
}

export const PROMISE_WORDING =
  'Estimated delivery in 25 to 30 minutes, subject to serviceability and preparation time.';
