import { lazy, Suspense, useMemo } from 'react';
import { hasWebGL } from '../../hooks';

// MapLibre is large, so it loads only when a map is on screen
const MapCanvas = lazy(() => import('./MapCanvas'));

const ON_THE_ROAD = ['PICKED_UP', 'ON_THE_WAY', 'ARRIVED'];

function Placeholder({ height, label, children }) {
  return (
    <div className="grid place-items-center rounded-2xl bg-[#EEE9E0] p-4 text-center text-sm font-semibold text-grey-600" style={{ height }} role="img" aria-label={label}>
      {children}
    </div>
  );
}

/** A real map, or a plain summary on a device without WebGL. */
export function TrackMap({ points, lines, height = 280, label }) {
  if (!points.length) return <Placeholder height={height} label={label}>No positions yet</Placeholder>;
  if (!hasWebGL()) return <Placeholder height={height} label={label}>{label}</Placeholder>;
  return (
    <Suspense fallback={<Placeholder height={height} label={label}>Loading the map…</Placeholder>}>
      <MapCanvas points={points} lines={lines} height={height} label={label} />
    </Suspense>
  );
}

/**
 * Shop, drop point and the rider's last reported GPS position for one order, with a straight
 * line for the leg the rider is on (to the shop before pickup, to the drop after). The line is
 * the direct distance, not a road route.
 */
export function OrderMap({ track, shopName = 'Shop', dropLabel = 'Delivery address', height }) {
  const { shop, drop, riderPos, stage } = track;
  const rider = riderPos && stage !== 'DELIVERED' && !(riderPos.lat === shop?.lat && riderPos.lng === shop?.lng && !ON_THE_ROAD.includes(stage)) ? riderPos : null;
  const points = useMemo(
    () =>
      [
        shop && { id: 'shop', kind: 'shop', lat: shop.lat, lng: shop.lng, label: shopName },
        drop && { id: 'drop', kind: 'drop', lat: drop.lat, lng: drop.lng, label: dropLabel },
        rider && { id: 'rider', kind: 'rider', lat: rider.lat, lng: rider.lng, label: 'Rider, last reported position' },
      ].filter(Boolean),
    [shop?.lat, shop?.lng, drop?.lat, drop?.lng, rider?.lat, rider?.lng, shopName, dropLabel], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const target = ON_THE_ROAD.includes(stage) ? drop : shop;
  const lines = useMemo(() => (rider && target ? [[rider, target]] : null), [rider?.lat, rider?.lng, target?.lat, target?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const where = !rider ? 'no rider position yet' : ON_THE_ROAD.includes(stage) ? `the rider ${(track.distanceM / 1000).toFixed(1)} km away` : 'the rider heading to the shop';
  return <TrackMap points={points} lines={lines} height={height} label={`Map: ${shopName}, ${dropLabel.toLowerCase()} and ${where}`} />;
}
