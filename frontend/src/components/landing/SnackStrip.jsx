import { AssetImage } from '../ui/SnackImage';
import { readyIds } from '../../utils/assets';

/** Two rows of snack photos sliding in opposite directions (doc 22.3, subtle floating food). */
export default function SnackStrip() {
  const ids = readyIds('snack-');
  if (ids.length < 4) return null;
  const name = (id) => id.slice(6).split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  const row = (list, reverse) => (
    <div className="flex w-max animate-marquee gap-4 pr-4 hover:[animation-play-state:paused]" style={{ animationDuration: '38s', animationDirection: reverse ? 'reverse' : 'normal' }}>
      {[...list, ...list].map((id, i) => (
        <span key={i} className="flex shrink-0 items-center gap-3 rounded-full bg-white py-2 pl-2 pr-5 shadow-[0_8px_24px_rgba(31,41,55,0.08)] ring-1 ring-grey-800/5">
          <AssetImage id={id} alt="" sizes="64px" className="block h-14 w-14 overflow-hidden rounded-full" imgClassName="block h-full w-full scale-125 object-cover" />
          <span className="font-display text-lg font-bold text-grey-800">{name(id)}</span>
        </span>
      ))}
    </div>
  );
  const half = Math.ceil(ids.length / 2);
  return (
    <section className="relative overflow-hidden py-10" aria-label="Snacks on SnackHub (AI illustrations)">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-cream to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-cream to-transparent" />
      <div className="grid -rotate-1 gap-4">
        {row(ids.slice(0, half), false)}
        {row(ids.slice(half).concat(ids.slice(0, 2)), true)}
      </div>
    </section>
  );
}
