/**
 * What a seller may put on the menu (doc 11.2). Money is integer paise. A new snack has no
 * photo yet, so it shows a drawing: the seller picks the shape, the category gives the colours.
 */
export const CATEGORIES = ['sweet', 'fried', 'baked', 'namkeen'];
export const CATEGORY_LABELS = { sweet: 'Sweet', fried: 'Fried', baked: 'Baked', namkeen: 'Namkeen' };
export const SHAPES = ['bajji', 'samosa', 'spiral', 'square', 'disc', 'vada', 'bun', 'pile', 'wrap', 'biscuit', 'roll', 'chips', 'ball'];

const COLOURS = {
  sweet: ['#F4A72C', '#C7621A', '#FFE3A3'],
  fried: ['#D9822B', '#8C4A12', '#F6C26B'],
  baked: ['#C98F4E', '#7A4B21', '#EED2A6'],
  namkeen: ['#E8B44A', '#9C5B16', '#F9DD8E'],
};

export const MIN_PRICE_PAISE = 500;
export const MAX_PRICE_PAISE = 200_000;
export const MAX_STOCK = 999;
export const STOCK_REASONS = ['new batch', 'manual correction', 'item unavailable', 'damaged', 'returned to shelf'];

export const artFor = (category, shape) => ({ shape: SHAPES.includes(shape) ? shape : 'pile', colors: COLOURS[category] ?? COLOURS.namkeen });

/** URL-safe slug from a title, unique within a shop with a numeric suffix. */
export function slugFor(title, taken = []) {
  const base =
    String(title)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_-]+/g, '-')
      .slice(0, 100) || 'snack';
  let slug = base;
  for (let n = 2; taken.includes(slug); n += 1) slug = `${base}-${n}`;
  return slug;
}
