import { memo, useId } from 'react';

/**
 * Illustrative snack render (stand-in for the AI cut-outs in doc 25.4).
 * One SVG per shape so the catalogue looks consistent and never shows a
 * broken image. Labelled "AI illustration placeholder" through imageAlt.
 */
function SnackArtImpl({ shape = 'ball', colors = ['#E8A23A', '#F4C26B'], title, className = '', plate = true }) {
  const uid = useId().replace(/:/g, '');
  const [a, b] = colors;
  const g = `g${uid}`;
  const h = `h${uid}`;
  return (
    <svg viewBox="0 0 200 160" className={className} role="img" aria-label={title ? `${title} (illustration)` : 'Snack illustration'}>
      <defs>
        <radialGradient id={g} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="35%" stopColor={a} />
          <stop offset="100%" stopColor={shade(a, -28)} />
        </radialGradient>
        <linearGradient id={h} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={b} />
          <stop offset="100%" stopColor={shade(b, -22)} />
        </linearGradient>
      </defs>
      {plate && (
        <>
          <ellipse cx="100" cy="128" rx="78" ry="18" fill="#000" opacity="0.10" />
          <ellipse cx="100" cy="122" rx="82" ry="20" fill="#E9EBEE" />
          <ellipse cx="100" cy="119" rx="70" ry="15" fill="#F7F8FA" />
        </>
      )}
      <Shape shape={shape} g={g} h={h} a={a} b={b} />
    </svg>
  );
}

