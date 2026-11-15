import { useEffect, useState } from 'react';
import { TrackMap } from '../tracking/TrackMap';
import { SectionTitle } from '../ui';
import { useInView } from '../../hooks';

// An example order drawn on the real map; it does not move (an illustration, no live feed)
const SHOP = { lat: 12.9719, lng: 77.6412 };
const RIDER = { lat: 12.9686, lng: 77.6467 };
const DROP = { lat: 12.9641, lng: 77.6523 };
const POINTS = [
  { id: 'shop', kind: 'shop', ...SHOP, label: 'Example shop' },
  { id: 'drop', kind: 'drop', ...DROP, label: 'Example delivery address' },
  { id: 'rider', kind: 'rider', ...RIDER, label: 'Example rider position' },
];
const LINES = [[RIDER, DROP]];

/** Section 6, "Track your order": what the live map shows, on an example order. */
export default function TrackPreview() {
  // the map library loads only once this section is close to the screen
  const [ref, inView] = useInView('200px');
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (inView) setShown(true);
  }, [inView]);
  return (
    <section ref={ref} className="page py-24">
      <SectionTitle eyebrow="Track your order" title="Watch your rider on a real map." sub="Once a rider picks up your order, you see where their phone last reported them, the distance left and a time estimate, on every page." />
      <div className="mt-10 overflow-hidden rounded-[28px] bg-grey-900 p-3 shadow-2xl">
        <div className="flex items-center justify-between px-2 pb-3 pt-1 text-sm text-white">
          <span className="font-semibold">Rider is 4 minutes away · 1.0 km</span>
          <span className="rounded-full bg-sun px-2 py-0.5 text-[0.6875rem] font-bold uppercase text-grey-800">Example</span>
        </div>
        {shown ? <TrackMap points={POINTS} lines={LINES} height={320} label="Example map: a shop, a rider 1 km from the delivery address, and the address" /> : <div className="h-80 rounded-2xl bg-[#EEE9E0]" />}
      </div>
      <p className="mt-3 text-sm text-grey-600">Your delivery code unlocks when the rider is about 500 m away, and works only at your door.</p>
    </section>
  );
}
