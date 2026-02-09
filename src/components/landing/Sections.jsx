import { useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SnackArt from '../SnackArt';
import LoopVideo from '../LoopVideo';
import { Button, Icon, SectionTitle, Pill, cx } from '../ui';
import { REGIONS, MOODS } from '../../lib/catalogMeta';
import ProductCard, { ProductCardSkeleton } from '../ProductCard';
import { useNearbyProducts } from '../../lib/useCatalog';
import { useReveal } from '../../lib/hooks';
import { PROMISE_WORDING } from '../../domain/promise';

/** Horizontal scroller with arrows, mouse drag and touch swipe. */
function Carousel({ children, label }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const by = (dir) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });
  return (
    <div className="relative">
      <div
        ref={ref}
        role="region"
        aria-label={label}
        tabIndex={0}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-4 focus-visible:outline-none"
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse') return;
          drag.current = { x: e.clientX, left: ref.current.scrollLeft, moved: false };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dx = e.clientX - drag.current.x;
          if (Math.abs(dx) > 4) drag.current.moved = true;
          ref.current.style.scrollSnapType = 'none';
          ref.current.scrollLeft = drag.current.left - dx;
        }}
        onPointerUp={() => {
          if (ref.current) ref.current.style.scrollSnapType = '';
          setTimeout(() => (drag.current = null), 0);
        }}
        onPointerLeave={() => {
          if (ref.current) ref.current.style.scrollSnapType = '';
          drag.current = null;
        }}
        onClickCapture={(e) => drag.current?.moved && e.preventDefault()}
      >
        {children}
      </div>
      <div className="mt-2 hidden justify-end gap-2 md:flex">
        <button onClick={() => by(-1)} aria-label="Previous" className="grid h-11 w-11 place-items-center rounded-full bg-white shadow ring-1 ring-grey-800/10 hover:bg-sun"><Icon name="arrowLeft" /></button>
        <button onClick={() => by(1)} aria-label="Next" className="grid h-11 w-11 place-items-center rounded-full bg-white shadow ring-1 ring-grey-800/10 hover:bg-sun"><Icon name="arrowRight" /></button>
      </div>
    </div>
  );
}

export function RegionalDiscovery() {
  const ref = useReveal();
  return (
    <section id="regions" ref={ref} className="mx-auto max-w-7xl scroll-mt-24 px-4 py-24">
      <SectionTitle eyebrow="Regional collections" title="India, One Snack at a Time." sub="Little bites. Big regional stories." />
      <div className="mt-10">
        <Carousel label="Regional collections">
          {REGIONS.map((r, i) => (
            <Link key={r.id} to={`/shop?region=${encodeURIComponent(r.id)}`} className="reveal group lift relative flex w-[78%] shrink-0 snap-start flex-col overflow-hidden rounded-[26px] bg-white shadow-[0_10px_30px_rgba(31,41,55,0.08)] sm:w-[44%] lg:w-[30%]" style={{ transitionDelay: `${i * 60}ms` }} draggable={false}>
              <div className="relative h-52 overflow-hidden" style={{ background: `linear-gradient(135deg, ${r.accent}22, ${r.accent}55)` }}>
                <SnackArt shape={r.art.shape} colors={r.art.colors} className="absolute inset-x-0 bottom-0 mx-auto w-[82%] transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3" />
                <span className="absolute left-4 top-4 h-1.5 w-12 rounded-full" style={{ background: r.accent }} />
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h3 className="font-display text-2xl font-bold">{r.id}</h3>
                <p className="mt-1 text-grey-600">{r.blurb}</p>
                <p className="mt-2 text-sm font-semibold text-grey-800">{r.snacks}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-extrabold text-orange-text">Explore collection <Icon name="arrowRight" className="h-4 w-4 transition group-hover:translate-x-1" /></span>
              </div>
            </Link>
          ))}
        </Carousel>
      </div>
    </section>
  );
}

export function Bestsellers() {
  const { items: data, isLoading } = useNearbyProducts();
  const list = (data || []).filter((p) => p.bestseller || p.trending).sort((a, b) => b.rating - a.rating).slice(0, 10);
  return (
    <section className="mx-auto max-w-7xl px-4 py-24">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionTitle eyebrow="Bestsellers near you" title="The Snacks Everyone's Talking About." />
        <Link to="/shop?sort=bestsellers" className="font-extrabold text-orange-text">See all</Link>
      </div>
      <div className="mt-8">
        <Carousel label="Bestsellers">
          {isLoading && Array.from({ length: 4 }, (_, i) => <div key={i} className="w-[70%] shrink-0 sm:w-[40%] lg:w-[23%]"><ProductCardSkeleton /></div>)}
          {list.map((p) => (
            <div key={p.id} className="w-[70%] shrink-0 snap-start sm:w-[40%] lg:w-[23%]">
              <ProductCard product={p} className="h-full" />
            </div>
          ))}
        </Carousel>
      </div>
    </section>
  );
}

