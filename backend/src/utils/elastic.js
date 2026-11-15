// Elasticsearch for snack search (doc 12.3), talked to over its REST API with fetch. It finds
// and ranks the snacks that match a query near a point; it never decides whether one can be
// ordered: stock, serving times, the shop being open and the delivery range always come from
// PostgreSQL when the results are put together (utils/search.js).
//
// Index: one document per listed snack, under an alias (ELASTICSEARCH_INDEX, default
// snackhub-products) that points at a versioned index, so a full reindex builds a new index
// and swaps the alias without a gap. Synonyms come from catalog.search_synonyms and are applied
// when searching (synonym_graph), so "golgappa" finds "Pani Puri".
import { normalize } from '../../../shared/domain/search.js';
import { CATEGORY_LABELS } from '../../../shared/domain/menu.js';
import { SLOT_LABEL } from '../../../shared/domain/availability.js';

const TIMEOUT_MS = 2500;

/** Index settings and mappings for a set of synonym groups. */
export function indexBody(groups) {
  return {
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
      analysis: {
        filter: {
          snack_synonyms: { type: 'synonym_graph', synonyms: groups.map((g) => g.map(normalize).filter(Boolean).join(', ')), lenient: true },
        },
        analyzer: {
          snack_text: { type: 'custom', tokenizer: 'standard', filter: ['lowercase', 'asciifolding'] },
          snack_search: { type: 'custom', tokenizer: 'standard', filter: ['lowercase', 'asciifolding', 'snack_synonyms'] },
        },
        normalizer: { lower: { type: 'custom', filter: ['lowercase', 'asciifolding'] } },
      },
    },
    mappings: {
      dynamic: 'strict',
      properties: {
        id: { type: 'long' },
        title: {
          type: 'text',
          analyzer: 'snack_text',
          search_analyzer: 'snack_search',
          fields: { raw: { type: 'keyword', normalizer: 'lower' }, suggest: { type: 'search_as_you_type', analyzer: 'snack_text' } },
        },
        // the title run together, for "panipuri"
        title_compact: { type: 'keyword' },
        description: { type: 'text', analyzer: 'snack_text', search_analyzer: 'snack_search' },
        tags: { type: 'text', analyzer: 'snack_text', search_analyzer: 'snack_search' },
        category: { type: 'keyword' },
        category_text: { type: 'text', analyzer: 'snack_text', search_analyzer: 'snack_search' },
        collections: { type: 'keyword' },
        shop_id: { type: 'long' },
        shop_name: { type: 'text', analyzer: 'snack_text', search_analyzer: 'snack_search', fields: { suggest: { type: 'search_as_you_type', analyzer: 'snack_text' } } },
        city: { type: 'keyword' },
        location: { type: 'geo_point' },
        price_paise: { type: 'integer' },
        rating: { type: 'float' },
        rating_count: { type: 'integer' },
        bestseller: { type: 'boolean' },
        serving_slot: { type: 'keyword' },
        listed: { type: 'boolean' },
        updated_at: { type: 'date' },
      },
    },
  };
}

/** The search document of a product row (with attrs) and its shop's row. */
export function productDoc(p, shop, { listed, slot }) {
  const a = p.attrs || {};
  return {
    id: Number(p.id),
    title: p.title,
    title_compact: normalize(p.title).replace(/ /g, ''),
    description: p.description ?? '',
    // its tags, collections and when it is served ("evening snack", "breakfast")
    tags: [...(a.tags ?? []), ...(a.collections ?? []), SLOT_LABEL[slot] ?? ''].join(' '),
    category: p.category,
    category_text: `${p.category} ${CATEGORY_LABELS[p.category] ?? ''}`,
    collections: a.collections ?? [],
    shop_id: Number(shop.id),
    shop_name: shop.shop_name,
    city: shop.city,
    location: { lat: Number(shop.lat), lon: Number(shop.lng) },
    price_paise: p.price_paise,
    rating: a.demoRating ?? null,
    rating_count: a.demoRatingCount ?? 0,
    bestseller: Boolean(a.bestseller),
    serving_slot: slot,
    listed: Boolean(listed),
    updated_at: new Date(p.updated_at ?? Date.now()).toISOString(),
  };
}

