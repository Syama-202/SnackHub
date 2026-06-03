/**
 * Error monitoring: crashes from the API, the background jobs and the browser, grouped by
 * cause so one bug is one row however often it happens. Everything is scrubbed before it is
 * stored: error text can quote what a person typed or was sent, so emails, phone numbers,
 * codes, tokens, long ids and query strings are replaced with placeholders.
 */
export const ERROR_SOURCES = ['api', 'job', 'web', 'admin'];
export const ERROR_STATUSES = ['open', 'resolved', 'ignored'];
export const LIMITS = { kind: 80, message: 300, where: 200, stack: 4000, release: 40 };

const RULES = [
  [/\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/g, '<email>'],
  [/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}\b/g, '<token>'], // a signed token
  [/\b(Bearer|Basic)\s+[\w.~+/=-]+/gi, '$1 <token>'],
  [/\b[A-Za-z0-9_-]{32,}\b/g, '<id>'], // keys, hashes, long random ids
  [/(\+?91[\s-]?)?\b[6-9]\d{9}\b/g, '<phone>'],
  [/\b\d{4,}\b/g, '<n>'], // codes, pincodes, amounts, order ids
  [/\?[^\s'")]*/g, '?<query>'], // query strings in URLs
];

/** The text with personal data and secrets replaced, and cut to a length. */
export function scrub(text, max = LIMITS.message) {
  let s = String(text ?? '');
  for (const [re, to] of RULES) s = s.replace(re, to);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** A path without ids: /orders/1234/report -> /orders/:id/report. */
export const routeShape = (path) =>
  scrub(String(path ?? '').split('?')[0], LIMITS.where)
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .replace(/\/<(n|id)>(?=\/|$)/g, '/:id');

/**
 * What makes two errors the same bug: where it happened, its kind, and its message with
 * numbers and quoted values blanked (so "order 12 not found" and "order 99 not found" group).
 */
export function fingerprintParts({ source, kind, message, where }) {
  const msg = scrub(message)
    .replace(/(["'`]).*?\1/g, '?')
    .replace(/\d+/g, '#')
    .toLowerCase();
  return [source, kind || 'Error', where || '', msg].join('|');
}
