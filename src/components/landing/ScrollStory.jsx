import { useEffect, useRef } from 'react';
import SnackArt from '../SnackArt';
import { useReducedMotion } from '../../lib/hooks';

/**
 * Pinned story, sections 2 and 3 of doc 22.9c. GSAP ScrollTrigger is used on
 * this page only (decision register). The stage is CSS-sticky, so scrolling is
 * never taken over; with reduced motion these are plain sections.
 */
const CHAPTERS = [
  {
    id: 'hot',
    eyebrow: 'Hot stays hot',
    title: 'Fried when your rider is on the way.',
    body: 'Hot snacks travel at most 3 km, about a 12 minute ride. The shop starts cooking only when a rider has accepted and is close, so your mirchi bajji is still crackling at the door.',
    stats: [['3 km', 'range for hot snacks'], ['12 min', 'longest ride'], ['1', 'order per rider']],
    art: { shape: 'bajji', colors: ['#E8A23A', '#3F7D20'] },
    bg: 'from-[#FFF4DA] to-[#FFD9B8]',
  },
  {
    id: 'sweet',
    eyebrow: 'Sweets travel further',
    title: 'Packed fresh, built for the ride.',
    body: 'Sweets and dry snacks can come from up to 5 km away, about a 20 minute ride, so you get the Ariselu house across town, not just the shop next door.',
    stats: [['5 km', 'range for sweets and dry'], ['20 min', 'longest ride'], ['2', 'orders per rider']],
    art: { shape: 'spiral', colors: ['#F28C1B', '#FFC94D'] },
    bg: 'from-[#FFF0D0] to-[#FFE3E0]',
  },
];

export default function ScrollStory() {
  const reduced = useReducedMotion();
  const root = useRef(null);

  useEffect(() => {
    if (reduced) return;
    let ctx;
    let alive = true;
    (async () => {
      const { gsap } = await import('gsap');
      const { ScrollTrigger } = await import('gsap/ScrollTrigger');
      if (!alive) return;
      gsap.registerPlugin(ScrollTrigger);
      ctx = gsap.context(() => {
        root.current.querySelectorAll('[data-chapter]').forEach((el) => {
          const art = el.querySelector('[data-art]');
          const copy = el.querySelectorAll('[data-line]');
          const stats = el.querySelectorAll('[data-stat]');
          const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top top', end: 'bottom bottom', scrub: 0.6 } });
          tl.fromTo(art, { scale: 0.7, rotate: -18, xPercent: 20 }, { scale: 1.35, rotate: 6, xPercent: 0, ease: 'none' }, 0)
            .fromTo(copy, { y: 40, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.08, duration: 0.3 }, 0.05)
            .fromTo(stats, { y: 30, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.06, duration: 0.25 }, 0.35);
        });
      }, root);
    })();
    return () => {
      alive = false;
      ctx?.revert();
    };
  }, [reduced]);

  return (
    <div ref={root}>
      {CHAPTERS.map((c) => (
        <section key={c.id} data-chapter className={reduced ? '' : 'relative h-[220vh]'} aria-labelledby={`ch-${c.id}`}>
          <div className={`${reduced ? '' : 'sticky top-0 h-[100dvh]'} flex items-center overflow-hidden bg-gradient-to-br ${c.bg}`}>
            <div className="mx-auto grid w-full max-w-7xl items-center gap-8 px-4 py-16 md:grid-cols-2">
              <div>
                <p data-line className="text-sm font-extrabold uppercase tracking-[0.16em] text-orange-deep">{c.eyebrow}</p>
                <h2 id={`ch-${c.id}`} data-line className="mt-3 text-[clamp(2.2rem,5vw,4rem)] font-extrabold leading-[1.02]">{c.title}</h2>
                <p data-line className="mt-4 max-w-lg text-lg text-grey-600">{c.body}</p>
                <dl className="mt-8 grid max-w-md grid-cols-3 gap-3">
                  {c.stats.map(([v, l]) => (
                    <div data-stat key={l} className="glass glass-strong p-3 text-center">
                      <dt className="sr-only">{l}</dt>
                      <dd className="font-display text-3xl font-extrabold text-grey-800">{v}</dd>
                      <dd className="text-xs font-semibold text-grey-600">{l}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="relative grid place-items-center">
                <div className="absolute h-[70%] w-[70%] rounded-full bg-white/50 blur-2xl" aria-hidden="true" />
                <div data-art className="relative w-[80%] max-w-md">
                  <SnackArt shape={c.art.shape} colors={c.art.colors} plate={c.id === 'sweet'} className="w-full drop-shadow-2xl" />
                </div>
              </div>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
