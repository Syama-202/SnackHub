/**
 * Snack search ranking (doc 12.3). Elasticsearch does this in the full stack; the API on
 * MySQL and the browser mock both use this until it runs. Common spellings map to the
 * catalogue name, and a first word within two typos still matches.
 */
export const SYNONYMS = { chakli: 'murukku', jilebi: 'jalebi', mithai: 'sweet', murku: 'murukku', samsa: 'samosa', laddoo: 'laddu' };

export const searchTerm = (q) => {
  const t = String(q ?? '').trim().toLowerCase();
  return SYNONYMS[t] || t;
};

export function lev(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** 3 title starts with the term, 2 title contains it, 1 category, region, tag or near spelling, 0 no match. */
export function searchScore(p, term) {
  if (!term) return 0;
  const t = p.title.toLowerCase();
  if (t.startsWith(term)) return 3;
  if (t.includes(term)) return 2;
  if (p.category.includes(term) || (p.region || '').toLowerCase().includes(term) || (p.tags || []).some((x) => x.includes(term))) return 1;
  if (term.length > 3 && lev(t.split(' ')[0], term) <= 2) return 1;
  return 0;
}

/** Best matches first, at most `limit`. */
export const rankSearch = (products, term, limit = 8) =>
  products
    .map((p) => ({ p, s: searchScore(p, term) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.p);
