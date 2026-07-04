/**
 * A rider who holds an order sends their position every few seconds. One who has sent nothing
 * for several minutes may have a dead phone, no signal or an accident, so staff are told and
 * can call the rider or the customer. At the door (ARRIVED) the rider is with the customer and
 * the app may be in a pocket, so that state does not count.
 */
export const RIDER_SILENT_MIN = 5;
export const RIDER_EXPECTED_STATES = ['ACCEPTED', 'PACKING', 'PACKED', 'PICKED_UP', 'ON_THE_WAY'];

/** Whether the rider on an order has been silent too long. lastSeenAt and now are in ms. */
export function riderSilent({ status, hasRider, lastSeenAt, now = Date.now() }) {
  if (!hasRider || !RIDER_EXPECTED_STATES.includes(status)) return false;
  return lastSeenAt == null || now - lastSeenAt > RIDER_SILENT_MIN * 60_000;
}
