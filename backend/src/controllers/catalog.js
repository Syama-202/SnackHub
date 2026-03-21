// Catalog for customers (doc 11.2): cities, the shops that can deliver to a point, a shop's
// menu, the products near a point and search. Everything is read from MySQL; the delivery
// promise comes from the shared rules with the current delivery_policy.
import { AppError } from '../utils/AppError.js';
import { sellerModel, VISIBLE_STATUSES } from '../models/catalog/seller.js';
import { productModel } from '../models/catalog/product.js';
import { deliveryPolicyModel } from '../models/ordering/deliveryPolicy.js';
import { deliveryPromise } from '../../../shared/domain/promise.js';
import { distanceM } from '../../../shared/domain/geo.js';
import { rankSearch, searchTerm } from '../../../shared/domain/search.js';
import { DEFAULT_POLICY } from '../../../shared/domain/policy.js';
import { CITIES } from '../../../shared/seed/seed.js';

const today = () => new Date().toISOString().slice(0, 10);
const avg = (xs) => (xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : null);
const dateOnly = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

export function productView(row, seller) {
  const a = row.attrs || {};
  return {
    id: row.id,
    sellerId: row.seller_id,
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
  };
}

export function catalogController({ dbs }) {
  const policy = async () => (await deliveryPolicyModel.current(dbs.ordering))?.config ?? DEFAULT_POLICY;

  const promiseFor = (pol, row, point, temp) => {
    const km = distanceM({ lat: Number(row.lat), lng: Number(row.lng) }, point) / 1000;
    return { ...deliveryPromise({ straightKm: km, temp, busyExtraMin: row.busy_extra_min, sellerRadiusKm: Number(row.radius_km) }, pol), distanceKm: +km.toFixed(2) };
  };

  /** Shops near a point with their products, each with a HOT and AMBIENT promise, nearest first. */
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
      .filter((s) => (temp === 'HOT' ? s.promise.HOT?.serviceable : s.promise.AMBIENT.serviceable || s.promise.HOT?.serviceable));
  }

  async function cities(req, res) {
    res.json(CITIES);
  }

  async function sellers(req, res) {
    const { lat, lng, temp } = req.query;
    res.json((await nearby({ lat, lng }, temp)).map(({ products, ...s }) => s));
  }

  async function seller(req, res) {
    const { lat, lng } = req.query;
    const row = await sellerModel.findById(dbs.catalog, req.params.id);
    if (!row || !VISIBLE_STATUSES.includes(row.status) || row.paused) throw new AppError(404, 'NOT_FOUND', 'Shop not found');
    const products = (await productModel.listActiveForSellers(dbs.catalog, [row.id])).map((p) => productView(p, row));
    let promise = null;
    if (lat != null && lng != null) {
      const pol = await policy();
      promise = { HOT: promiseFor(pol, row, { lat, lng }, 'HOT'), AMBIENT: promiseFor(pol, row, { lat, lng }, 'AMBIENT') };
    }
    res.json({ ...sellerView(row, products), promise, products });
  }

  async function products(req, res) {
    const { lat, lng } = req.query;
    const list = (await nearby({ lat, lng })).flatMap((s) =>
      s.products
        .map((p) => {
          const pr = s.promise[p.servingTemp];
          return { ...p, shopName: s.shopName, shopKind: s.kind, serviceable: Boolean(pr?.serviceable), window: pr?.window, distanceKm: s.distanceKm };
        })
        .filter((p) => p.serviceable),
    );
    res.json(list.sort((a, b) => a.id - b.id));
  }

  async function search(req, res) {
    const { q, lat, lng } = req.query;
    const shops = await nearby({ lat, lng });
    const shopName = new Map(shops.map((s) => [s.id, s.shopName]));
    const results = rankSearch(shops.flatMap((s) => s.products), searchTerm(q)).map((p) => ({
      id: p.id, slug: p.slug, title: p.title, sellerId: p.sellerId, shopName: shopName.get(p.sellerId), pricePaise: p.pricePaise, art: p.art, servingTemp: p.servingTemp,
    }));
    res.json({ q: q.toLowerCase(), results, provider: 'mysql' });
  }

  return { cities, sellers, seller, products, search };
}
