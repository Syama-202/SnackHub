// Snack availability from database rows (doc 12.1): the shared rule in
// shared/domain/availability.js, fed with a product row (with qty, its units on hand) and its
// shop's row. Every listing, search result, cart line and checkout uses this, so the customer,
// seller and rider sides never disagree about what can be ordered.
import { AppError } from './AppError.js';
import { availabilityOf, AVAILABILITY, servingSlot } from '../../../shared/domain/availability.js';
import { hoursOf, isListed, closedReason } from '../models/catalog/seller.js';

const json = (v) => (v == null ? null : typeof v === 'string' ? JSON.parse(v) : v);
const ms = (d) => (d == null ? null : new Date(d).getTime());

/** { status, orderable, nextAt, closesAt, label } for one product row of one shop row. */
export function snackAvailability(product, seller, now = Date.now()) {
  if (!seller) return availabilityOf({ shop: { listed: false }, product: {}, now });
  const h = hoursOf(seller);
  return availabilityOf({
    shop: { listed: isListed(seller) && Boolean(product.active), takesOrders: !seller.is_demo, schedule: h.schedule, closedDates: h.closedDates, tz: h.tz },
    product: { schedule: json(product.available_hours), unavailable: Boolean(product.unavailable), unavailableUntil: ms(product.unavailable_until), stock: Number(product.qty ?? 0) },
    now,
  });
}

/** The time of day the snack is served in ('morning', 'evening', ...), for tags and filters. */
export const slotOf = (product) => servingSlot(json(product.available_hours));

/**
 * Throws the reason a snack cannot be ordered now, worded for the customer; returns quietly
 * when it can. qty: the units asked for (stock is checked again when it is reserved).
 */
export function assertOrderable(product, seller, { qty = 1, now = Date.now() } = {}) {
  if (!seller) throw new AppError(404, 'NOT_FOUND', 'This shop is not on SnackHub any more');
  const a = snackAvailability(product, seller, now);
  const details = { productId: product.id, title: product.title, status: a.status, nextAt: a.nextAt, label: a.label };
  switch (a.status) {
    case AVAILABILITY.SHOP_UNAVAILABLE:
      throw new AppError(409, 'SHOP_UNAVAILABLE', 'This shop is not taking orders right now', details);
    case AVAILABILITY.SHOP_CLOSED:
      throw new AppError(409, 'SHOP_UNAVAILABLE', closedReason(seller, now) ?? `${seller.shop_name} is closed now`, details);
    case AVAILABILITY.TEMPORARILY_UNAVAILABLE:
      throw new AppError(409, 'TEMPORARILY_UNAVAILABLE', `${product.title} is taking a short break. ${a.label}.`, details);
    case AVAILABILITY.LATER_TODAY:
    case AVAILABILITY.ANOTHER_DAY:
      throw new AppError(409, 'NOT_AVAILABLE_NOW', a.nextAt ? `Craving this already? ${product.title} is ${a.label.charAt(0).toLowerCase()}${a.label.slice(1)}.` : `${product.title} is not served this week.`, details);
    case AVAILABILITY.OUT_OF_STOCK:
      throw new AppError(409, 'OUT_OF_STOCK', `${product.title} is flying off the shelves: none left right now. Check back soon.`, { ...details, available: 0 });
    default:
  }
  // listed and in its serving time, but the shop does not take orders on SnackHub
  if (!a.orderable) throw new AppError(409, 'NOT_TAKING_ORDERS', `${seller.shop_name} isn't taking orders on SnackHub yet.`, details);
  if (qty > Number(product.qty ?? 0)) throw new AppError(409, 'OUT_OF_STOCK', `Only ${Number(product.qty ?? 0)} ${product.title} left`, { ...details, available: Number(product.qty ?? 0) });
}
