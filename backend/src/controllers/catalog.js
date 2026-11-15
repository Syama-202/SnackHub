// Catalog for customers (doc 11.2): cities, the shops that can deliver to a point, a shop's
// menu, the products near a point and search. Everything is read from PostgreSQL; the delivery
// promise comes from the shared rules with the current delivery_policy.
import { AppError } from '../utils/AppError.js';
import { sellerModel, VISIBLE_STATUSES, hoursOf, shopOpenState } from '../models/catalog/seller.js';
import { hoursLabel, pincodeServed } from '../../../shared/domain/hours.js';
import { productModel } from '../models/catalog/product.js';
import { cityModel } from '../models/catalog/city.js';
import { deliveryPolicyModel } from '../models/ordering/deliveryPolicy.js';
import { deliveryPromise } from '../../../shared/domain/promise.js';
import { distanceM } from '../../../shared/domain/geo.js';
import { DEFAULT_POLICY } from '../../../shared/domain/policy.js';
import { snackAvailability, slotOf } from '../utils/availability.js';
import { STATUS_ORDER } from '../../../shared/domain/availability.js';

const today = () => new Date().toISOString().slice(0, 10);
const avg = (xs) => (xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : null);
const dateOnly = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

export function productView(row, seller, now = Date.now()) {
  const a = row.attrs || {};
  const json = (v) => (v == null ? null : typeof v === 'string' ? JSON.parse(v) : v);
  return {
    id: row.id,
    sellerId: row.seller_id,
    // the shared catalogue entry, or null for the shop's own recipe
    catalogItemId: row.catalog_item_id == null ? null : Number(row.catalog_item_id),
    slug: row.slug,
    title: row.title,
    description: row.description,
    category: row.category,
    region: row.region,
    city: seller?.city,
    servingTemp: row.serving_temp,
    prepMinutes: row.prep_minutes,
    pricePaise: row.price_paise,
    mrpPaise: row.mrp_paise,
    weight: a.weight,
    spice: a.spice ?? 0,
    rating: a.demoRating ?? null,
    ratingCount: a.demoRatingCount ?? 0,
    stock: Number(row.qty ?? 0),
    active: Boolean(row.active),
    bestseller: Boolean(a.bestseller),
    trending: Boolean(a.trending),
    tags: a.tags ?? [],
    collections: a.collections ?? [],
    art: a.art ?? null,
    imageAlt: a.imageAlt ?? row.title,
    attrs: { allergens: a.allergens ?? [], vegetarian: a.vegetarian ?? true },
    // when it is served (null: all of the shop's hours) and whether it can be ordered now
    availableHours: json(row.available_hours),
    servingSlot: slotOf(row),
    unavailable: Boolean(row.unavailable),
    unavailableUntil: row.unavailable_until ? new Date(row.unavailable_until).getTime() : null,
    availability: snackAvailability(row, seller, now),
  };
}

/** Orderable first, then what comes back soonest, then the rest. */
export const byAvailability = (a, b) =>
  STATUS_ORDER.indexOf(a.availability.status) - STATUS_ORDER.indexOf(b.availability.status) || (a.availability.nextAt ?? Infinity) - (b.availability.nextAt ?? Infinity);

// what a customer may see of a shop: no owner, licence number or exact status
export function sellerView(row, products = []) {
  return {
    id: row.id,
    shopName: row.shop_name,
    // shop, stall (a street cart or kadai) or home (a home kitchen)
    kind: row.kind ?? 'shop',
    city: row.city,
    region: row.region,
    locality: row.locality ?? null,
    addressLine: row.address_line ?? null,
    lat: Number(row.lat),
    lng: Number(row.lng),
    rating: avg(products.map((p) => p.rating).filter((r) => r != null)),
    verified: Boolean(row.verified_at),
    isNew: row.status === 'probation',
    busyExtraMin: row.busy_extra_min,
    qualityScore: row.quality_score == null ? null : Number(row.quality_score),
    licenceValid: !row.licence_expires_on || dateOnly(row.licence_expires_on) >= today(),
    // false for a shop that does not take orders on SnackHub
    takesOrders: !row.is_demo,
    hours: hoursView(row),
  };
}

/** Open now or not, a label in India time, and the week, for the shop page. */
export function hoursView(row, now = Date.now()) {
  const h = hoursOf(row);
  const st = shopOpenState(row, now);
  return { openNow: st.open, label: hoursLabel(st, now, h.tz), timezone: h.tz, opensAt: st.opensAt, closesAt: st.closesAt, week: h.schedule, closedDates: h.closedDates, byPincode: h.pincodes.length > 0 };
}

