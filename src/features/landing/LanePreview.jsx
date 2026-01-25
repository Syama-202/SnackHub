import { useEffect, useRef, useState } from 'react';
import LaneSvg from '../tracking/LaneSvg';
import { SectionTitle } from '../../components/ui';
import { distanceM, lerpPoint, clamp } from '../../domain/geo';
import { useInView } from '../../lib/hooks';

/**
 * Section 6, "Track your order": a preview of the rider lane with a demo
 * location feed, labelled as demo. It is driven by onLocation(lat, lng),
 * the same function the real socket event calls, and never by scroll.
 */
const SHOP = { lat: 16.3107, lng: 80.4335 };
const DROP = { lat: 16.3152, lng: 80.4301 + 0.012 };

export default function LanePreview() {
  const [ref, inView] = useInView('0px');
  const [state, setState] = useState({ stage: 'PACKED', progress: 0, distanceM: distanceM(SHOP, DROP), etaMin: 6 });
  const k = useRef(0);

  const onLocation = (lat, lng) => {
    const total = distanceM(SHOP, DROP);
    const remaining = distanceM({ lat, lng }, DROP);
    const progress = clamp(1 - remaining / total, 0, 1);
    const stage = remaining <= 150 ? 'ARRIVED' : 'ON_THE_WAY';
    setState({ stage, progress, distanceM: Math.round(remaining), etaMin: Math.max(1, Math.ceil(((remaining / 1000) * 1.3 * 60) / 20)) });
  };

  useEffect(() => {
    if (!inView) return;
    // demo feed: one "GPS ping" every 1.2 s, loops after arriving
    const t = setInterval(() => {
      k.current = k.current >= 1.25 ? 0 : k.current + 0.06;
      const p = lerpPoint(SHOP, DROP, Math.min(1, k.current));
      onLocation(p.lat, p.lng);
    }, 1200);
    return () => clearInterval(t);
  }, [inView]);

  return (
    <section ref={ref} className="mx-auto max-w-7xl px-4 py-24">
      <SectionTitle eyebrow="Track your order" title="A rider you can actually see." sub="During an order, the rider lane sits at the bottom of every page and moves only when the rider's real location moves." />
      <div className="mt-10 overflow-hidden rounded-[28px] bg-grey-900 shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-4 text-sm text-white">
          <span className="font-bold">{state.stage === 'ARRIVED' ? 'Your rider has reached' : `Rider is ${state.etaMin} min away · ${(state.distanceM / 1000).toFixed(1)} km`}</span>
          <span className="rounded-full bg-sun px-2 py-0.5 text-[11px] font-extrabold uppercase text-grey-800">Demo feed</span>
        </div>
        <LaneSvg stage={state.stage} progress={state.progress} height={150} />
      </div>
      <p className="mt-3 text-sm text-grey-600">Your delivery code unlocks when the rider is about 500 m away, and works only at your door.</p>
    </section>
  );
}
