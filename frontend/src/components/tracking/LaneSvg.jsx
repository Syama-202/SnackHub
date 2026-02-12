import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../../hooks';

/**
 * Side-view rider lane, SVG version (doc 10.5, 22.5). Driven only by the
 * server's stage and progress. Used on its own for low-end phones and reduced
 * motion, and as the fallback when WebGL is missing.
 */
const W = 1000;
const ROAD_Y = 92;
const X0 = 120;
const X1 = 860;

export default function LaneSvg({ stage = 'PLACED', progress = 0, height = 120, className = '' }) {
  const reduced = useReducedMotion();
  const target = stagePosition(stage, progress);
  const x = useDamped(target, reduced);
  const moving = stage === 'ON_THE_WAY' && !reduced;
  const atShop = ['PLACED', 'ACCEPTED', 'PACKING', 'PACKED'].includes(stage);
  const boxOnScooter = ['PICKED_UP', 'ON_THE_WAY', 'ARRIVED'].includes(stage);
  return (
    <svg viewBox={`0 0 ${W} 130`} className={className} style={{ height, width: '100%' }} preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <defs>
        <linearGradient id="lane-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1F2937" />
          <stop offset="1" stopColor="#111827" />
        </linearGradient>
        <linearGradient id="lane-hero" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFC300" />
          <stop offset=".55" stopColor="#FF7A00" />
          <stop offset="1" stopColor="#E23744" />
        </linearGradient>
        <pattern id="lane-dash" width="60" height="6" patternUnits="userSpaceOnUse">
          <rect width="30" height="4" rx="2" fill="#FFC300" opacity=".55" />
        </pattern>
      </defs>
      <rect width={W} height="130" fill="url(#lane-sky)" rx="0" />
      {/* skyline */}
      {[60, 180, 300, 430, 560, 690, 800, 920].map((bx, i) => (
        <rect key={bx} x={bx} y={40 + (i % 3) * 10} width={50 + (i % 2) * 20} height={60} fill="#fff" opacity=".04" rx="4" />
      ))}
      <rect x="0" y={ROAD_Y} width={W} height="38" fill="#0B1220" />
      <rect x="0" y={ROAD_Y + 16} width={W + 60} height="6" fill="url(#lane-dash)" className={moving ? 'animate-road' : undefined} />

      {/* shop */}
      <g transform={`translate(${X0 - 90} 30)`}>
        <rect x="0" y="16" width="86" height="46" rx="6" fill="#FF7A00" />
        <path d="M-4 18 L43 0 L90 18 Z" fill="#E23744" />
        <rect x="10" y="30" width="26" height="32" fill="#FFF6E6" rx="2" />
        <rect x="46" y="28" width="30" height="18" fill="#FFE29A" rx="2" />
        <text x="43" y="13" fontSize="10" fontWeight="800" textAnchor="middle" fill="#fff">SHOP</text>
      </g>
      {/* house */}
      <g transform={`translate(${X1 + 22} 32)`}>
        <rect x="0" y="22" width="70" height="40" rx="4" fill="#F3F4F6" />
        <path d="M-6 24 L35 0 L76 24 Z" fill="#9CA3AF" />
        <rect x="26" y="36" width="18" height="26" rx="2" fill="#FF7A00" />
        <g transform="translate(56 30)" className={stage === 'ARRIVED' && !reduced ? 'animate-bell' : ''}>
          <circle r="7" fill="#FFC300" />
          <path d="M-3 -1 a3 3 0 0 1 6 0 v3 h-6z" fill="#1F2937" />
        </g>
      </g>

      {/* box at the shop before pickup */}
      {atShop && (
        <g transform={`translate(${X0 + 8} ${ROAD_Y - 24})`}>
          <rect width="26" height="20" rx="3" fill={stage === 'PLACED' || stage === 'ACCEPTED' ? 'none' : 'url(#lane-hero)'} stroke="#FFC300" strokeWidth="2" strokeDasharray={stage === 'PLACED' || stage === 'ACCEPTED' ? '4 3' : '0'} className={stage === 'PACKING' && !reduced ? 'animate-bump' : ''} />
          {stage === 'PACKED' && <circle cx="13" cy="10" r="20" fill="#FFC300" opacity=".18" />}
        </g>
      )}

      {/* scooter + rider */}
      <g transform={`translate(${x} ${ROAD_Y - 6})`}>
        <ellipse cx="0" cy="8" rx="36" ry="5" fill="#000" opacity=".35" />
        <Wheel cx={-22} spin={moving} />
        <Wheel cx={22} spin={moving} />
        <path d="M-28 -6 h40 l10 -14 h8" stroke="#FF7A00" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <rect x="-30" y="-12" width="30" height="10" rx="5" fill="#FF7A00" />
        {/* rider */}
        <circle cx="-6" cy="-44" r="8" fill="#F3F4F6" />
        <path d="M-12 -48 a8 8 0 0 1 14 -4 l2 6 z" fill="#E23744" />
        <path d="M-12 -36 l-4 22 h16 l6 -14 l10 -4" stroke="#FFC300" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {boxOnScooter && <rect x="-46" y="-34" width="24" height="22" rx="3" fill="url(#lane-hero)" stroke="#fff" strokeWidth="1.5" />}
      </g>

      {stage === 'DELIVERED' && !reduced && <Confetti x={X1 + 40} />}
    </svg>
  );
}

function Wheel({ cx, spin }) {
  return (
    <g transform={`translate(${cx} 0)`}>
      <circle r="9" fill="#111827" stroke="#9CA3AF" strokeWidth="3" />
      <g className={spin ? 'animate-wheel' : undefined} style={{ transformOrigin: 'center', transformBox: 'fill-box' }}>
        <path d="M-6 0 H6 M0 -6 V6" stroke="#9CA3AF" strokeWidth="1.5" />
      </g>
    </g>
  );
}

function Confetti({ x }) {
  const bits = Array.from({ length: 18 }, (_, i) => i);
  return (
    <g transform={`translate(${x} 40)`}>
      {bits.map((i) => (
        <rect key={i} x={(i - 9) * 7} y={-((i * 13) % 30)} width="5" height="9" rx="1" fill={['#FFC300', '#FF7A00', '#E23744', '#fff'][i % 4]} className="animate-pop" style={{ animationDelay: `${i * 30}ms`, transform: `rotate(${i * 40}deg)`, transformBox: 'fill-box' }} />
      ))}
    </g>
  );
}

export function stagePosition(stage, progress) {
  if (['ON_THE_WAY', 'PICKED_UP'].includes(stage)) return X0 + (X1 - X0) * progress;
  if (['ARRIVED', 'DELIVERED'].includes(stage)) return X1;
  return X0 + 60;
}

/** Smooth the 5 second location steps so the scooter glides (damping). */
function useDamped(target, reduced) {
  const [x, setX] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    if (reduced) {
      cur.current = target;
      setX(target);
      return;
    }
    let raf;
    let last = performance.now();
    const step = (t) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      cur.current += (target - cur.current) * (1 - Math.exp(-2.5 * dt));
      setX(cur.current);
      if (Math.abs(target - cur.current) > 0.3) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced]);
  return x;
}
