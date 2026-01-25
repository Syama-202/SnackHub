import { useState } from 'react';
import { SectionTitle, cx, Icon } from '../../components/ui';

/**
 * Section 4, "Every shop is checked" (doc 22.9c, 16.4). Hotspots are real
 * buttons, reachable by keyboard, and each opens a text card that works
 * without any 3D.
 */
const SPOTS = [
  { id: 'licence', short: 'Licence', x: 26, y: 30, title: 'Food licence checked', body: 'Every shop gives a licence or registration number. An admin looks it up on the regulator’s public register before the shop goes live, and a job suspends the shop the day it expires.' },
  { id: 'kitchen', short: 'Kitchen', x: 72, y: 26, title: 'Kitchen and storage seen', body: 'Photos or a short video of the kitchen and storage, and a call or visit for larger shops. An admin also places a test order and checks the packaging.' },
  { id: 'score', short: 'Quality score', x: 30, y: 72, title: 'Quality score, every day', body: 'Ratings, complaints, on-time packing and cancellations make a score out of 100. Below 70 warns the shop, below 60 limits its reach, below 50 suspends it.' },
  { id: 'probation', short: 'Probation', x: 74, y: 70, title: 'New shops start on probation', body: 'A new shop gets a smaller delivery radius and a “New” badge, and an admin sees every complaint about it straight away. A safety complaint hides the shop at once.' },
];

export default function ProductHotspots() {
  const [active, setActive] = useState('licence');
  const spot = SPOTS.find((s) => s.id === active);
  return (
    <section id="checked" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-24">
      <SectionTitle eyebrow="Every shop is checked" title="We screen shops. We keep watching them." sub="We cannot taste every batch, so we check who cooks, where, and how it is going. Tap a point on the box." />
      <div className="mt-10 grid items-center gap-10 md:grid-cols-[1.1fr_1fr]">
        <div className="relative mx-auto aspect-square w-full max-w-lg">
          <div className="absolute inset-[12%] rounded-[36px] bg-hero shadow-[0_30px_80px_rgba(226,55,68,0.35)]" style={{ transform: 'perspective(900px) rotateX(14deg) rotateY(-18deg)' }}>
            <div className="absolute inset-x-[10%] top-[42%] h-[16%] rounded-xl bg-sun/90" />
            <p className="absolute inset-x-0 top-[44%] text-center font-display text-[clamp(1.2rem,3vw,2rem)] font-extrabold tracking-wider text-grey-800">SNACKHUB</p>
            <div className="absolute inset-x-[8%] top-[8%] h-[20%] rounded-2xl bg-white/25" />
          </div>
          {SPOTS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              aria-pressed={active === s.id}
              aria-label={s.title}
              className={cx('absolute grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full font-extrabold shadow-lg transition', active === s.id ? 'scale-110 bg-grey-800 text-white' : 'bg-white text-grey-800 hover:scale-105')}
              style={{ left: `${s.x}%`, top: `${s.y}%` }}
            >
              <span className={cx('absolute inset-0 rounded-full', active !== s.id && 'animate-ping bg-white/60')} aria-hidden="true" />
              <span className="relative">{i + 1}</span>
            </button>
          ))}
        </div>
        <div className="glass p-6 sm:p-8" aria-live="polite">
          <Icon name="shield" className="h-8 w-8 text-emerald-600" />
          <h3 className="mt-3 text-2xl font-extrabold">{spot.title}</h3>
          <p className="mt-2 text-grey-600">{spot.body}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {SPOTS.map((s, i) => (
              <button key={s.id} onClick={() => setActive(s.id)} className={cx('h-10 rounded-full px-4 text-sm font-bold transition', active === s.id ? 'bg-grey-800 text-white' : 'bg-white text-grey-800 ring-1 ring-grey-800/10')}>
                {i + 1}. {s.short}
              </button>
            ))}
          </div>
          <p className="mt-6 text-xs text-grey-600">Screening and monitoring reduce risk; they cannot guarantee every item.</p>
        </div>
      </div>
    </section>
  );
}
