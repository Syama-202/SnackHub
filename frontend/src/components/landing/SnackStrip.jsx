import { useState } from 'react';
import { AssetImage } from '../ui/SnackImage';
import { Icon, cx } from '../ui';
import { readyIds } from '../../utils/assets';
import { useReducedMotion } from '../../hooks';

/**
 * Two rows of snack photos sliding in opposite directions (doc 22.3, subtle floating food).
 * The owner wants this strip to keep moving even with reduced motion on, so there it slides
 * at half speed instead of stopping, and a pause button stops it (WCAG 2.2.2); hovering or
 * focusing a row pauses it too.
 */
export default function SnackStrip() {
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const ids = readyIds('snack-');
  if (ids.length < 4) return null;
  const name = (id) => id.slice(6).split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  const seconds = Math.max(28, ids.length * 2.4) * (reduced ? 2 : 1);
  const row = (list, reverse) => (
    <div
      className="marquee-always flex w-max gap-4 pr-4 hover:[animation-play-state:paused] focus-within:[animation-play-state:paused]"
      style={{ '--marquee-dur': `${seconds}s`, animationDirection: reverse ? 'reverse' : 'normal', animationPlayState: paused ? 'paused' : 'running' }}
    >
      {[...list, ...list].map((id, i) => (
        <span key={i} className="flex shrink-0 items-center gap-3 rounded-full border border-white/90 bg-white/80 py-2 pl-2 pr-5 shadow-[0_10px_28px_-10px_rgba(226,55,68,0.35)] backdrop-blur-sm">
          <AssetImage id={id} alt="" sizes="64px" className="block h-14 w-14 overflow-hidden rounded-full" imgClassName="block h-full w-full scale-125 object-cover" />
          <span className="font-display text-lg font-bold text-grey-800">{name(id)}</span>
        </span>
      ))}
    </div>
  );
  const half = Math.ceil(ids.length / 2);
  return (
    <section className="relative overflow-hidden py-10" aria-label="Snacks on SnackHub (AI illustrations)">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[#FFF4E4] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[#FFF4E4] to-transparent" />
      <div className="grid -rotate-1 gap-4">
        {row(ids.slice(0, half), false)}
        {row(ids.slice(half).concat(ids.slice(0, 2)), true)}
      </div>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-pressed={paused}
        className={cx('absolute bottom-2 right-4 z-20 inline-flex h-9 items-center gap-1.5 rounded-full border border-white/80 bg-white/80 px-3 text-xs font-bold text-grey-800 shadow-sm backdrop-blur transition hover:bg-white')}
      >
        <Icon name={paused ? 'play' : 'pause'} className="h-3.5 w-3.5" />
        {paused ? 'Play' : 'Pause'} snacks
      </button>
    </section>
  );
}