export function DeliveryStory() {
  const ref = useReveal();
  const steps = [
    { n: 1, title: 'Choose your favourite regional snacks', body: 'From verified shops that can reach you in time.', icon: 'cart' },
    { n: 2, title: 'Your order gets prepared', body: 'Hot snacks are fried when a rider is close. Sweets are packed fresh.', icon: 'box' },
    { n: 3, title: 'Your snacks arrive at your doorstep', body: 'Share your delivery code at the door and enjoy.', icon: 'home' },
  ];
  return (
    <section id="delivery" ref={ref} className="scroll-mt-24 bg-sun py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-grey-800">How delivery works</p>
          <h2 className="mt-2 text-[clamp(2.2rem,5vw,3.8rem)] font-extrabold leading-[1.02] text-grey-800">Craving Now? We're Already on Our Way.</h2>
          <div className="mt-8 flex items-end gap-3">
            <span className="font-display text-[clamp(5rem,14vw,9rem)] font-extrabold leading-[0.8] text-grey-800">25</span>
            <span className="pb-3 font-display text-3xl font-extrabold text-red-text">to 30<br />MIN</span>
          </div>
          <p className="mt-4 max-w-md text-sm text-grey-800">{PROMISE_WORDING} A shop that cannot reach you in time is simply not shown.</p>
        </div>
        <div className="relative min-w-0">
          <svg viewBox="0 0 400 60" className="absolute -top-8 left-0 hidden w-full lg:block" aria-hidden="true">
            <path d="M10 40 C 120 0, 280 70, 390 20" stroke="#1F2937" strokeWidth="3" strokeDasharray="8 10" fill="none" opacity=".35" />
          </svg>
          <ol className="grid gap-4">
            {steps.map((s, i) => (
              <li key={s.n} className="reveal flex items-start gap-4 rounded-[22px] bg-white/80 p-5 shadow-lg" style={{ transitionDelay: `${i * 120}ms` }}>
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-orange text-grey-800"><Icon name={s.icon} className="h-6 w-6" /></span>
                <span>
                  <span className="block text-xs font-extrabold text-red-text">STEP {s.n}</span>
                  <span className="block font-display text-xl font-bold text-grey-800">{s.title}</span>
                  <span className="block text-grey-600">{s.body}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="pointer-events-none mt-6 overflow-hidden rounded-full bg-white/50 py-2" aria-hidden="true">
            <div className="flex w-max animate-marquee items-center gap-6 px-4">
              {Array.from({ length: 2 }).map((_, k) => (
                <span key={k} className="flex items-center gap-6">
                  <Icon name="scooter" className="h-7 w-7 text-grey-800" />
                  <span className="font-display font-bold text-grey-800">Illustration only. Live tracking appears on your order page.</span>
                  <Icon name="box" className="h-6 w-6 text-red-text" />
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function MoodTiles() {
  const navigate = useNavigate();
  const ref = useReveal();
  return (
    <section ref={ref} className="mx-auto max-w-7xl px-4 py-24">
      <SectionTitle eyebrow="Personalised discovery" title="What's Your Mood Today?" />
      <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {MOODS.map((m, i) => (
          <button key={m.id} onClick={() => navigate(`/shop?mood=${m.id}`)} className={cx('reveal group lift relative flex min-h-44 flex-col justify-between overflow-hidden rounded-[26px] bg-gradient-to-br p-5 text-left ring-1 ring-grey-800/5', m.tint)} style={{ transitionDelay: `${i * 50}ms` }}>
            <span className="relative z-10 max-w-[70%] font-display text-[clamp(1.25rem,2.4vw,1.9rem)] font-extrabold leading-tight text-grey-800">{m.label}</span>
            <span className="relative z-10 inline-flex items-center gap-1 text-sm font-extrabold text-orange-text">Show me <Icon name="arrowRight" className="h-4 w-4 transition group-hover:translate-x-1" /></span>
            <LoopVideo id={`mood-${m.id}`} label={m.label} className="absolute inset-0 -z-0 opacity-90" fallback={<SnackArt shape={m.art.shape} colors={m.art.colors} plate={false} className="absolute -bottom-4 -right-4 w-[58%] transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6" />} />
          </button>
        ))}
      </div>
    </section>
  );
}

export function Editorial() {
  const ref = useReveal();
  const stories = [
    { tag: 'Andhra Pradesh', title: 'Why Andhra snacks are known for bold flavours', body: 'Guntur grows some of India’s hottest chillies, and its snack stalls wear that heat with pride.', art: { shape: 'bajji', colors: ['#E8A23A', '#3F7D20'] } },
    { tag: 'Tamil Nadu', title: 'The art of making traditional murukku', body: 'Rice flour, a brass press and a steady hand: the spiral is the whole skill.', art: { shape: 'spiral', colors: ['#D9A44E', '#B37A2E'] } },
    { tag: 'Across India', title: 'The difference between regional mixtures', body: 'Flattened rice in Andhra, bhujia in Rajasthan, puffed rice in Bengal: same idea, different soul.', art: { shape: 'pile', colors: ['#E8C46A', '#B5462A'] } },
    { tag: 'Festivals', title: 'Snacks that bring families together', body: 'Ariselu at Sankranti, ghewar at Teej, laddus at every celebration in between.', art: { shape: 'disc', colors: ['#8A4B1F', '#C98B4A'] } },
  ];
  return (
    <section ref={ref} className="mx-auto max-w-7xl px-4 py-24">
      <SectionTitle eyebrow="Regional stories" title="Every Region Has a Flavour. Every Snack Has a Story." />
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {stories.map((s, i) => (
          <article key={s.title} className={cx('reveal grid items-center gap-4 sm:grid-cols-[0.9fr_1fr]', i % 2 && 'md:translate-y-12')} style={{ transitionDelay: `${i * 80}ms` }}>
            <div className="rounded-[26px] bg-gradient-to-br from-[#FFF1D6] to-[#FFDCCB] p-4">
              <SnackArt shape={s.art.shape} colors={s.art.colors} className="w-full" />
            </div>
            <div>
              <Pill tone="orange">{s.tag}</Pill>
              <h3 className="mt-2 font-display text-2xl font-bold leading-tight">{s.title}</h3>
              <p className="mt-2 text-grey-600">{s.body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function Offers() {
  const navigate = useNavigate();
  const offers = [
    { title: 'First order', body: 'Free delivery on your first order (demo offer).', badge: 'New here' },
    { title: 'Regional combo packs', body: 'Three cities, one box of favourites.', badge: 'Combo' },
    { title: 'Tea-time bundles', body: 'Murukku, chekkalu and biscuits for the 5 pm craving.', badge: 'Bundle' },
    { title: 'Festive collections', body: 'Ariselu, laddu and ghewar for the season.', badge: 'Festive' },
  ];
  return (
    <section id="offers" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-12">
      <div className="relative overflow-hidden rounded-[32px] bg-primary p-8 sm:p-12">
        <div className="absolute -right-16 -top-16 h-72 w-72 rounded-full bg-white/25 blur-2xl" aria-hidden="true" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 className="text-[clamp(2rem,4.5vw,3.4rem)] font-extrabold leading-[1.02] text-grey-800">More Crunch. More Joy. Better Deals.</h2>
            <p className="mt-3 text-grey-800">Demo offers for this preview. Prices are always checked at checkout.</p>
            <Button variant="dark" size="lg" className="mt-6" onClick={() => navigate('/shop?sort=bestsellers')}>Shop offers</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {offers.map((o) => (
              <div key={o.title} className="glass glass-strong p-5">
                <Pill tone="red">{o.badge}</Pill>
                <h3 className="mt-2 font-display text-xl font-bold">{o.title}</h3>
                <p className="text-sm text-grey-600">{o.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function OrderNow() {
  const navigate = useNavigate();
  return (
    <section className="mx-auto max-w-4xl px-4 pb-8 pt-20 text-center">
      <h2 className="text-[clamp(2.2rem,5vw,3.6rem)] font-extrabold leading-[1.02]">Hungry yet? <span className="text-gradient">Let's fix that.</span></h2>
      <p className="mx-auto mt-3 max-w-xl text-lg text-grey-600">See what the shops near you are frying, packing and plating right now.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button size="lg" onClick={() => navigate('/shop')}>Show snacks near me</Button>
        <Button size="lg" variant="ghost" onClick={() => navigate('/shop?cat=sweets')}>Just the sweets</Button>
      </div>
    </section>
  );
}
