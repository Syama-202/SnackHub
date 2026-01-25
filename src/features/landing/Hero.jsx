import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Button, Icon } from '../../components/ui';
import SnackArt from '../../components/SnackArt';
import { hasWebGL, prefersLite, useInView, useReducedMotion } from '../../lib/hooks';
import { useAddresses } from '../../lib/queries';
import { actions } from '../../store/web';
import { PROMISE_WORDING } from '../../domain/promise';

const HeroScene = lazy(() => import('./scene/HeroScene'));

/** Poster first: also the fallback without WebGL or with reduced motion (doc 22.9). */
export function HeroPoster({ className = '' }) {
  const ring = [
    { shape: 'spiral', colors: ['#D9A44E', '#B37A2E'], x: 6, y: 18, r: -10, s: 30 },
    { shape: 'bajji', colors: ['#E8A23A', '#3F7D20'], x: 62, y: 6, r: 12, s: 32 },
    { shape: 'samosa', colors: ['#D8A04A', '#F1CF85'], x: 70, y: 52, r: 8, s: 30 },
    { shape: 'ball', colors: ['#F2A516', '#FFD36B'], x: 2, y: 58, r: -6, s: 28 },
    { shape: 'spiral', colors: ['#F28C1B', '#FFC94D'], x: 36, y: 0, r: 4, s: 26 },
  ];
  return (
    <div className={`relative ${className}`} aria-hidden="true">
      <svg viewBox="0 0 300 260" className="absolute left-1/2 top-[54%] w-[58%] -translate-x-1/2 -translate-y-1/2 drop-shadow-2xl">
        <defs>
          <linearGradient id="hp-box" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F0434F" /><stop offset="1" stopColor="#C4222F" /></linearGradient>
        </defs>
        <ellipse cx="150" cy="232" rx="120" ry="16" fill="#7A2A00" opacity=".18" />
        <path d="M40 110 L150 80 L260 110 L260 210 L150 240 L40 210 Z" fill="url(#hp-box)" />
        <path d="M150 140 L150 240" stroke="#9E1B26" strokeWidth="2" />
        <path d="M40 110 L150 140 L260 110" fill="none" stroke="#9E1B26" strokeWidth="2" />
        <path d="M40 150 L150 180 L260 150 L260 172 L150 202 L40 172 Z" fill="#FFC300" />
        <text x="96" y="186" fontSize="18" fontWeight="800" fill="#1F2937" transform="skewY(15) translate(0 -40)">SNACKHUB</text>
        <path d="M150 140 L40 110 L20 60 L132 88 Z" fill="#FF5560" />
      </svg>
      {ring.map((r, i) => (
        <div key={i} className="pop float absolute" style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.s}%`, animationDelay: `${0.2 + i * 0.1}s, ${i * 0.4}s`, '--r': `${r.r}deg` }}>
          <SnackArt shape={r.shape} colors={r.colors} plate={false} className="w-full drop-shadow-xl" />
        </div>
      ))}
    </div>
  );
}

export default function Hero() {
  const reduced = useReducedMotion();
  const [ref, inView] = useInView('0px');
  const [ready, setReady] = useState(false);
  const live = !reduced && hasWebGL() && !prefersLite();
  return (
    <section ref={ref} className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <div className="absolute -left-40 top-10 h-[520px] w-[520px] rounded-full bg-sun/35 blur-3xl" />
        <div className="absolute -right-40 top-40 h-[520px] w-[520px] rounded-full bg-red/20 blur-3xl" />
      </div>
      <div className="mx-auto grid max-w-7xl items-center gap-6 px-4 py-8 lg:min-h-[calc(100dvh-110px)] lg:grid-cols-[1fr_1.1fr]">
        <div className="relative z-10 order-2 lg:order-1">
          <HeroCopy />
        </div>
        <div className="relative order-1 aspect-[5/4] w-full lg:order-2 lg:aspect-square">
          <HeroPoster className={`absolute inset-0 transition-opacity duration-700 ${live && ready ? 'opacity-0' : 'opacity-100'}`} />
          {live && (
            <Suspense fallback={null}>
              <div className={`absolute inset-0 transition-opacity duration-700 ${ready ? 'opacity-100' : 'opacity-0'}`}>
                <HeroScene active={inView} onReady={() => setTimeout(() => setReady(true), 200)} />
              </div>
            </Suspense>
          )}
          <span className="absolute bottom-2 right-2 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-grey-600">Stylised 3D, not actual products</span>
        </div>
      </div>
    </section>
  );
}

function HeroCopy() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const { data: addresses } = useAddresses();
  const [place, setPlace] = useState('');
  const go = (e) => {
    e.preventDefault();
    const hit = addresses?.find((a) => place && (a.line.toLowerCase().includes(place.toLowerCase()) || a.cityId.includes(place.toLowerCase())));
    if (hit) dispatch(actions.setAddress(hit.id));
    navigate('/shop');
  };
  return (
    <div className="glass max-w-xl p-6 sm:p-8">
      <p className="inline-flex items-center gap-2 rounded-full bg-grey-800 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-white">
        <span className="h-2 w-2 rounded-full bg-sun" /> Delivery in 25 to 30 min*
      </p>
      <h1 className="mt-4 text-[clamp(2.5rem,6vw,4.4rem)] font-extrabold leading-[0.98] text-grey-800">
        Your hometown cravings, <span className="text-gradient">hot at your door.</span>
      </h1>
      <p className="mt-4 max-w-md text-lg text-grey-600">India's regional snacks, from verified shops near you. Hot snacks fried to order, sweets packed fresh.</p>
      <form onSubmit={go} className="mt-6 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="hero-loc" className="sr-only">Enter your delivery location</label>
        <div className="relative flex-1">
          <Icon name="pin" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-orange-deep" />
          <input id="hero-loc" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Enter your delivery location" className="h-13 w-full rounded-full border border-grey-800/10 bg-white pl-11 pr-4 text-[15px] focus:border-orange focus:outline-none focus:ring-4 focus:ring-orange/15" />
        </div>
        <Button size="lg" type="submit">Show snacks near me</Button>
      </form>
      <p className="mt-2 text-xs text-grey-600">{user ? 'Try “Guntur”, “Vijayawada” or “Bengaluru” (demo addresses).' : 'Demo: browsing from Brodipet, Guntur.'}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button variant="dark" onClick={() => navigate('/shop')}>Explore snacks <Icon name="arrowRight" className="h-4 w-4" /></Button>
        <Button variant="ghost" onClick={() => document.getElementById('regions')?.scrollIntoView({ behavior: 'smooth' })}>Discover regional flavours</Button>
      </div>
      <p className="mt-4 text-[12px] leading-snug text-grey-600">*{PROMISE_WORDING}</p>
    </div>
  );
}
