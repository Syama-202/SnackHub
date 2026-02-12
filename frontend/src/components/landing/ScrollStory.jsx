import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import SnackArt from '../ui/SnackArt';
import { AssetImage } from '../ui/SnackImage';
import { Button, Icon } from '../ui';
import { useReducedMotion } from '../../hooks';

/**
 * Scroll-driven showcase (master prompt part 7, doc 22.9c). The stage is CSS-sticky, so
 * scrolling is never taken over, and scrolling back reverses every step. The photo opens
 * from a small circle while it turns and settles, the background warms from cream to
 * yellow and orange, short labels appear at timed moments, and at the end the photo
 * steps aside for a shopping button. With reduced motion these are plain sections.
 */
const CHAPTERS = [
  {
    id: 'hot',
    eyebrow: 'Hot stays hot',
    title: 'Fried when your rider is on the way.',
    body: 'Hot snacks travel at most 3 km, about a 12 minute ride. The shop starts cooking only when a rider has accepted and is close, so your samosa is still crackling at the door.',
    stats: [['3 km', 'range for hot snacks'], ['12 min', 'longest ride'], ['1', 'order per rider']],
    image: 'showcase-hot-still',
    alt: 'Samosas with green chutney and onions (AI illustration)',
    art: { shape: 'samosa', colors: ['#D8A04A', '#F1CF85'] },
    labels: [['Fried to order', 6, 18], ['Rider already close', 64, 8], ['Max 3 km away', 70, 78], ['Still crackling', 0, 70]],
    colors: ['#FFF9EF', '#FFE7A3', '#FFC98F'],
    cta: ['See what is frying near you', '/shop'],
  },
  {
    id: 'sweet',
    eyebrow: 'Sweets travel further',
    title: 'Packed fresh, built for the ride.',
    body: 'Sweets and dry snacks can come from up to 5 km away, about a 20 minute ride, so you get the sweet house across town, not just the shop next door.',
    stats: [['5 km', 'range for sweets and dry'], ['20 min', 'longest ride'], ['2', 'orders per rider']],
    image: 'showcase-sweet-still',
    alt: 'A table of jalebi, murukku, laddu, mixture and sweets (AI illustration)',
    art: { shape: 'spiral', colors: ['#F28C1B', '#FFC94D'] },
    labels: [['Packed fresh', 4, 14], ['Up to 5 km', 66, 10], ['20 min ride', 70, 80], ['Two orders, one rider', -2, 74]],
    colors: ['#FFF9EF', '#FFE3E0', '#FFD9A6'],
    cta: ['Shop sweets', '/shop?cat=sweets'],
  },
];

export default function ScrollStory() {
  const reduced = useReducedMotion();
  const root = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (reduced) return;
    let ctx;
    let alive = true;
    (async () => {
      const { gsap } = await import('gsap');
      const { ScrollTrigger } = await import('gsap/ScrollTrigger');
      if (!alive || !root.current) return;
      gsap.registerPlugin(ScrollTrigger);
      ctx = gsap.context(() => {
        root.current.querySelectorAll('[data-chapter]').forEach((el) => {
          const colors = JSON.parse(el.dataset.colors);
          const q = (s) => el.querySelectorAll(s);
          const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top top', end: 'bottom bottom', scrub: 0.7 } });
          tl.fromTo(q('[data-stage]'), { backgroundColor: colors[0] }, { backgroundColor: colors[1], duration: 0.5, ease: 'none' }, 0)
            .to(q('[data-stage]'), { backgroundColor: colors[2], duration: 0.5, ease: 'none' }, 0.5)
            .fromTo(q('[data-frame]'), { clipPath: 'circle(18% at 50% 50%)' }, { clipPath: 'circle(72% at 50% 50%)', duration: 0.55, ease: 'power2.out' }, 0)
            .fromTo(q('[data-photo]'), { scale: 1.45, rotate: -14 }, { scale: 1, rotate: 0, duration: 0.7, ease: 'power2.out' }, 0)
            .fromTo(q('[data-line]'), { y: 50, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.07, duration: 0.25 }, 0.04)
            .fromTo(q('[data-stat]'), { y: 30, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.05, duration: 0.2 }, 0.3);
          q('[data-label]').forEach((l, i) => {
            tl.fromTo(l, { opacity: 0, scale: 0.6, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 0.12, ease: 'back.out(2)' }, 0.25 + i * 0.12);
          });
          tl.to(q('[data-visual]'), { xPercent: -6, scale: 0.92, duration: 0.2 }, 0.8).fromTo(q('[data-cta]'), { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.15 }, 0.82);
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
        <section key={c.id} data-chapter data-colors={JSON.stringify(c.colors)} className={reduced ? '' : 'relative h-[260vh]'} aria-labelledby={`ch-${c.id}`}>
          <div data-stage className={`${reduced ? '' : 'sticky top-0 h-[100dvh]'} flex items-center overflow-hidden`} style={{ backgroundColor: c.colors[reduced ? 1 : 0] }}>
            <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-16 md:grid-cols-[1fr_1.1fr]">
              <div className="relative z-10">
                <p data-line className="text-sm font-extrabold uppercase tracking-[0.16em] text-orange-text">{c.eyebrow}</p>
                <h2 id={`ch-${c.id}`} data-line className="mt-3 text-[clamp(2.4rem,5.4vw,4.4rem)] font-extrabold leading-[1]">{c.title}</h2>
                <p data-line className="mt-5 max-w-lg text-lg text-grey-800/80">{c.body}</p>
                <dl className="mt-8 grid max-w-md grid-cols-3 gap-3">
                  {c.stats.map(([v, l]) => (
                    <div data-stat key={l} className="rounded-2xl bg-white/70 p-3 text-center shadow-sm ring-1 ring-white">
                      <dt className="sr-only">{l}</dt>
                      <dd className="font-display text-3xl font-extrabold text-grey-800">{v}</dd>
                      <dd className="text-xs font-semibold text-grey-600">{l}</dd>
                    </div>
                  ))}
                </dl>
                <div data-cta className="mt-8">
                  <Button variant="dark" onClick={() => navigate(c.cta[1])}>{c.cta[0]} <Icon name="arrowRight" className="h-4 w-4" /></Button>
                </div>
              </div>
              <div data-visual className="relative mx-auto aspect-square w-[min(100%,540px)]">
                <div data-frame className="absolute inset-0 overflow-hidden rounded-full shadow-[0_40px_100px_rgba(122,42,0,0.3)]" style={reduced ? undefined : { clipPath: 'circle(18% at 50% 50%)' }}>
                  <div data-photo className="h-full w-full will-change-transform">
                    <AssetImage id={c.image} alt={c.alt} sizes="(min-width: 768px) 540px, 90vw" fallback={<SnackArt shape={c.art.shape} colors={c.art.colors} plate className="h-full w-full" />} />
                  </div>
                </div>
                {c.labels.map(([text, x, y]) => (
                  <span key={text} data-label className="absolute whitespace-nowrap rounded-full bg-white px-4 py-2 text-sm font-extrabold text-grey-800 shadow-[0_12px_30px_rgba(31,41,55,0.18)]" style={{ left: `${x}%`, top: `${y}%` }}>
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-orange align-middle" aria-hidden="true" />
                    {text}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