/** The query: exact title, synonyms, word prefixes and typos, inside a radius of a point. */
export function searchBody({ q, point, maxKm, size }) {
  const text = normalize(q);
  return {
    size,
    _source: false,
    track_total_hits: false,
    query: {
      bool: {
        filter: [{ term: { listed: true } }, { geo_distance: { distance: `${maxKm}km`, location: { lat: Number(point.lat), lon: Number(point.lng) } } }],
        should: [
          { term: { 'title.raw': { value: text, boost: 30 } } },
          { term: { title_compact: { value: text.replace(/ /g, ''), boost: 25 } } },
          { match_phrase: { title: { query: text, boost: 12 } } },
          { multi_match: { query: text, type: 'bool_prefix', fields: ['title.suggest', 'title.suggest._2gram', 'title.suggest._3gram'], boost: 6 } },
          { multi_match: { query: text, fields: ['title^4', 'tags^2', 'category_text^2', 'shop_name^2', 'description'], operator: 'and', boost: 3 } },
          { multi_match: { query: text, fields: ['title^3', 'tags', 'shop_name'], analyzer: 'snack_text', fuzziness: 'AUTO', prefix_length: 1, operator: 'and' } },
        ],
        minimum_should_match: 1,
      },
    },
  };
}

export function createElastic(env, { fetchImpl = globalThis.fetch, logger } = {}) {
  const base = (env.ELASTICSEARCH_URL ?? '').replace(/\/+$/, '');
  const alias = env.ELASTICSEARCH_INDEX || 'snackhub-products';
  const headers = { 'Content-Type': 'application/json', ...(env.ELASTICSEARCH_API_KEY ? { Authorization: `ApiKey ${env.ELASTICSEARCH_API_KEY}` } : {}) };
  // what the logs and the reindex script report: how searches and indexing are going
  const stats = { queries: 0, failures: 0, indexed: 0, indexFailures: 0, lastMs: null, slowest: 0 };

  async function call(method, path, body, { ndjson = false, ok404 = false } = {}) {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: ndjson ? { ...headers, 'Content-Type': 'application/x-ndjson' } : headers,
      body: body == null ? undefined : ndjson ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS * (ndjson ? 8 : 1)),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 404 && ok404) return null;
    if (!res.ok) {
      const err = new Error(`Elasticsearch ${method} ${path.split('?')[0]}: ${res.status} ${data.error?.type ?? ''}`.trim());
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    enabled: Boolean(base),
    alias,
    stats,

    /** Whether the cluster answers and the alias exists. */
    async health() {
      const found = await call('HEAD', `/${alias}`, null, { ok404: true });
      return { reachable: true, indexed: found !== null };
    },

    /** Ranked product ids near a point: [{ id, score }]. */
    async search({ q, point, maxKm = 10, size = 200 }) {
      const started = Date.now();
      stats.queries += 1;
      try {
        const data = await call('POST', `/${alias}/_search`, searchBody({ q, point, maxKm, size }));
        stats.lastMs = Date.now() - started;
        stats.slowest = Math.max(stats.slowest, stats.lastMs);
        if (stats.lastMs > 800) logger?.warn({ search: 'slow', ms: stats.lastMs }, 'slow snack search');
        return (data.hits?.hits ?? []).map((h) => ({ id: Number(h._id), score: h._score }));
      } catch (err) {
        stats.failures += 1;
        throw err;
      }
    },

    /** Snack and shop names that start with what is typed, near a point. */
    async suggest({ q, point, maxKm = 10, size = 8 }) {
      const text = normalize(q);
      const data = await call('POST', `/${alias}/_search`, {
        size: 40,
        _source: ['title', 'shop_name'],
        query: {
          bool: {
            filter: [{ term: { listed: true } }, { geo_distance: { distance: `${maxKm}km`, location: { lat: Number(point.lat), lon: Number(point.lng) } } }],
            should: [
              { multi_match: { query: text, type: 'bool_prefix', fields: ['title.suggest', 'title.suggest._2gram', 'title.suggest._3gram'], boost: 3 } },
              { multi_match: { query: text, type: 'bool_prefix', fields: ['shop_name.suggest', 'shop_name.suggest._2gram'] } },
              { match: { title: { query: text, fuzziness: 'AUTO', prefix_length: 1 } } },
            ],
            minimum_should_match: 1,
          },
        },
      });
      // a hit can match on its shop's name only: each name is offered when it matches itself
      // every word typed must start a word of the name (one wrong letter allowed past 3 letters)
      const typed = text.split(' ').filter(Boolean);
      const near = (w, t) => w.startsWith(t) || (t.length > 3 && w.length >= t.length && [...t].filter((ch, i) => w[i] !== ch).length <= 1);
      const matches = (name) => {
        const ws = normalize(name).split(' ');
        return typed.every((t) => ws.some((w) => near(w, t)));
      };
      const out = [];
      const seen = new Set();
      for (const h of data.hits?.hits ?? []) {
        for (const [name, kind] of [[h._source.title, 'snack'], [h._source.shop_name, 'shop']]) {
          if (!name || seen.has(name) || !matches(name)) continue;
          seen.add(name);
          out.push({ text: name, kind });
        }
      }
      // snacks before shops
      return out.sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'snack' ? -1 : 1)).slice(0, size);
    },

    /** Adds or replaces documents and removes ids, in one bulk request; returns the failed ids. */
    async bulk({ docs = [], deleteIds = [] }) {
      if (!docs.length && !deleteIds.length) return [];
      const lines = [];
      for (const d of docs) lines.push(JSON.stringify({ index: { _index: alias, _id: String(d.id) } }), JSON.stringify(d));
      for (const id of deleteIds) lines.push(JSON.stringify({ delete: { _index: alias, _id: String(id) } }));
      const data = await call('POST', '/_bulk?refresh=wait_for', `${lines.join('\n')}\n`, { ndjson: true });
      const failed = (data.items ?? []).map((it) => it.index ?? it.delete).filter((r) => r && r.status >= 300 && !(r.status === 404 && r.result === 'not_found')).map((r) => r._id);
      stats.indexed += docs.length + deleteIds.length - failed.length;
      stats.indexFailures += failed.length;
      if (failed.length) logger?.warn({ search: 'index_failed', count: failed.length }, 'some snacks were not indexed');
      return failed;
    },

    /**
     * Builds a fresh index with every document, points the alias at it in one step and drops
     * the old indexes: a mapping or synonym change never leaves search without an index.
     */
    async reindex({ docs, groups }) {
      const name = `${alias}-${Date.now()}`;
      await call('PUT', `/${name}`, indexBody(groups));
      for (let i = 0; i < docs.length; i += 500) {
        const lines = docs.slice(i, i + 500).flatMap((d) => [JSON.stringify({ index: { _index: name, _id: String(d.id) } }), JSON.stringify(d)]);
        const data = await call('POST', '/_bulk?refresh=true', `${lines.join('\n')}\n`, { ndjson: true });
        if (data.errors) throw new Error('Some documents were refused while reindexing');
      }
      const old = Object.keys((await call('GET', `/_alias/${alias}`, null, { ok404: true })) ?? {});
      // an index left with the alias's own name (from before aliases) is removed first
      if (!old.length) await call('DELETE', `/${alias}`, null, { ok404: true });
      await call('POST', '/_aliases', { actions: [...old.map((index) => ({ remove: { index, alias } })), { add: { index: name, alias } }] });
      for (const index of old) await call('DELETE', `/${index}`, null, { ok404: true });
      return { index: name, documents: docs.length, replaced: old };
    },
  };
}
