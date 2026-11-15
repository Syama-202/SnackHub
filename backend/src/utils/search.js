// Snack search (doc 12.3). The candidates come from Elasticsearch when it is set up and
// answering, else from the shared ranking over the snacks PostgreSQL says can reach the
// customer. Either way every result is then put together from PostgreSQL: whether the shop
// delivers here, its hours, the snack's serving time, stock and price. So a stale or missing
// index can change the order of results, never what can be ordered.
//
// Elasticsearch failing (down, slow, no index) switches to PostgreSQL for 30 seconds and the
// answer says so (fallback: true); nothing breaks for the customer.
import { rankSearch, suggestTitles } from '../../../shared/domain/search.js';
import { STATUS_ORDER, AVAILABILITY } from '../../../shared/domain/availability.js';
import { localDay } from '../../../shared/domain/hours.js';
import { searchSynonymModel } from '../models/catalog/searchSynonym.js';

const SYNONYMS_TTL_MS = 5 * 60_000;
const PAUSE_MS = 30_000;
const rank = (p) => STATUS_ORDER.indexOf(p.availability.status);

/** Whether a result passes the customer's filters. */
function passes(p, f, now) {
  if (f.category && p.category !== f.category && !(p.collections ?? []).includes(f.category)) return false;
  if (f.minPrice != null && p.pricePaise < f.minPrice) return false;
  if (f.maxPrice != null && p.pricePaise > f.maxPrice) return false;
  if (f.minRating != null && (p.rating ?? 0) < f.minRating) return false;
  if (f.maxKm != null && p.distanceKm > f.maxKm) return false;
  if (f.shopId != null && p.sellerId !== f.shopId) return false;
  const a = p.availability;
  if (f.availability === 'now' && !a.orderable) return false;
  if (f.availability === 'today') {
    const tz = p.timezone;
    const later = a.nextAt != null && localDay(a.nextAt, tz).date === localDay(now, tz).date;
    if (!(a.status === AVAILABILITY.AVAILABLE || ([AVAILABILITY.LATER_TODAY, AVAILABILITY.SHOP_CLOSED].includes(a.status) && later))) return false;
  }
  return true;
}

const SORTS = {
  // best match first; among equals, what can be ordered now, then the nearest
  relevance: (a, b) => b.score - a.score || rank(a.item) - rank(b.item) || a.item.distanceKm - b.item.distanceKm,
  price_asc: (a, b) => a.item.pricePaise - b.item.pricePaise || rank(a.item) - rank(b.item),
  price_desc: (a, b) => b.item.pricePaise - a.item.pricePaise || rank(a.item) - rank(b.item),
  popular: (a, b) => Number(b.item.bestseller) - Number(a.item.bestseller) || (b.item.ratingCount ?? 0) - (a.item.ratingCount ?? 0) || b.score - a.score,
  distance: (a, b) => a.item.distanceKm - b.item.distanceKm || b.score - a.score,
};
export const SORT_KEYS = Object.keys(SORTS);

const resultView = (p, score) => ({
  id: p.id,
  slug: p.slug,
  title: p.title,
  description: p.description,
  sellerId: p.sellerId,
  shopName: p.shopName,
  shopKind: p.shopKind,
  catalogItemId: p.catalogItemId,
  category: p.category,
  region: p.region,
  tags: p.tags,
  collections: p.collections,
  bestseller: p.bestseller,
  trending: p.trending,
  pricePaise: p.pricePaise,
  mrpPaise: p.mrpPaise,
  weight: p.weight,
  servingTemp: p.servingTemp,
  spice: p.spice,
  rating: p.rating,
  ratingCount: p.ratingCount,
  art: p.art,
  stock: p.stock,
  distanceKm: p.distanceKm,
  window: p.window,
  servingSlot: p.servingSlot,
  availability: p.availability,
  score: Math.round(score * 100) / 100,
});

export function createSearch({ dbs, elastic = null, logger }) {
  let synonyms = { at: 0, groups: [] };
  let pausedUntil = 0;

  async function groups() {
    if (Date.now() - synonyms.at > SYNONYMS_TTL_MS) synonyms = { at: Date.now(), groups: await searchSynonymModel.groups(dbs.catalog) };
    return synonyms.groups;
  }
  const esUsable = () => Boolean(elastic?.enabled) && Date.now() >= pausedUntil;
  const pause = (err, what) => {
    pausedUntil = Date.now() + PAUSE_MS;
    logger?.warn({ search: 'elasticsearch_unavailable', what, reason: err.message }, 'search falls back to PostgreSQL');
  };

  /** Ranked candidates among the snacks that can reach the point: [{ item, score }]. */
  async function candidates(q, point, products) {
    const g = await groups();
    if (esUsable()) {
      try {
        const hits = await elastic.search({ q, point, maxKm: 10, size: 300 });
        const here = new Map(products.map((p) => [p.id, p]));
        // what the index found, but only what PostgreSQL says reaches this point
        return { provider: 'elasticsearch', ranked: hits.filter((h) => here.has(h.id)).map((h) => ({ item: here.get(h.id), score: h.score })) };
      } catch (err) {
        pause(err, 'search');
        return { provider: 'postgres', fallback: true, ranked: rankSearch(products, q, g) };
      }
    }
    return { provider: 'postgres', ranked: rankSearch(products, q, g) };
  }

  /**
   * products: the snacks of the shops that deliver to the point, with their availability
   * (catalog controller). Returns a page of results and how many there are in all.
   */
  async function search({ q, point, products, filters = {}, sort = 'relevance', page = 1, pageSize = 20, now = Date.now() }) {
    const started = Date.now();
    const { provider, fallback = false, ranked } = await candidates(q, point, products);
    const rows = ranked.filter((r) => passes(r.item, filters, now)).sort(SORTS[sort] ?? SORTS.relevance);
    const from = (page - 1) * pageSize;
    return {
      provider,
      fallback,
      total: rows.length,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(rows.length / pageSize)),
      tookMs: Date.now() - started,
      results: rows.slice(from, from + pageSize).map((r) => resultView(r.item, r.score)),
    };
  }

  /** Autocomplete for what is typed: snack and shop names near the point. */
  async function suggest({ q, point, products }) {
    const local = suggestTitles(products, q, await groups());
    if (esUsable()) {
      try {
        const names = new Set(products.flatMap((p) => [p.title, p.shopName]));
        // only names of snacks and shops that reach this point; regional names being typed
        // ("golg...") come from the synonym-aware list, which the index cannot do by prefix
        const found = (await elastic.suggest({ q, point })).filter((s) => names.has(s.text));
        const seen = new Set(found.map((s) => s.text));
        return { provider: 'elasticsearch', suggestions: [...found, ...local.filter((s) => !seen.has(s.text))].slice(0, 8) };
      } catch (err) {
        pause(err, 'suggest');
      }
    }
    return { provider: 'postgres', suggestions: local };
  }

  return { search, suggest, groups };
}
