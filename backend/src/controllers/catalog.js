// Catalog for customers (doc 11.2): cities, the shops that can deliver to a point, a shop's
// menu, the products near a point and search. Everything is read from PostgreSQL; the delivery
// promise comes from the shared rules with the current delivery_policy.
import { AppError } from '../utils/AppError.js';
import { sellerModel, VISIBLE_STATUSES, hoursOf, shopOpenState } from '../models/catalog/seller.js';
import { hoursLabel, pincodeServed } from '../../../shared/domain/hours.js';
import { productModel } from '../models/catalog/product.js';
import { deliveryPolicyModel } from '../models/ordering/deliveryPolicy.js';
import { deliveryPromise } from '../../../shared/domain/promise.js';
import { distanceM } from '../../../shared/domain/geo.js';
import { rankSearch, searchTerm } from '../../../shared/domain/search.js';
import { DEFAULT_POLICY } from '../../../shared/domain/policy.js';
import { CITIES } from '../../../shared/domain/cities.js';

const today = () => new Date().toISOString().slice(0, 10);
const avg = (xs) => (xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : null);
const dateOnly = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

export function productView(row, seller) {
  const a = row.attrs || {};
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
  };
}

// what a customer may see of a shop: no owner, licence number or exact status
export function sellerView(row, products = []) {
  return {
    id: row.id,
    shopName: row.shop_name,
    // shop, stall (a street cart or kadai) or home (a home kitchen)
    kind: row.kind ?? 'shop',
    city: row.city,
    region: row.region,
    lat: Number(row.lat),
    lng: Number(row.lng),
    rating: avg(products.map((p) => p.rating).filter((r) => r != null)),
    verified: Boolean(row.verified_at),
    isNew: row.status === 'probation',
    busyExtraMin: row.busy_extra_min,
    qualityScore: row.quality_score == null ? null : Number(row.quality_score),
    licenceValid: !row.licence_expires_on || dateOnly(row.licence_expires_on) >= today(),
    // a seeded demo shop shows how SnackHub works but takes no real orders
    demo: Boolean(row.is_demo),
    hours: hoursView(row),
  };
}

/** Open now or not, a label in India time, and the week, for the shop page. */
export function hoursView(row, now = Date.now()) {
  const st = shopOpenState(row, now);
  const h = hoursOf(row);
  return { openNow: st.open, label: hoursLabel(st, now), opensAt: st.opensAt, closesAt: st.closesAt, week: h.schedule, closedDates: h.closedDates, byPincode: h.pincodes.length > 0 };
}

export function catalogController({ dbs }) {
  const policy = async () => (await deliveryPolicyModel.current(dbs.ordering))?.config ?? DEFAULT_POLICY;

  const promiseFor = (pol, row, point, temp) => {
    const km = distanceM({ lat: Number(row.lat), lng: Number(row.lng) }, point) / 1000;
    const promise = { ...deliveryPromise({ straightKm: km, temp, busyExtraMin: row.busy_extra_min, sellerRadiusKm: Number(row.radius_km) }, pol), distanceKm: +km.toFixed(2) };
    // a shop that lists its pincodes delivers only there; an unknown pincode is judged at checkout
    if (point.pincode && !pincodeServed(hoursOf(row).pincodes, point.pincode)) return { ...promise, serviceable: false, reasons: [`This shop does not deliver to pincode ${point.pincode}`, ...promise.reasons] };
    return promise;
  };

  /**
   * Shops near a point with their products, each with a HOT and AMBIENT promise, open shops
   * first and nearest first. Closed shops stay in the list (marked, with when they open);
   * their snacks are left out of product lists and search, since they cannot be ordered.
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
    res.json(CITIES);
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

  const orderable = (shops) =>
    shops.filter((s) => s.hours.openNow).flatMap((s) =>
      s.products
        .map((p) => {
          const pr = s.promise[p.servingTemp];
          return { ...p, shopName: s.shopName, shopKind: s.kind, serviceable: Boolean(pr?.serviceable), window: pr?.window, distanceKm: s.distanceKm };
        })
        .filter((p) => p.serviceable),
    );

  async function products(req, res) {
    const { lat, lng, pincode } = req.query;
    res.json(orderable(await nearby({ lat, lng, pincode })).sort((a, b) => a.id - b.id));
  }

  /** One catalogue snack at every open shop that delivers here, cheapest first. */
  async function offers(req, res) {
    const { lat, lng, pincode } = req.query;
    const itemId = req.params.id;
    const list = orderable(await nearby({ lat, lng, pincode })).filter((p) => p.catalogItemId === itemId && p.stock > 0);
    res.json(list.sort((a, b) => a.pricePaise - b.pricePaise || a.distanceKm - b.distanceKm));
  }

  async function search(req, res) {
    const { q, lat, lng, pincode } = req.query;
    const shops = (await nearby({ lat, lng, pincode })).filter((s) => s.hours.openNow);
    const shopName = new Map(shops.map((s) => [s.id, s.shopName]));
    const results = rankSearch(shops.flatMap((s) => s.products), searchTerm(q)).map((p) => ({
      id: p.id, slug: p.slug, title: p.title, sellerId: p.sellerId, shopName: shopName.get(p.sellerId), pricePaise: p.pricePaise, art: p.art, servingTemp: p.servingTemp,
    }));
    res.json({ q: q.toLowerCase(), results, provider: 'mysql' });
  }

  return { cities, sellers, seller, products, offers, search };
}
