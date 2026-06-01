// catalog.catalog_items: the shared catalogue, one entry per snack (shared/domain/catalogue.js).
// attrs is JSON (weight, spice, vegetarian, allergens, tags, collections, art).
const TABLE = 'catalog_items';

const parse = (row) => row && { ...row, attrs: typeof row.attrs === 'string' ? JSON.parse(row.attrs) : (row.attrs ?? {}) };
// a title search: every word must appear, matched with bindings (LIKE wildcards escaped)
const likeWords = (q, term) => {
  for (const w of term.split(/\s+/).filter(Boolean).slice(0, 5)) q.where('title', 'like', `%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
};

export const catalogItemModel = {
  findById: (db, id) => db(TABLE).where({ id }).first().then(parse),
  listByIds: (db, ids) => (ids.length ? db(TABLE).whereIn('id', ids).then((rows) => rows.map(parse)) : Promise.resolve([])),
  /** Entries matching a title search, alphabetical; retired ones only when asked. */
  search: (db, { q = '', activeOnly = true, limit = 50 } = {}) =>
    db(TABLE)
      .modify((x) => activeOnly && x.where({ active: true }))
      .modify((x) => q && likeWords(x, q))
      .orderBy('title')
      .limit(limit)
      .then((rows) => rows.map(parse)),
  slugs: (db) => db(TABLE).pluck('slug'),
  create: (db, item) => db(TABLE).insert({ ...item, attrs: JSON.stringify(item.attrs ?? {}) }).then(([id]) => id),
  update: (db, id, changes) => db(TABLE).where({ id }).update(changes.attrs ? { ...changes, attrs: JSON.stringify(changes.attrs) } : changes),
};
