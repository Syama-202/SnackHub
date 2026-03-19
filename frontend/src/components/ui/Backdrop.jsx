/**
 * The colourful page backdrop behind every screen: soft blobs of sun yellow, orange and red
 * with a little grain. The warm set fades and the rose set grows as the page scrolls (CSS
 * scroll timeline, static where it is not supported); the blobs drift unless motion is reduced.
 */
const WARM = [
  { c: 'rgba(255, 195, 0, 0.55)', s: '46vmax', x: '68%', y: '-14%', a: 'blob-a 26s' },
  { c: 'rgba(255, 122, 0, 0.38)', s: '40vmax', x: '-12%', y: '8%', a: 'blob-b 30s' },
  { c: 'rgba(255, 214, 120, 0.5)', s: '30vmax', x: '30%', y: '48%', a: 'blob-a 34s' },
];
const ROSE = [
  { c: 'rgba(226, 55, 68, 0.26)', s: '44vmax', x: '62%', y: '58%', a: 'blob-b 28s' },
  { c: 'rgba(255, 140, 90, 0.4)', s: '36vmax', x: '-8%', y: '62%', a: 'blob-a 32s' },
];

const Blob = ({ c, s, x, y, a }) => (
  <i className="blob" style={{ background: `radial-gradient(circle, ${c}, transparent 70%)`, width: s, height: s, left: x, top: y, animation: `${a} ease-in-out infinite` }} />
);

export default function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="set warm">{WARM.map((b, i) => <Blob key={i} {...b} />)}</div>
      <div className="set rose">{ROSE.map((b, i) => <Blob key={i} {...b} />)}</div>
      <div className="grain" />
    </div>
  );
}
