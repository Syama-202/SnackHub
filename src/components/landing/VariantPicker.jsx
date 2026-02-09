import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SnackArt from '../SnackArt';
import { Button, SectionTitle, cx } from '../ui';
import { useReducedMotion } from '../../lib/hooks';

/** Section 5, "Pick your box": a radio group, not pinned (doc 22.9c). */
const VARIANTS = [
  { id: 'hot', label: 'Hot box', body: 'Mirchi bajji, punugulu and samosa, fried to order. Nearest shops only.', body2: 'Arrives within 3 km', face: '#E23744', band: '#FFC300', items: [['bajji', ['#E8A23A', '#3F7D20']], ['ball', ['#D98A2B', '#F4C26B']], ['samosa', ['#D8A04A', '#F1CF85']]], link: '/shop?cat=spicy' },
  { id: 'sweet', label: 'Sweet box', body: 'Boondi laddu, ariselu and Mysore pak, packed fresh by sweet houses.', body2: 'Travels up to 5 km', face: '#FFC300', band: '#E23744', items: [['ball', ['#F2A516', '#FFD36B']], ['disc', ['#8A4B1F', '#C98B4A']], ['square', ['#F0B43C', '#C47A1E']]], link: '/shop?cat=sweets' },
  { id: 'mixture', label: 'Mixture box', body: 'Murukku, chekkalu and atukula mixture for tea time and movie nights.', body2: 'Travels up to 5 km', face: '#FF7A00', band: '#1F2937', items: [['spiral', ['#D9A44E', '#B37A2E']], ['disc', ['#D9A441', '#7A9E3B']], ['pile', ['#E8C46A', '#B5462A']]], link: '/shop?cat=mixtures' },
];

export default function VariantPicker() {
  const [v, setV] = useState('hot');
  const reduced = useReducedMotion();
  const navigate = useNavigate();
  const cur = VARIANTS.find((x) => x.id === v);
  return (
    <section className="bg-gradient-to-b from-transparent via-sun/10 to-transparent py-24">
      <div className="mx-auto max-w-7xl px-4">
        <SectionTitle eyebrow="Pick your box" title="Hot, sweet or crunchy?" align="center" />
        <div className="mt-12 grid items-center gap-10 md:grid-cols-2">
          <div className="relative mx-auto grid aspect-square w-full max-w-md place-items-center" aria-hidden="true">
            <div className="relative h-[52%] w-[64%]" style={{ perspective: 900 }}>
              <div className={cx('absolute inset-0 rounded-[28px] transition-all duration-700', !reduced && 'animate-none')} style={{ background: `linear-gradient(135deg, ${cur.face}, ${shade(cur.face)})`, transform: 'rotateX(12deg) rotateY(-20deg)', boxShadow: `0 40px 80px ${cur.face}55` }}>
                <div className="absolute inset-x-[8%] top-[40%] h-[20%] rounded-lg transition-colors duration-700" style={{ background: cur.band }} />
              </div>
            </div>
            {cur.items.map(([shape, colors], i) => (
              <div key={`${v}-${i}`} className="absolute w-[34%] animate-pop-float" style={{ left: `${[2, 64, 34][i]}%`, top: `${[6, 2, -6][i]}%`, animationDelay: `${i * 0.08}s, ${0.7 + i * 0.5}s`, '--r': `${[-8, 10, 0][i]}deg` }}>
                <SnackArt shape={shape} colors={colors} plate={false} className="w-full drop-shadow-xl" />
              </div>
            ))}
          </div>
          <div>
            <div role="radiogroup" aria-label="Box type" className="grid gap-3">
              {VARIANTS.map((x) => (
                <label key={x.id} className={cx('flex cursor-pointer items-center gap-4 rounded-2xl border-2 bg-white p-4 transition', v === x.id ? 'border-orange shadow-lg' : 'border-transparent ring-1 ring-grey-800/10 hover:ring-orange/40')}>
                  <input type="radio" name="box" value={x.id} checked={v === x.id} onChange={() => setV(x.id)} className="h-5 w-5 accent-orange-deep" />
                  <span className="h-10 w-10 shrink-0 rounded-xl" style={{ background: x.face }} aria-hidden="true" />
                  <span>
                    <span className="block font-display text-xl font-bold">{x.label}</span>
                    <span className="block text-sm text-grey-600">{x.body}</span>
                    <span className="mt-1 block text-xs font-bold text-orange-text">{x.body2}</span>
                  </span>
                </label>
              ))}
            </div>
            <Button className="mt-6" size="lg" onClick={() => navigate(cur.link)}>Fill my {cur.label.toLowerCase()}</Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.round(c * 0.78));
  return `#${((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0')}`;
}
