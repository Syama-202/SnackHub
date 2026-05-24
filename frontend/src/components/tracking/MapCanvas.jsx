import { useEffect, useRef, useState } from 'react';
import { Map as MapLibre, Marker, LngLatBounds, NavigationControl, AttributionControl, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useReducedMotion } from '../../hooks';

// Free vector tiles from OpenFreeMap (no key, OpenStreetMap data), not the public OSM tile servers
export const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
setWorkerUrl(workerUrl);

const PATHS = {
  shop: '<path d="M4 10h16l-1.5-5h-13z"/><path d="M5 10v9h14v-9"/><path d="M10 19v-5h4v5"/>',
  drop: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
  rider: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17h7l3-7h3M10 10h4"/>',
};
const LOOK = {
  shop: 'bg-orange-deep text-white',
  drop: 'bg-grey-900 text-white',
  rider: 'bg-primary text-grey-800 ring-4 ring-primary/30',
};

const markerClass = (kind, muted) => `grid h-9 w-9 place-items-center rounded-full shadow-lg ${muted ? 'bg-grey-400 text-white' : LOOK[kind]}`;

export function markerEl(kind, label, muted) {
  const el = document.createElement('div');
  el.className = markerClass(kind, muted);
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', label);
  el.title = label;
  el.innerHTML = `<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[kind]}</svg>`;
  return el;
}

function fit(map, points) {
  if (!points.length) return;
  if (points.length === 1) return map.jumpTo({ center: [points[0].lng, points[0].lat], zoom: 15 });
  const b = new LngLatBounds();
  for (const p of points) b.extend([p.lng, p.lat]);
  map.fitBounds(b, { padding: { top: 56, right: 56, bottom: 64, left: 56 }, maxZoom: 16, duration: 0 });
}

const lineData = (lines) => ({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: lines.map((l) => l.map((p) => [p.lng, p.lat])) } });

/**
 * A real map (MapLibre GL) with markers for shops, drop points and riders at the positions the
 * server reports, and dashed straight lines between points (`lines`, a list of point lists).
 * A rider's marker glides to each new GPS fix instead of jumping; nothing moves unless a new
 * position arrives. The view fits every marker until the person pans or zooms,
 * then a button brings it back.
 */
export default function MapCanvas({ points, lines = null, height = 280, label }) {
  const box = useRef(null);
  const map = useRef(null);
  const markers = useRef(new Map());
  const touched = useRef(false);
  const latest = useRef(points);
  const reduced = useReducedMotion();
  const [moved, setMoved] = useState(false);
  const [tilesDown, setTilesDown] = useState(false);
  useEffect(() => {
    latest.current = points;
  }, [points]);

  useEffect(() => {
    const m = new MapLibre({
      container: box.current,
      style: STYLE,
      center: [78.9, 21.5], // India until the first fit
      zoom: 4,
      attributionControl: false,
      cooperativeGestures: true, // one finger scrolls the page; two fingers move the map
    });
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    m.addControl(new AttributionControl({ compact: true }), 'bottom-right');
    const userMove = (e) => {
      if (e.originalEvent) {
        touched.current = true;
        setMoved(true);
      }
    };
    m.on('dragstart', userMove);
    m.on('zoomstart', userMove);
    m.on('error', (e) => {
      if (/tile|style|fetch|network/i.test(String(e.error?.message))) setTilesDown(true);
    });
    m.on('load', () => {
      // the compact credit opens by default; start it folded to its (i) button
      m.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
      m.addSource('route', { type: 'geojson', data: lineData([]) });
      m.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#1f1b16', 'line-width': 3, 'line-dasharray': [1.5, 1.5], 'line-opacity': 0.6 } });
    });
    fit(m, latest.current);
    map.current = m;
    const ms = markers.current;
    return () => {
      for (const { marker, raf } of ms.values()) {
        cancelAnimationFrame(raf);
        marker.remove();
      }
      ms.clear();
      m.remove();
      map.current = null;
    };
  }, []);

  // markers follow the reported positions
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set();
    let added = false;
    for (const p of points) {
      seen.add(p.id);
      const entry = markers.current.get(p.id);
      if (!entry) {
        const marker = new Marker({ element: markerEl(p.kind, p.label, p.muted) }).setLngLat([p.lng, p.lat]).addTo(m);
        markers.current.set(p.id, { marker, raf: 0 });
        added = true;
        continue;
      }
      const el = entry.marker.getElement();
      el.setAttribute('aria-label', p.label);
      el.title = p.label;
      el.className = `${markerClass(p.kind, p.muted)} maplibregl-marker`;
      const from = entry.marker.getLngLat();
      if (from.lng === p.lng && from.lat === p.lat) continue;
      cancelAnimationFrame(entry.raf);
      if (reduced) {
        entry.marker.setLngLat([p.lng, p.lat]);
        continue;
      }
      const start = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - start) / 900);
        entry.marker.setLngLat([from.lng + (p.lng - from.lng) * k, from.lat + (p.lat - from.lat) * k]);
        if (k < 1) entry.raf = requestAnimationFrame(step);
      };
      entry.raf = requestAnimationFrame(step);
    }
    for (const [id, { marker, raf }] of markers.current) {
      if (seen.has(id)) continue;
      cancelAnimationFrame(raf);
      marker.remove();
      markers.current.delete(id);
    }
    // keep everyone in view unless the person is looking around themselves
    if (!touched.current) {
      const view = m.getBounds();
      if (added || points.some((p) => !view.contains([p.lng, p.lat]))) fit(m, points);
    }
  }, [points, reduced]);

  useEffect(() => {
    const m = map.current;
    if (!m) return undefined;
    const draw = () => m.getSource('route')?.setData(lineData(lines ?? []));
    if (m.getSource('route')) draw();
    else m.once('load', draw);
    return () => m.off('load', draw);
  }, [lines]);

  const recenter = () => {
    touched.current = false;
    setMoved(false);
    if (map.current) fit(map.current, latest.current);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#EEE9E0]" style={{ height }}>
      {/* inline, because maplibre-gl.css sets the map container to position: relative */}
      <div ref={box} style={{ position: 'absolute', inset: 0 }} role="region" aria-label={label} />
      {moved && (
        <button type="button" onClick={recenter} className="absolute bottom-3 left-3 z-10 inline-flex h-9 items-center rounded-full bg-white px-3 text-sm font-bold text-grey-800 shadow-lg">
          Recenter
        </button>
      )}
      {tilesDown && <p className="absolute inset-x-3 top-3 z-10 rounded-xl bg-white/95 p-2 text-xs font-semibold text-grey-800 shadow">The map could not load. Positions and distances below still update.</p>}
    </div>
  );
}
