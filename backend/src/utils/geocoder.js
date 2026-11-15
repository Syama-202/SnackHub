// Place search and reverse lookup for the address pin, through a Nominatim-compatible server
// (OpenStreetMap data). The browser never calls it directly: the API keeps to the public
// server's policy (one request a second for the whole process, an identifying User-Agent,
// cached answers, searches on submit and not per keystroke) and limits each customer. India
// only. Queries and coordinates are never logged.
import { AppError } from './AppError.js';

const GAP_MS = 1100;
const TIMEOUT_MS = 6000;
const CACHE_MAX = 500;
const CACHE_MS = 24 * 60 * 60_000;

const shortLine = (a = {}, fallback = '') => {
  const parts = [a.house_number && a.road ? `${a.house_number} ${a.road}` : a.road, a.neighbourhood ?? a.suburb, a.city ?? a.town ?? a.village ?? a.county, a.state, a.postcode];
  const line = parts.filter(Boolean).join(', ');
  return (line || fallback).slice(0, 255);
};

export function createGeocoder(env, { fetchImpl = globalThis.fetch, logger } = {}) {
  const base = env.GEOCODER_URL?.replace(/\/$/, '');
  const agent = `SnackHub/0.2 (${env.GEOCODER_CONTACT || 'development build'})`;
  const cache = new Map();
  let queue = Promise.resolve();
  let last = 0;

  // one request at a time, at least GAP_MS apart, for every caller in this process
  const paced = (task) => {
    const run = queue.then(async () => {
      const wait = last + GAP_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      return task();
    });
    queue = run.catch(() => {});
    return run;
  };

  async function call(path, params) {
    if (!base) throw new AppError(503, 'PLACE_SEARCH_OFF', 'Place search is not set up here. Drop the pin on the map instead.');
    const key = `${path}?${new URLSearchParams(params)}`;
    const hit = cache.get(key);
    if (hit && hit.at > Date.now() - CACHE_MS) return hit.value;
    const value = await paced(async () => {
      let res;
      try {
        res = await fetchImpl(`${base}${key}`, { headers: { 'User-Agent': agent, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (err) {
        logger?.warn({ geocoder: 'unreachable', reason: err.name }, 'place search failed');
        throw new AppError(503, 'PLACE_SEARCH_DOWN', 'Place search is not answering. Drop the pin on the map instead.');
      }
      if (!res.ok) {
        logger?.warn({ geocoder: 'error', status: res.status }, 'place search failed');
        throw new AppError(503, 'PLACE_SEARCH_DOWN', 'Place search is not answering. Drop the pin on the map instead.');
      }
      return res.json();
    });
    cache.delete(key);
    cache.set(key, { at: Date.now(), value });
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return value;
  }

  return {
    enabled: Boolean(base),
    /** Up to five places in India for a typed query. */
    async search(q) {
      const rows = await call('/search', { q, format: 'jsonv2', countrycodes: 'in', addressdetails: '1', limit: '5' });
      return (Array.isArray(rows) ? rows : [])
        .map((r) => ({ name: String(r.name || r.display_name || '').slice(0, 120), line: shortLine(r.address, r.display_name), postcode: /^[1-9][0-9]{5}$/.test(r.address?.postcode ?? '') ? r.address.postcode : null, lat: +Number(r.lat).toFixed(6), lng: +Number(r.lon).toFixed(6) }))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    },
    /** A street-level description of a pin, or null when nothing is known there. */
    async reverse({ lat, lng }) {
      const r = await call('/reverse', { lat: String(lat), lon: String(lng), format: 'jsonv2', addressdetails: '1', zoom: '18' });
      if (!r || r.error) return null;
      const a = r.address ?? {};
      return {
        line: shortLine(a, r.display_name),
        postcode: /^[1-9][0-9]{5}$/.test(a.postcode ?? '') ? a.postcode : null,
        // the neighbourhood and the city it is in, for "Deliver to Brodipet, Guntur"
        locality: String(a.suburb || a.neighbourhood || a.quarter || a.city_district || a.residential || '').slice(0, 80) || null,
        city: String(a.city || a.town || a.village || a.county || a.state_district || '').slice(0, 80) || null,
        state: String(a.state || '').slice(0, 60) || null,
      };
    },
  };
}
