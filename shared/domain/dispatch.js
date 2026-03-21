/**
 * Matching a packed or packing order to a rider (doc 10.2). One rule set for the API and
 * the demo mock: the score is the distance to the shop plus 300 m for each delivery the
 * rider is already on and 500 m for each offer they declined today, lowest first.
 */
import { distanceM } from './geo.js';
import { tempRules } from './policy.js';

// a rider who has not sent a position for this long is not offered anything
export const STALE_POSITION_MS = 5 * 60_000;
// faster than about 120 km/h between two pings is a spoofed or broken position (doc 16.2)
export const MAX_SPEED_MPS = 34;
// pings closer together than this are accepted but not stored on the trail
export const TRAIL_MIN_INTERVAL_MS = 3_000;

/** How far from the shop a rider may be: the class range plus a kilometre to ride in. */
export const pickupRadiusM = (policy, temp) => tempRules(policy, temp).maxKm * 1000 + 1000;

/** How many deliveries a rider may carry at once for this class (hot food goes alone). */
export const riderCapFor = (policy, temp) => tempRules(policy, temp).riderCap;

export function rankRiders(riders, shop, { policy, temp, activeById = new Map(), declinesById = new Map(), exclude = [], now = Date.now() }) {
  const radius = pickupRadiusM(policy, temp);
  return riders
    .filter((r) => !exclude.includes(r.id) && r.lat != null && r.lastSeenAt && now - r.lastSeenAt <= STALE_POSITION_MS)
    .map((r) => {
      const d = distanceM(r, shop);
      const active = activeById.get(r.id) ?? 0;
      return { rider: r, distanceM: d, active, score: d + 300 * active + 500 * (declinesById.get(r.id) ?? 0) };
    })
    .filter((c) => c.distanceM <= radius && c.active < riderCapFor(policy, temp))
    .sort((a, b) => a.score - b.score);
}

/** Metres per second between two pings; Infinity for two pings in the same millisecond far apart. */
export function speedMps(from, to, ms) {
  const d = distanceM(from, to);
  if (ms <= 0) return d > 5 ? Infinity : 0;
  return d / (ms / 1000);
}
