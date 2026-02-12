import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Button, Icon, SplitWords } from '../ui';
import SnackArt from '../ui/SnackArt';
import { AssetImage } from '../ui/SnackImage';
import { useReducedMotion } from '../../hooks/uiHooks';
import { setAddress } from '../../store/slices/uiSlice';
import { PROMISE_WORDING } from '@shared/domain/promise';

/**
 * Hero (master prompt part 3, doc 22.3 and 22.4). A spread of snacks on a turning plate,
 * with single snacks that spring in around it and float. On scroll the plate turns and
 * zooms while the snacks drift apart, which hands over to the catalogue below. GSAP runs
 * on the landing page only (decision register); with reduced motion everything is still.
 */

// [asset, x %, y %, size %, start rotation, how far it drifts out on scroll]
const DISCS = [
  ['snack-jalebi', 2, 6, 26, -10, [-60, -40]],
  ['snack-samosa', 68, 0, 28, 8, [60, -50]],
  ['snack-banana-chips', 74, 60, 24, 12, [70, 40]],
  ['snack-murukku', 0, 60, 25, -6, [-70, 50]],
  ['snack-gongura-pakoda', 38, 82, 22, 4, [0, 70]],
];

// Floating curry leaves, chillies and peanuts (part 3, step 5)
const BITS = [
  { kind: 'leaf', x: 46, y: 4, s: 34, r: -30, d: 0 },
  { kind: 'chilli', x: 88, y: 22, s: 46, r: 40, d: 1.4 },
  { kind: 'peanut', x: 3, y: 97, s: 18, r: 10, d: 2.2 },
  { kind: 'leaf', x: 92, y: 74, s: 28, r: 120, d: 0.8 },
  { kind: 'peanut', x: 60, y: 12, s: 14, r: -20, d: 3 },
  { kind: 'chilli', x: 46, y: 94, s: 34, r: -60, d: 1.8 },
  { kind: 'peanut', x: 70, y: 88, s: 16, r: 30, d: 2.6 },
];

function Bit({ kind, className, style }) {
  if (kind === 'leaf') return <svg viewBox="0 0 40 20" className={className} style={style}><path d="M2 10 C 10 0, 30 0, 38 10 C 30 20, 10 20, 2 10 Z" fill="#3F7D20" /><path d="M4 10 H 36" stroke="#2D5A16" strokeWidth="1.2" /></svg>;
  if (kind === 'chilli') return <svg viewBox="0 0 60 20" className={className} style={style}><path d="M6 10 C 14 2, 40 2, 54 12 C 40 18, 16 18, 6 10 Z" fill="#D62839" /><path d="M2 8 C 4 6, 6 8, 8 9" stroke="#3F7D20" strokeWidth="3" strokeLinecap="round" fill="none" /></svg>;
  return <svg viewBox="0 0 20 28" className={className} style={style}><ellipse cx="10" cy="14" rx="8" ry="12" fill="#C98B4A" /><ellipse cx="10" cy="14" rx="4" ry="9" fill="#D9A46A" opacity=".6" /></svg>;
}

/** Drawn version: shown until the photo set exists, and if a photo fails. */
function PlateFallback() {
  return <SnackArt shape="pile" colors={['#E8C46A', '#B5462A']} plate className="h-full w-full" />;
}

