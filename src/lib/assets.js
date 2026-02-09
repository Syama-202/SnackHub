import index from './assetIndex.json';

// Media base: an object store with a CDN in production (doc 22.8), /assets locally.
// Changing CDN later means changing this one helper, not every product (doc 6.2).
const BASE = (import.meta.env.VITE_ASSET_BASE || '/assets').replace(/\/$/, '');

/** File for an asset id from assets/manifest.json, or null until it is marked ready. */
export const readyAsset = (id) => index[id] || null;

/** URL of one rendition, e.g. imageUrl('snacks/mysore-pak.webp', 800) -> /assets/snacks/mysore-pak-800.webp */
export function imageUrl(file, width) {
  const dot = file.lastIndexOf('.');
  return width ? `${BASE}/${file.slice(0, dot)}-${width}${file.slice(dot)}` : `${BASE}/${file}`;
}

export const IMAGE_WIDTHS = [400, 800, 1200];
export const srcSet = (file) => IMAGE_WIDTHS.map((w) => `${imageUrl(file, w)} ${w}w`).join(', ');