function Shape({ shape, g, h, a, b }) {
  switch (shape) {
    case 'bajji':
      return (
        <g>
          {[[-18, 0], [18, 6]].map(([dx, dy], i) => (
            <g key={i} transform={`translate(${dx} ${dy}) rotate(${i ? 14 : -10} 100 95)`}>
              <path d="M52 100 C 60 70, 130 62, 150 82 C 156 90, 148 100, 136 101 C 110 104, 80 112, 58 110 C 50 109, 48 104, 52 100 Z" fill={`url(#${g})`} />
              {[70, 88, 106, 124].map((x) => <circle key={x} cx={x} cy={93 - (x - 70) * 0.12} r="4" fill="#fff" opacity="0.18" />)}
              <path d="M150 82 C 160 74, 166 70, 172 60" stroke={b} strokeWidth="5" strokeLinecap="round" fill="none" />
            </g>
          ))}
        </g>
      );
    case 'samosa':
      return (
        <g>
          {[[-26, 6, -8], [24, 2, 10]].map(([dx, dy, r], i) => (
            <g key={i} transform={`translate(${dx} ${dy}) rotate(${r} 100 90)`}>
              <path d="M100 48 Q 106 48 110 56 L 140 108 Q 143 116 134 117 L 66 117 Q 57 116 60 108 L 90 56 Q 94 48 100 48 Z" fill={`url(#${g})`} />
              <path d="M100 52 L 100 114" stroke={shade(a, -30)} strokeWidth="2" opacity="0.35" />
              {[64, 76, 88, 100, 112, 124, 136].map((x) => <path key={x} d={`M${x} 115 l 3 -5`} stroke={shade(a, -35)} strokeWidth="2" opacity="0.4" />)}
            </g>
          ))}
        </g>
      );
    case 'spiral':
      return (
        <g>
          {[[72, 92, 30], [128, 96, 26]].map(([cx, cy, r], i) => (
            <g key={i}>
              <path d={spiralPath(cx, cy, r, 3.2)} stroke={`url(#${g})`} strokeWidth="9" strokeLinecap="round" fill="none" />
              <path d={spiralPath(cx, cy, r, 3.2)} stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.25" transform="translate(-1.5 -2)" />
            </g>
          ))}
        </g>
      );
    case 'square':
      return (
        <g>
          {[[58, 74], [102, 70], [80, 92]].map(([x, y], i) => (
            <g key={i}>
              <path d={`M${x} ${y + 10} L${x + 22} ${y} L${x + 44} ${y + 10} L${x + 22} ${y + 20} Z`} fill={shade(a, 18)} />
              <path d={`M${x} ${y + 10} L${x + 22} ${y + 20} L${x + 22} ${y + 40} L${x} ${y + 30} Z`} fill={a} />
              <path d={`M${x + 44} ${y + 10} L${x + 22} ${y + 20} L${x + 22} ${y + 40} L${x + 44} ${y + 30} Z`} fill={shade(a, -22)} />
              <path d={`M${x + 6} ${y + 10} L${x + 22} ${y + 4} L${x + 38} ${y + 10}`} stroke={b} strokeWidth="2.5" fill="none" opacity="0.7" />
            </g>
          ))}
        </g>
      );
    case 'disc':
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${i * 4 - 4} ${-i * 10})`}>
              <ellipse cx="100" cy="108" rx="54" ry="16" fill={shade(a, -24)} />
              <ellipse cx="100" cy="103" rx="54" ry="16" fill={`url(#${g})`} />
            </g>
          ))}
          {[[80, 82], [96, 78], [114, 84], [104, 90], [88, 90], [120, 78]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.4" fill={b} opacity="0.85" />)}
        </g>
      );
    case 'vada':
      return (
        <g>
          {[[76, 98], [126, 92]].map(([cx, cy], i) => (
            <g key={i}>
              <ellipse cx={cx} cy={cy + 5} rx="36" ry="17" fill={shade(a, -28)} />
              <ellipse cx={cx} cy={cy} rx="36" ry="17" fill={`url(#${g})`} />
              <ellipse cx={cx} cy={cy - 1} rx="10" ry="4.5" fill={shade(a, -40)} />
            </g>
          ))}
        </g>
      );
    case 'bun':
      return (
        <g>
          <ellipse cx="100" cy="110" rx="50" ry="12" fill={shade(b, 10)} />
          <path d="M54 104 Q 100 92 146 104 L 146 108 Q 100 118 54 108 Z" fill="#3F7D20" opacity="0.8" />
          <ellipse cx="100" cy="98" rx="44" ry="14" fill={shade(a, -10)} />
          <path d="M52 96 C 52 62, 148 62, 148 96 Q 100 104 52 96 Z" fill={`url(#${g})`} />
          {[[84, 76], [100, 72], [116, 77]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="3" ry="1.6" fill="#FFF7E0" opacity="0.9" />)}
        </g>
      );
    case 'pile':
      return (
        <g>
          {pileDots().map(([x, y, r, alt], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill={alt ? `url(#${h})` : `url(#${g})`} />
          ))}
        </g>
      );
    case 'wrap':
      return (
        <g>
          {[[56, 84, -6], [96, 80, 4], [74, 98, -2]].map(([x, y, r], i) => (
            <g key={i} transform={`rotate(${r} ${x + 24} ${y + 12})`}>
              <rect x={x} y={y} width="52" height="24" rx="10" fill={a} stroke={shade(a, -12)} strokeWidth="1.5" />
              {[8, 16, 24, 32, 40].map((d) => <path key={d} d={`M${x + d + 2} ${y + 3} q 2 9 0 18`} stroke={shade(a, -18)} strokeWidth="1" fill="none" opacity="0.6" />)}
              <rect x={x + 18} y={y + 9} width="16" height="6" rx="3" fill={b} opacity="0.75" />
            </g>
          ))}
        </g>
      );
    case 'biscuit':
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${i * 6 - 6} ${-i * 9})`}>
              <ellipse cx="100" cy="110" rx="46" ry="15" fill={shade(a, -24)} />
              <ellipse cx="100" cy="105" rx="46" ry="15" fill={`url(#${g})`} />
            </g>
          ))}
          {[[86, 86], [100, 82], [114, 86], [93, 92], [108, 92]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.8" fill={shade(b, -20)} />)}
        </g>
      );
    case 'roll':
      return (
        <g transform="rotate(-14 100 95)">
          <rect x="44" y="80" width="112" height="34" rx="17" fill={`url(#${g})`} />
          <ellipse cx="150" cy="97" rx="10" ry="17" fill={b} />
          <ellipse cx="150" cy="97" rx="6" ry="11" fill="#3F7D20" opacity="0.7" />
          {[64, 84, 104, 124].map((x) => <path key={x} d={`M${x} 83 q 4 14 0 28`} stroke={shade(a, -20)} strokeWidth="1.5" fill="none" opacity="0.5" />)}
        </g>
      );
    case 'chips':
      return (
        <g>
          {[[64, 92, -20], [94, 84, 10], [124, 94, 30], [80, 104, 50], [112, 106, -30], [100, 96, 80]].map(([x, y, r], i) => (
            <g key={i} transform={`rotate(${r} ${x} ${y})`}>
              <ellipse cx={x} cy={y} rx="20" ry="17" fill={`url(#${g})`} stroke={shade(a, -20)} strokeWidth="1.5" />
              <ellipse cx={x} cy={y} rx="9" ry="7" fill="none" stroke={shade(a, -14)} strokeWidth="1" opacity="0.5" />
            </g>
          ))}
        </g>
      );
    case 'ball':
    default:
      return (
        <g>
          {[[72, 98, 24], [124, 100, 24], [98, 78, 26]].map(([cx, cy, r], i) => (
            <g key={i}>
              <circle cx={cx} cy={cy} r={r} fill={`url(#${g})`} />
              <circle cx={cx - r * 0.35} cy={cy - r * 0.35} r={r * 0.22} fill="#fff" opacity="0.28" />
            </g>
          ))}
        </g>
      );
  }
}

function spiralPath(cx, cy, r, turns) {
  let d = '';
  const steps = 90;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * turns * Math.PI * 2;
    const rr = (r * i) / steps;
    const x = cx + rr * Math.cos(t);
    const y = cy + rr * Math.sin(t) * 0.62;
    d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  return d;
}

let pileCache;
function pileDots() {
  if (pileCache) return pileCache;
  const out = [];
  let s = 7;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 70; i++) {
    const ang = r() * Math.PI * 2;
    const rad = Math.sqrt(r());
    const x = 100 + Math.cos(ang) * rad * 58;
    const y = 104 + Math.sin(ang) * rad * 14 - (1 - rad) * 26;
    out.push([x, y, 4 + r() * 4, r() < 0.3]);
  }
  pileCache = out.sort((p, q) => p[1] - q[1]);
  return pileCache;
}

function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (pct / 100) * (pct > 0 ? 255 - c : c))));
  const r = f(n >> 16);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export default memo(SnackArtImpl);