// the snacks that reach a point, kept a few seconds for search and autocomplete while typing
const NEAR_CACHE_MS = 10_000;
const NEAR_CACHE_MAX = 300;

export function catalogController({ dbs, geocoder, search: searchService }) {
  const nearCache = new Map();
  const policy = async () => (await deliveryPolicyModel.current(dbs.ordering))?.config ?? DEFAULT_POLICY;

  const promiseFor = (pol, row, point, temp) => {
    const km = distanceM({ lat: Number(row.lat), lng: Number(row.lng) }, point) / 1000;
    const promise = { ...deliveryPromise({ straightKm: km, temp, busyExtraMin: row.busy_extra_min, sellerRadiusKm: Number(row.radius_km) }, pol), distanceKm: +km.toFixed(2) };
    // a shop that lists its pincodes delivers only there; an unknown pincode is judged at checkout
    if (point.pincode && !pincodeServed(hoursOf(row).pincodes, point.pincode)) return { ...promise, serviceable: false, reasons: [`This shop does not deliver to pincode ${point.pincode}`, ...promise.reasons] };
    return promise;
  };

  /**
   * Shops that can deliver to a point, with their products, each with a HOT and AMBIENT
   * promise, open shops first and nearest first. Closed shops stay in the list (marked, with
   * when they open), and every snack carries its availability, so a snack that is out of its
   * serving time or out of stock is still found, with when it can be ordered.
   */
  async function nearby(point, temp) {
    const pol = await policy();
    const rows = await sellerModel.listServiceable(dbs.catalog, { ...point, maxKm: Math.max(pol.hot.maxKm, pol.ambient.maxKm) });
    const products = rows.length ? await productModel.listActiveForSellers(dbs.catalog, rows.map((r) => r.id)) : [];
    return rows
      .map((row) => {
        const own = products.filter((p) => p.seller_id === row.id).map((p) => productView(p, row));
        const hot = own.some((p) => p.servingTemp === 'HOT') ? promiseFor(pol, row, point, 'HOT') : null;
        const ambient = promiseFor(pol, row, point, 'AMBIENT');
        return { ...sellerView(row, own), promise: { HOT: hot, AMBIENT: ambient }, distanceKm: ambient.distanceKm, products: own };
      })
      .filter((s) => (temp === 'HOT' ? s.promise.HOT?.serviceable : s.promise.AMBIENT.serviceable || s.promise.HOT?.serviceable))
      .sort((a, b) => Number(b.hours.openNow) - Number(a.hours.openNow));
  }

  async function cities(req, res) {
    res.json(await cityModel.listActive(dbs.catalog));
  }

  /**
   * Where a position is, for SnackHub (doc 12.2): the supported city whose area holds it, the
   * nearest one, how many shops deliver there, and the street and pincode when place lookup is
   * set up. status: SERVED (a shop delivers here), OUT_OF_ZONE (a city we serve, but no shop
   * reaches this spot) or UNSUPPORTED_CITY. Whether a spot is served is always the shops' own
   * ranges, never the city alone.
   */
  async function locate(req, res) {
    const { lat, lng, pincode } = req.query;
    const point = { lat, lng, pincode };
    const shops = await nearby(point);
    res.set('Cache-Control', 'no-store').json(await whereIs(point, shops));
  }

  /** The locate answer for a point and the shops that reach it. */
  async function whereIs(point, shops) {
    const [cityRows, address] = await Promise.all([cityModel.listActive(dbs.catalog), geocoder?.enabled ? geocoder.reverse(point).catch(() => null) : null]);
    const near = cityRows.map((c) => ({ ...c, km: distanceM(c, point) / 1000 })).sort((a, b) => a.km - b.km);
    const nearest = near[0] ?? null;
    const inCity = nearest && nearest.km <= nearest.radiusKm ? nearest : null;
    const status = shops.length ? 'SERVED' : inCity ? 'OUT_OF_ZONE' : 'UNSUPPORTED_CITY';
    return {
      status,
      city: inCity ? { id: inCity.id, name: inCity.name, state: inCity.state } : null,
      nearestCity: nearest ? { id: nearest.id, name: nearest.name, state: nearest.state, distanceKm: +nearest.km.toFixed(1) } : null,
      // what the place lookup knows about the spot (null when it is not set up)
      address: address ? { line: address.line, locality: address.locality, city: inCity?.name ?? address.city ?? null, state: address.state, pincode: address.postcode } : null,
      shops: shops.length,
      openShops: shops.filter((s) => s.hours.openNow).length,
    };
  }

  async function sellers(req, res) {
    const { lat, lng, temp, pincode } = req.query;
    res.json((await nearby({ lat, lng, pincode }, temp)).map(({ products, ...s }) => s));
  }

  async function seller(req, res) {
    const { lat, lng, pincode } = req.query;
    const row = await sellerModel.findById(dbs.catalog, req.params.id);
    if (!row || !VISIBLE_STATUSES.includes(row.status) || row.paused) throw new AppError(404, 'NOT_FOUND', 'Shop not found');
    const products = (await productModel.listActiveForSellers(dbs.catalog, [row.id])).map((p) => productView(p, row));
    let promise = null;
    if (lat != null && lng != null) {
      const pol = await policy();
      promise = { HOT: promiseFor(pol, row, { lat, lng, pincode }, 'HOT'), AMBIENT: promiseFor(pol, row, { lat, lng, pincode }, 'AMBIENT') };
    }
    res.json({ ...sellerView(row, products), promise, products });
  }

  /** The snacks of shops that deliver this snack's temperature class here, with their availability. */
  const deliverable = (shops) =>
    shops.flatMap((s) =>
      s.products
        .map((p) => {
          const pr = s.promise[p.servingTemp];
          return { ...p, shopName: s.shopName, shopKind: s.kind, serviceable: Boolean(pr?.serviceable), window: pr?.window, distanceKm: s.distanceKm, timezone: s.hours.timezone };
        })
        .filter((p) => p.serviceable),
    );

  /** nearby() for search and autocomplete: the same point within 10 seconds is not worked out again. */
  async function nearbyCached(point) {
    const key = `${Number(point.lat).toFixed(4)},${Number(point.lng).toFixed(4)},${point.pincode ?? ''}`;
    const hit = nearCache.get(key);
    if (hit && Date.now() - hit.at < NEAR_CACHE_MS) return hit.shops;
    const shops = await nearby(point);
    nearCache.set(key, { at: Date.now(), shops });
    if (nearCache.size > NEAR_CACHE_MAX) nearCache.delete(nearCache.keys().next().value);
    return shops;
  }

  async function products(req, res) {
    const { lat, lng, pincode } = req.query;
    res.json(deliverable(await nearby({ lat, lng, pincode })).sort((a, b) => a.id - b.id));
  }

  /** One catalogue snack at every shop that delivers here: orderable and cheapest first. */
  async function offers(req, res) {
    const { lat, lng, pincode } = req.query;
    const itemId = req.params.id;
    const list = deliverable(await nearby({ lat, lng, pincode })).filter((p) => p.catalogItemId === itemId);
    res.json(list.sort((a, b) => byAvailability(a, b) || a.pricePaise - b.pricePaise || a.distanceKm - b.distanceKm));
  }

  /**
   * Snacks that match, among those that can reach the point: each with its availability (so
   * pani puri at 11 am is found, with when it is served), filters, sorting and pages. Where no
   * shop delivers, no results from elsewhere: the answer says where the point is instead.
   */
  async function search(req, res) {
    const { q, lat, lng, pincode, sort, page, pageSize, ...filters } = req.query;
    const point = { lat, lng, pincode };
    const shops = await nearbyCached(point);
    if (!shops.length) {
      const where = await whereIs(point, shops);
      return res.json({ q: q.toLowerCase(), provider: null, total: 0, page, pageSize, pages: 1, results: [], location: where });
    }
    const out = await searchService.search({ q, point, products: deliverable(shops), filters, sort, page, pageSize });
    res.json({ q: q.toLowerCase(), ...out, location: { status: 'SERVED', shops: shops.length, openShops: shops.filter((s) => s.hours.openNow).length } });
  }

  /** Autocomplete: names of snacks and shops that reach the point. */
  async function suggest(req, res) {
    const { q, lat, lng, pincode } = req.query;
    const point = { lat, lng, pincode };
    const shops = await nearbyCached(point);
    if (!shops.length) return res.json({ q: q.toLowerCase(), suggestions: [] });
    res.set('Cache-Control', 'private, max-age=30').json({ q: q.toLowerCase(), ...(await searchService.suggest({ q, point, products: deliverable(shops) })) });
  }

  return { cities, locate, sellers, seller, products, offers, search, suggest };
}
