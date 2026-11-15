/**
 * Snack search ranking (doc 12.3), the same rules wherever search runs: the API ranks the
 * snacks that can reach the customer with this when Elasticsearch is not there (the live site
 * on PostgreSQL), and Elasticsearch is set up to agree with it (the same synonyms, prefixes
 * and typo allowance). Synonym groups come from catalog.search_synonyms.
 *
 * A query matches when, for every word, the snack's title, tags, category, collections, shop
 * name or description has that word (or one of its regional names, a word starting with it,
 * or one within a typo or two of it). Exact titles rank first, then titles that start with
 * the query, then words in the title, then the rest.
 */
import { CATEGORY_LABELS } from './menu.js';
import { SLOT_LABEL } from './availability.js';

export const normalize = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const words = (s) => normalize(s).split(' ').filter(Boolean);

export function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** Typos allowed for a word of this length: none for short words, one, then two. */
export const typosFor = (word) => (word.length <= 3 ? 0 : word.length <= 6 ? 1 : 2);

/**
 * The query and its regional names: "golgappa" also searches "pani puri". A group matches
 * when the whole query, or a phrase in it, is one of its terms (or within a typo of one).
 */
export function expandQuery(q, groups = []) {
  const query = normalize(q);
  const variants = new Set([query]);
  for (const group of groups) {
    const terms = group.map(normalize);
    const compact = query.replace(/ /g, '');
    const hit = terms.find((t) => t === query || t.replace(/ /g, '') === compact || (query.includes(t) && t.length >= 4) || (t.length > 4 && lev(t, query) <= typosFor(query)));
    if (!hit) continue;
    // a phrase inside the query is swapped for each regional name; a whole-query match is replaced
    const inside = query.includes(hit) && hit !== query;
    for (const t of terms) variants.add(inside ? query.replace(hit, t) : t);
  }
  return [...variants].filter(Boolean);
}

/** How well one word matches a field's words: 4 exact, 3 prefix, 2 inside, 1 typo, 0 none. */
function wordMatch(word, fieldWords) {
  let best = 0;
  for (const w of fieldWords) {
    if (w === word) return 4;
    if (w.startsWith(word)) best = Math.max(best, 3);
    else if (word.length >= 3 && w.includes(word)) best = Math.max(best, 2);
    else if (typosFor(word) && lev(w, word) <= typosFor(word)) best = Math.max(best, 1);
  }
  return best;
}

const FIELDS = [
  ['title', 10],
  ['tags', 4],
  ['category', 3],
  ['shop', 3],
  ['region', 1],
  ['description', 1],
];

/** A snack's fields as words, ready to match: { title, tags, category, shop, region, description }. */
export function searchFields(p) {
  return {
    titleText: normalize(p.title),
    title: words(p.title),
    tags: [...(p.tags ?? []), ...(p.collections ?? []), SLOT_LABEL[p.servingSlot] ?? ''].flatMap(words),
    category: words(`${p.category ?? ''} ${CATEGORY_LABELS[p.category] ?? ''}`),
    shop: words(p.shopName),
    region: words(`${p.region ?? ''} ${p.city ?? ''}`),
    description: words(p.description),
  };
}

/** The score of one snack for a query (expanded with expandQuery); 0 when it does not match. */
export function searchScore(p, variants) {
  const f = p.fields ?? searchFields(p);
  let best = 0;
  for (const v of variants) {
    const qw = words(v);
    if (!qw.length) continue;
    // run together ("panipuri"): the title without its spaces
    const joined = v.replace(/ /g, '');
    if (qw.length === 1 && joined.length >= 5 && f.titleText.replace(/ /g, '').startsWith(joined) && f.titleText.includes(' ')) {
      best = Math.max(best, 40 + (f.titleText.replace(/ /g, '') === joined ? 100 : 50));
      continue;
    }
    let score = 0;
    let matched = true;
    for (const word of qw) {
      let wordBest = 0;
      for (const [field, weight] of FIELDS) wordBest = Math.max(wordBest, wordMatch(word, f[field]) * weight);
      if (!wordBest) {
        matched = false;
        break;
      }
      score += wordBest;
    }
    if (!matched) continue;
    // the whole query as the title, or the start of it, beats a word-by-word match
    if (f.titleText === v || f.titleText.replace(/ /g, '') === v.replace(/ /g, '')) score += 100;
    else if (f.titleText.startsWith(v)) score += 50;
    else if (f.titleText.includes(v)) score += 25;
    best = Math.max(best, score);
  }
  return best;
}

/** Snacks that match, best first: [{ item, score }]. */
export function rankSearch(items, q, groups = []) {
  const variants = expandQuery(q, groups);
  return items
    .map((item) => ({ item, score: searchScore(item, variants) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** Autocomplete: titles (and shop names) that start with, or nearly start with, what is typed. */
export function suggestTitles(items, q, groups = [], limit = 8) {
  const variants = expandQuery(q, groups);
  // a regional name being typed ("golg..."): its group's other names count as typed too
  const typed = normalize(q);
  if (typed.length >= 3) for (const g of groups) if (g.some((t) => normalize(t).startsWith(typed))) for (const t of g) variants.push(normalize(t));
  const seen = new Map();
  for (const it of items) {
    for (const [text, kind] of [[it.title, 'snack'], [it.shopName, 'shop']]) {
      if (!text) continue;
      const t = normalize(text);
      let score = 0;
      for (const v of variants) {
        if (t.startsWith(v)) score = Math.max(score, 3);
        else if (words(t).some((w) => w.startsWith(v))) score = Math.max(score, 2);
        else if (v.length > 3 && words(t).some((w) => lev(w.slice(0, v.length), v) <= 1)) score = Math.max(score, 1);
      }
      if (score && (!seen.has(text) || seen.get(text).score < score)) seen.set(text, { text, kind, score: score + (kind === 'snack' ? 0.5 : 0) });
    }
  }
  return [...seen.values()].sort((a, b) => b.score - a.score || a.text.localeCompare(b.text)).slice(0, limit).map(({ text, kind }) => ({ text, kind }));
}
