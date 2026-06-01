/**
 * The shared product catalogue: one entry per snack (its name, kind, serving temperature and
 * details), which any shop can put on its menu at its own price. The entry owns the fields
 * below; a shop's menu row copies them and may not change them, so every shop's "Mirchi
 * Bajji" is the same snack to search, compare and picture. Price, MRP, prep time, stock,
 * listing and the shop's own description stay with the shop. A shop can still list a recipe
 * of its own that is not in the catalogue.
 */
export const CATALOGUE_OWNED = ['title', 'category', 'servingTemp', 'weight', 'spice', 'vegetarian', 'allergens', 'shape'];

/** The catalogue-owned fields a seller's change tries to set, for a product linked to an entry. */
export const ownedFieldsIn = (changes) => CATALOGUE_OWNED.filter((k) => changes[k] !== undefined);

/** What shops charge for one snack: lowest, highest and middle price, and how many shops. */
export function priceSpread(prices) {
  const xs = prices.filter((p) => Number.isInteger(p) && p > 0).sort((a, b) => a - b);
  if (!xs.length) return { shops: 0, minPaise: null, maxPaise: null, medianPaise: null };
  const mid = Math.floor(xs.length / 2);
  const median = xs.length % 2 ? xs[mid] : Math.round((xs[mid - 1] + xs[mid]) / 2);
  return { shops: xs.length, minPaise: xs[0], maxPaise: xs[xs.length - 1], medianPaise: median };
}
