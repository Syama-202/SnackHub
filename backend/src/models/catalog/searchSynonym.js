// catalog.search_synonyms: one row per snack's regional names (golgappa, puchka = pani puri).
// Both search engines read these; adding a row needs no code change.
const TABLE = 'search_synonyms';

export const searchSynonymModel = {
  /** Every group as an array of lower-case terms. */
  groups: (db) =>
    db(TABLE)
      .orderBy('id')
      .pluck('terms')
      .then((rows) => rows.map((t) => (typeof t === 'string' ? JSON.parse(t) : t).map((x) => String(x).toLowerCase()))),
};
