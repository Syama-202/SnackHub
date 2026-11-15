/**
 * Whether a snack can be ordered right now, and if not, why and when it can (doc 12.1). The
 * API decides with this (listings, search, the cart and checkout); the app uses the same
 * labels. Times are the shop's own time zone.
 *
 * A snack is orderable only when its shop is listed and taking orders, the shop is open, the
 * snack's own serving window is open (breakfast, evening or night snacks; no window means all
 * of the shop's hours), the seller has not switched it off, and there is stock.
 */
import { DEFAULT_TZ, openIntervals, clockIn, dayWord, localDay } from './hours.js';

export const AVAILABILITY = Object.freeze({
  AVAILABLE: 'AVAILABLE', // order now
  LATER_TODAY: 'LATER_TODAY', // outside its serving time, back later today
  ANOTHER_DAY: 'ANOTHER_DAY', // back on another day (or not this week)
  TEMPORARILY_UNAVAILABLE: 'TEMPORARILY_UNAVAILABLE', // the seller switched it off for now
  OUT_OF_STOCK: 'OUT_OF_STOCK', // serving now, none left
  SHOP_CLOSED: 'SHOP_CLOSED', // the snack's time, but the shop is closed
  SHOP_UNAVAILABLE: 'SHOP_UNAVAILABLE', // the shop is paused, not approved, or not taking orders
});

// for sorting: what can be ordered first, then what is coming soonest
export const STATUS_ORDER = ['AVAILABLE', 'LATER_TODAY', 'SHOP_CLOSED', 'ANOTHER_DAY', 'OUT_OF_STOCK', 'TEMPORARILY_UNAVAILABLE', 'SHOP_UNAVAILABLE'];

const ALWAYS = null;

function containing(intervals, now) {
  return intervals === ALWAYS ? [now - 1, Infinity] : (intervals.find(([a, b]) => now >= a && now < b) ?? null);
}

/** The moments both lists are open (either may be ALWAYS), as [start, end) pairs. */
function both(a, b) {
  if (a === ALWAYS) return b;
  if (b === ALWAYS) return a;
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const from = Math.max(a[i][0], b[j][0]);
    const to = Math.min(a[i][1], b[j][1]);
    if (from < to) out.push([from, to]);
    if (a[i][1] < b[j][1]) i += 1;
    else j += 1;
  }
  return out;
}

/**
 * shop:    { listed, takesOrders, schedule, closedDates, tz }  (listed: approved and not paused;
 *          takesOrders: false for a shop that does not take orders on SnackHub)
 * product: { schedule, unavailable, unavailableUntil (ms or null), stock }
 * Returns  { status, orderable, nextAt, closesAt, label }: nextAt is when it can next be
 * ordered (null when not known or not within a week); closesAt when the current window ends.
 */
export function availabilityOf({ shop, product, now = Date.now() }) {
  const tz = shop.tz || DEFAULT_TZ;
  const result = (status, extra = {}) => {
    const r = { status, orderable: false, nextAt: null, closesAt: null, ...extra };
    return { ...r, label: availabilityLabel(r, now, tz) };
  };
  if (!shop.listed) return result(AVAILABILITY.SHOP_UNAVAILABLE);
  const until = product.unavailableUntil ?? null;
  if (product.unavailable && (until == null || until > now)) return result(AVAILABILITY.TEMPORARILY_UNAVAILABLE, { nextAt: until });

  const shopOpen = shop.schedule ? openIntervals(shop.schedule, { tz, closedDates: shop.closedDates, from: now }) : ALWAYS;
  const snackOpen = product.schedule ? openIntervals(product.schedule, { tz, from: now }) : ALWAYS;
  const together = both(shopOpen, snackOpen);
  const now2 = containing(together, now);
  if (now2) {
    if (Number(product.stock ?? 0) <= 0) return result(AVAILABILITY.OUT_OF_STOCK);
    return result(AVAILABILITY.AVAILABLE, { orderable: shop.takesOrders !== false, closesAt: Number.isFinite(now2[1]) ? now2[1] : null });
  }
  const next = together === ALWAYS ? null : (together.find(([a]) => a > now)?.[0] ?? null);
  // the snack's own time has come but the shop is shut: say so, not "later"
  if (containing(snackOpen, now) && !containing(shopOpen, now)) return result(AVAILABILITY.SHOP_CLOSED, { nextAt: next });
  const sameDay = next != null && localDay(next, tz).date === localDay(now, tz).date;
  return result(sameDay ? AVAILABILITY.LATER_TODAY : AVAILABILITY.ANOTHER_DAY, { nextAt: next });
}

/** A short, plain label: "Available now", "Available from 5:00 pm", "Available tomorrow 7:00 am". */
export function availabilityLabel({ status, nextAt }, now = Date.now(), tz = DEFAULT_TZ) {
  const when = nextAt ? `${dayWord(nextAt, now, tz) === 'today' ? '' : `${dayWord(nextAt, now, tz)} `}${clockIn(nextAt, tz)}` : null;
  switch (status) {
    case AVAILABILITY.AVAILABLE:
      return 'Available now';
    case AVAILABILITY.LATER_TODAY:
      return `Available from ${clockIn(nextAt, tz)}`;
    case AVAILABILITY.ANOTHER_DAY:
      return when ? `Available ${when}` : 'Not available this week';
    case AVAILABILITY.TEMPORARILY_UNAVAILABLE:
      return when ? `Back ${when}` : 'Temporarily unavailable';
    case AVAILABILITY.OUT_OF_STOCK:
      return 'Out of stock';
    case AVAILABILITY.SHOP_CLOSED:
      return when ? `Shop closed · opens ${when}` : 'Shop closed';
    default:
      return 'Not taking orders';
  }
}

/** Which part of the day a snack is served in, from its first window: for tags and filters. */
export function servingSlot(schedule) {
  const first = schedule && Object.values(schedule).flat().find(Boolean);
  if (!first) return 'allday';
  const start = Number(first[0].slice(0, 2));
  if (start < 11) return 'morning';
  if (start < 16) return 'afternoon';
  if (start < 20) return 'evening';
  return 'night';
}

export const SLOT_LABEL = { allday: 'All day', morning: 'Breakfast', afternoon: 'Afternoon', evening: 'Evening snack', night: 'Late night' };
