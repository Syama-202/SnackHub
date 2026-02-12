import { Icon } from '../ui';
import { useCountUp, useInView, useReducedMotion, useReveal } from '../../hooks';
import { PROMISE_WORDING } from '@shared/domain/promise';

export default function Delivery() {
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
            <CountTo value={25} className="font-display text-[clamp(5rem,14vw,9rem)] font-extrabold leading-[0.8] text-grey-800" />
            <span className="pb-3 font-display text-3xl font-extrabold text-red-text">to 30<br />MIN</span>
          </div>
          <p className="mt-4 max-w-md text-sm text-grey-800">{PROMISE_WORDING} A shop that cannot reach you in time is simply not shown.</p>
        </div>
        <div className="relative min-w-0">
          <RouteRide />
          <ol className="mt-4 grid gap-4">
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

/** Counts up to the number once it scrolls into view; reduced motion shows it at once. */
function CountTo({ value, className }) {
  const [ref, inView] = useInView('0px');
  const n = useCountUp(inView ? value : 0, 1200);
  return <span ref={ref} className={className}>{Math.round(n)}</span>;
}

/**
 * Shop to door, drawn as a route that inks itself in, with a scooter riding it on a loop.
 * An illustration only: real tracking lives on the order page (master prompt part 9).
 */
function RouteRide() {
  const reduced = useReducedMotion();
  const [ref, inView] = useInView('0px');
  const d = 'M40 110 C 120 20, 200 150, 280 70 S 420 40, 470 90';
  return (
    <div ref={ref} className="relative overflow-hidden rounded-[26px] bg-white/70 p-4 shadow-lg ring-1 ring-white" aria-hidden="true">
      <svg viewBox="0 0 510 150" className="w-full">
        <path d={d} stroke="#1F2937" strokeOpacity=".12" strokeWidth="14" fill="none" strokeLinecap="round" />
        <path id="route-line" d={d} stroke="#FF7A00" strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray="620" strokeDashoffset={inView || reduced ? 0 : 620} style={{ transition: 'stroke-dashoffset 1.6s cubic-bezier(.22,1,.36,1)' }} />
        <path d={d} stroke="#fff" strokeWidth="1.5" fill="none" strokeDasharray="6 10" />
        <g transform="translate(40 110)">
          <circle r="22" fill="#1F2937" />
          <path d="M-9 -2 h18 v10 h-18z M-11 -2 l3 -7 h16 l3 7" stroke="#FFC300" strokeWidth="2.4" fill="none" strokeLinejoin="round" />
        </g>
        <g transform="translate(470 90)">
          <circle r="22" fill="#E23744" />
          <path d="M-10 2 L0 -8 L10 2 M-7 0 v9 h14 v-9" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinejoin="round" />
        </g>
        <g>
          <circle r="17" fill="#FFC300" stroke="#fff" strokeWidth="3" />
          <g stroke="#1F2937" strokeWidth="2" fill="none" strokeLinecap="round" transform="scale(.9) translate(-12 -12)">
            <circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><path d="M6 17h7l3-7h3M10 10h4" />
          </g>
          {!reduced && inView ? <animateMotion dur="5.5s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;0.82;1" calcMode="spline" keySplines=".45 0 .25 1;0 0 1 1"><mpath href="#route-line" /></animateMotion> : <animateMotion dur="0.01s" fill="freeze" keyPoints="1;1" keyTimes="0;1"><mpath href="#route-line" /></animateMotion>}
        </g>
      </svg>
      <div className="mt-1 flex justify-between px-1 text-xs font-extrabold text-grey-600">
        <span>Verified shop</span>
        <span>Your door</span>
      </div>
    </div>
  );
}
