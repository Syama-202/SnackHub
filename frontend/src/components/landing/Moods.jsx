import { useNavigate } from 'react-router-dom';
import SnackArt from '../ui/SnackArt';
import LoopVideo from '../ui/LoopVideo';
import { AssetImage } from '../ui/SnackImage';
import { Icon, SectionTitle, cx } from '../ui';
import { MOODS } from '../../constants/catalog';
import { useReveal } from '../../hooks';

/** Round photo peeking from the tile corner; turns and grows on hover. */
function MoodPicture({ mood }) {
  const art = <SnackArt shape={mood.art.shape} colors={mood.art.colors} plate={false} className="absolute -bottom-4 -right-4 w-[min(58%,10rem)] transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6" />;
  return (
    <AssetImage
      id={mood.photo}
      alt=""
      sizes="240px"
      className="absolute -bottom-10 -right-10 block aspect-square w-[min(62%,11rem)] overflow-hidden rounded-full shadow-[0_20px_40px_rgba(31,41,55,0.25)] ring-[6px] ring-white/80 transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:-translate-x-2 group-hover:-translate-y-2 group-hover:rotate-12 group-hover:scale-110"
      imgClassName="block h-full w-full scale-125 object-cover"
      fallback={art}
    />
  );
}

export default function Moods() {
  const navigate = useNavigate();
  const ref = useReveal();
  return (
    <section ref={ref} className="page py-24">
      <SectionTitle eyebrow="Personalised discovery" title="What's Your Mood Today?" />
      <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {MOODS.map((m, i) => (
          <button key={m.id} onClick={() => navigate(`/shop?mood=${m.id}`)} className={cx('reveal group lift relative flex min-h-44 flex-col justify-between overflow-hidden rounded-[26px] bg-gradient-to-br p-5 text-left ring-1 ring-grey-800/5', m.tint)} style={{ transitionDelay: `${i * 50}ms` }}>
            <span className="relative z-10 max-w-[70%] sm:max-w-[60%] font-display text-[clamp(1.25rem,2.4vw,1.9rem)] font-bold leading-tight text-grey-800">{m.label}</span>
            <span className="relative z-10 inline-flex items-center gap-1 text-sm font-bold text-orange-text">Show me <Icon name="arrowRight" className="h-4 w-4 transition group-hover:translate-x-1" /></span>
            <LoopVideo id={`mood-${m.id}`} label={m.label} className="absolute inset-0 -z-0 opacity-90" fallback={<MoodPicture mood={m} />} />
          </button>
        ))}
      </div>
    </section>
  );
}