export default function Hero() {
  const reduced = useReducedMotion();
  const root = useRef(null);

  // Scroll choreography: plate turns and zooms, snacks drift apart, copy eases back
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
        const st = { trigger: root.current, start: 'top top', end: 'bottom top', scrub: 0.8 };
        gsap.to('[data-plate]', { rotate: 38, scale: 1.18, ease: 'none', scrollTrigger: st });
        gsap.utils.toArray('[data-disc]').forEach((el) => {
          const [dx, dy] = JSON.parse(el.dataset.disc);
          gsap.to(el, { xPercent: dx, yPercent: dy, rotate: dx / 3, ease: 'none', scrollTrigger: st });
        });
        gsap.to('[data-copy]', { yPercent: -18, opacity: 0.25, ease: 'none', scrollTrigger: st });
        gsap.to('[data-bits]', { yPercent: -30, ease: 'none', scrollTrigger: st });
      }, root);
    })();
    return () => {
      alive = false;
      ctx?.revert();
    };
  }, [reduced]);

  return (
    <section ref={root} className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <div className="absolute -left-40 top-0 h-[560px] w-[560px] rounded-full bg-sun/30 blur-3xl" />
        <div className="absolute -right-32 top-32 h-[520px] w-[520px] rounded-full bg-orange/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-[300px] w-[600px] rounded-full bg-red/10 blur-3xl" />
      </div>
      <div data-bits className="pointer-events-none absolute inset-0 -z-0" aria-hidden="true">
        {BITS.map((b, i) => (
          <Bit key={i} kind={b.kind} className="absolute animate-drift opacity-80 drop-shadow" style={{ left: `${b.x}%`, top: `${b.y}%`, width: b.s, '--r': `${b.r}deg`, animationDelay: `${b.d}s` }} />
        ))}
      </div>
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-8 lg:min-h-[calc(100dvh-110px)] lg:grid-cols-[1fr_1.05fr]">
        <div data-copy className="relative z-10 order-2 lg:order-1">
          <HeroCopy />
        </div>
        <div className="relative order-1 mx-auto aspect-square w-[min(100%,560px)] lg:order-2">
          <div className="absolute inset-[6%] rounded-full bg-gradient-to-br from-sun/60 via-orange/40 to-red/30 blur-2xl" aria-hidden="true" />
          <div data-plate className="absolute inset-[10%] will-change-transform">
            <div className="h-full w-full animate-pop overflow-hidden rounded-full shadow-[0_40px_90px_rgba(122,42,0,0.35)] ring-[10px] ring-white/90">
              <AssetImage id="hero-poster" alt="A spread of Indian snacks: samosa, murukku, jalebi, banana chips and pakoda (AI illustration)" priority sizes="(min-width: 1024px) 560px, 90vw" imgClassName="block h-full w-full object-cover motion-safe:animate-spin-slow" fallback={<PlateFallback />} />
            </div>
          </div>
          {DISCS.map(([id, x, y, s, r, drift], i) => (
            <div key={id} data-disc={JSON.stringify(drift)} className="absolute will-change-transform" style={{ left: `${x}%`, top: `${y}%`, width: `${s}%` }}>
              <div className="aspect-square animate-pop-float overflow-hidden rounded-full shadow-[0_18px_40px_rgba(31,41,55,0.28)] ring-4 ring-white" style={{ animationDelay: `${0.35 + i * 0.12}s, ${1.1 + i * 0.35}s`, '--r': `${r}deg` }}>
                <AssetImage id={id} alt="" sizes="160px" imgClassName="block h-full w-full scale-125 object-cover" fallback={<div className="h-full w-full bg-gradient-to-br from-sun to-orange" />} />
              </div>
            </div>
          ))}
          <div className="glass glass-strong absolute bottom-[4%] left-1/2 flex -translate-x-1/2 animate-pop items-center gap-3 px-4 py-2.5 [animation-delay:1s]">
            <span className="relative grid h-9 w-9 place-items-center rounded-full bg-primary"><Icon name="scooter" className="h-5 w-5 text-grey-800" /></span>
            <span className="leading-tight">
              <span className="block whitespace-nowrap font-display text-lg font-extrabold text-grey-800 sm:text-xl">25 to 30 min</span>
              <span className="block text-[11px] font-semibold text-grey-600">estimated delivery*</span>
            </span>
          </div>
          <span className="absolute right-0 top-0 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-grey-600">AI illustrations, not actual products</span>
        </div>
      </div>
    </section>
  );
}

function HeroCopy() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const addresses = useSelector((state) => state.profile.addresses);
  const [place, setPlace] = useState('');
  const go = (e) => {
    e.preventDefault();
    const hit = addresses.find((a) => place && (a.line.toLowerCase().includes(place.toLowerCase()) || a.cityId.includes(place.toLowerCase())));
    if (hit) dispatch(setAddress(hit.id));
    navigate('/shop');
  };
  return (
    <div className="max-w-xl">
      <p className="inline-flex animate-pop items-center gap-2 rounded-full bg-grey-800 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-white">
        <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sun opacity-75" /><span className="relative h-2 w-2 rounded-full bg-sun" /></span>
        Fresh from verified shops near you
      </p>
      <h1 className="mt-5 text-[clamp(2.8rem,6.4vw,5.2rem)] font-extrabold leading-[0.95] text-grey-800">
        <SplitWords text="Your Hometown Cravings." className="block" />
        <SplitWords text="Delivered." className="block text-gradient pb-1" delay={280} />
      </h1>
      <p className="mt-5 max-w-md animate-rise text-lg text-grey-600 [animation-delay:450ms]">Discover India's regional snacks, delivered fresh to your doorstep. Hot snacks fried to order, sweets packed fresh.</p>
      <form onSubmit={go} className="mt-7 flex animate-rise [animation-delay:600ms] flex-col gap-2 rounded-[28px] bg-white p-2 shadow-[0_16px_40px_rgba(226,55,68,0.14)] ring-1 ring-grey-800/5 sm:flex-row sm:rounded-full">
        <label htmlFor="hero-loc" className="sr-only">Enter your delivery location</label>
        <div className="relative flex-1">
          <Icon name="pin" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-orange-text" />
          <input id="hero-loc" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Enter your delivery location" className="h-12 w-full rounded-full bg-transparent pl-11 pr-4 text-[15px] focus:outline-none" />
        </div>
        <Button size="lg" type="submit">Show snacks near me</Button>
      </form>
      <p className="mt-2 pl-2 text-xs text-grey-600">{user ? 'Try “Guntur”, “Vijayawada” or “Bengaluru” (demo addresses).' : 'Demo: browsing from Brodipet, Guntur.'}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="dark" onClick={() => navigate('/shop')}>Explore snacks <Icon name="arrowRight" className="h-4 w-4" /></Button>
        <Button variant="ghost" onClick={() => document.getElementById('regions')?.scrollIntoView({ behavior: 'smooth' })}>Discover regional flavours</Button>
      </div>
      <p className="mt-5 text-[12px] leading-snug text-grey-600">*{PROMISE_WORDING}</p>
    </div>
  );
}
