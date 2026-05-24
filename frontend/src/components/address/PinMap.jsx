import { useEffect, useRef } from 'react';
import { Map as MapLibre, Marker, NavigationControl, AttributionControl } from 'maplibre-gl';
import { STYLE, markerEl } from '../tracking/MapCanvas';

/**
 * A map for placing the delivery pin: drag the pin, or tap the map to move it there. The pin
 * is what riders and delivery times are judged from, so the person sees exactly where it is.
 * Loaded lazily with the rest of MapLibre.
 */
export default function PinMap({ pin, onChange, height = 260 }) {
  const box = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const m = new MapLibre({ container: box.current, style: STYLE, center: [pin.lng, pin.lat], zoom: 16, attributionControl: false, cooperativeGestures: true });
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    m.addControl(new AttributionControl({ compact: true }), 'bottom-right');
    m.on('load', () => m.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));
    const el = markerEl('drop', 'Delivery pin. Drag it to your door.');
    el.style.cursor = 'grab';
    const mk = new Marker({ element: el, draggable: true }).setLngLat([pin.lng, pin.lat]).addTo(m);
    const report = ({ lng, lat }) => changed.current({ lat: +lat.toFixed(6), lng: +lng.toFixed(6) });
    mk.on('dragend', () => report(mk.getLngLat()));
    m.on('click', (e) => {
      mk.setLngLat(e.lngLat);
      report(e.lngLat);
    });
    map.current = m;
    marker.current = mk;
    return () => m.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // a pin set from outside (search, GPS, city) moves the marker and the view
  useEffect(() => {
    const mk = marker.current;
    const m = map.current;
    if (!mk || !m) return;
    const at = mk.getLngLat();
    if (Math.abs(at.lat - pin.lat) < 1e-7 && Math.abs(at.lng - pin.lng) < 1e-7) return;
    mk.setLngLat([pin.lng, pin.lat]);
    m.easeTo({ center: [pin.lng, pin.lat], zoom: Math.max(m.getZoom(), 15), duration: 500 });
  }, [pin.lat, pin.lng]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#EEE9E0]" style={{ height }}>
      {/* inline, because maplibre-gl.css sets the map container to position: relative */}
      <div ref={box} style={{ position: 'absolute', inset: 0 }} role="application" aria-label="Map for the delivery pin. Drag the pin or tap the map to move it." />
    </div>
  );
}
