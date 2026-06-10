import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m, useScroll, useTransform } from 'motion/react';
import { AssetImage } from '../ui/SnackImage';
import RotatingWords from '../ui/RotatingWords';
import { readyIds } from '../../utils/assets';
import { useReducedMotion } from '../../hooks';

const PHRASES = ['fried to order.', 'packed fresh.', 'from verified shops.', 'at your door in 25 to 30 min.'];
const nameOf = (id) => id.slice(6).split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

/**
 * The shop page banner: the brand gradient, a headline with a rotating phrase, live counts
 * on glass chips, and a wheel of snack photos that turns as you scroll while the centre
 * photo changes every few seconds. Only images marked ready are used (AI illustrations).
 */
export default function Spotlight({ eyebrow, title, shops, snacks, fastest, children }) {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const ids = useMemo(() => readyIds('snack-'), []);
  const ring = ids.slice(0, 8);
  const [i, setI] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const turn = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const lift = useTransform(scrollYProgress, [0, 1], [0, -60]);
  // each photo turns back by the same amount, so it stays upright while the wheel turns
  const upright = useTransform(turn, (r) => -r);

  useEffect(() => {
    if (reduced || ids.length < 2) return undefined;
    const t = setInterval(() => setI((n) => (n + 1) % ids.length), 3200);
    return () => clearInterval(t);
  }, [reduced, ids.length]);

  return (
    <section ref={ref} className="bg-hero relative isolate overflow-hidden rounded-[28px] px-5 py-6 shadow-glass sm:rounded-[32px] sm:px-10 sm:py-10" aria-labelledby="spotlight-title">
      {/* light sheen and a soft shadow pool for depth */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/30 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-32 right-1/3 h-80 w-80 rounded-full bg-red/40 blur-3xl" aria-hidden="true" />

      <div className="relative grid items-center gap-6 sm:gap-8 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white/35 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.16em] text-grey-900 backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-grey-900" /> {eyebrow}
          </p>
          <h1 id="spotlight-title" className="mt-4 text-[clamp(2.4rem,5.6vw,4.4rem)] font-extrabold leading-[0.95] text-grey-900">
            {title}
            <span className="mt-3 block">
              <span className="inline-block -rotate-1 rounded-2xl bg-red-strong px-3 py-1.5 text-[0.5em] font-bold text-white shadow-[0_10px_30px_-10px_rgba(196,34,47,0.8)] sm:px-4">
                <RotatingWords words={PHRASES} />
              </span>
            </span>
          </h1>
          <div className="mt-5 grid grid-cols-3 gap-2 sm:mt-6 sm:flex sm:flex-wrap">
            {[
              [shops, shops === 1 ? 'shop near you' : 'shops near you'],
              [snacks, snacks === 1 ? 'snack to pick from' : 'snacks to pick from'],
              fastest ? [`${fastest} min`, 'fastest delivery'] : null,
            ]
              .filter(Boolean)
              .map(([n, label]) => (
                <span key={label} className="rounded-2xl border border-white/60 bg-white/45 px-2.5 py-2 backdrop-blur-md xs:px-3 sm:px-4 sm:py-2.5">
                  <span className="block whitespace-nowrap font-display text-lg font-extrabold leading-none text-grey-900 xs:text-xl sm:text-2xl">{n ?? '–'}</span>
                  <span className="mt-1 block text-[0.75rem] font-bold leading-tight text-grey-800 sm:text-xs">{label}</span>
                </span>
              ))}
          </div>
          {children && <div className="mt-6">{children}</div>}
        </div>

        {ids.length > 0 && (
          <div className="relative mx-auto aspect-square w-full max-w-[15.625rem] sm:max-w-[23.75rem]" aria-hidden="true">
            {/* the wheel turns with the scroll; each photo stays upright */}
            <m.div className="absolute inset-0" style={reduced ? undefined : { rotate: turn, y: lift }}>
              {ring.map((id, k) => {
                const a = (k / ring.length) * Math.PI * 2;
                return (
                  <m.div
                    key={id}
                    className="absolute h-[22%] w-[22%] overflow-hidden rounded-full border-[3px] border-white/80 shadow-lg"
                    style={{ left: `${39 + Math.cos(a) * 40}%`, top: `${39 + Math.sin(a) * 40}%`, rotate: reduced ? 0 : upright }}
                  >
                    <AssetImage id={id} sizes="96px" className="block h-full w-full" imgClassName="block h-full w-full scale-125 object-cover" />
                  </m.div>
                );
              })}
            </m.div>
            <div className="absolute inset-[18%] overflow-hidden rounded-full border-[6px] border-white/85 bg-white/40 shadow-2xl">
              <AnimatePresence mode="popLayout" initial={false}>
                <m.div
                  key={ids[i]}
                  className="absolute inset-0"
                  initial={reduced ? false : { opacity: 0, scale: 1.15, rotate: -8 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.92, rotate: 6 }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                >
                  <AssetImage id={ids[i]} sizes="300px" className="block h-full w-full" imgClassName="block h-full w-full object-cover" />
                </m.div>
              </AnimatePresence>
            </div>
            <span className="absolute bottom-[6%] left-1/2 -translate-x-1/2 rounded-full bg-grey-900/80 px-3 py-1 text-xs font-bold text-white backdrop-blur">{nameOf(ids[i])}</span>
          </div>
        )}
      </div>
    </section>
  );
}
