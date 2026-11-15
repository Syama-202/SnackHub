import SnackArt from '../ui/SnackArt';
import { AssetImage } from '../ui/SnackImage';
import { SectionTitle, Pill, cx } from '../ui';
import { useReveal } from '../../hooks';

export default function Stories() {
  const ref = useReveal();
  const stories = [
    { id: 'story-andhra-bold-flavours', tag: 'Andhra Pradesh', title: 'Why Andhra snacks are known for bold flavours', body: 'Guntur grows some of India’s hottest chillies, and its snack stalls wear that heat with pride.', art: { shape: 'bajji', colors: ['#E8A23A', '#3F7D20'] } },
    { id: 'story-art-of-murukku', tag: 'Tamil Nadu', title: 'The art of making traditional murukku', body: 'Rice flour, a brass press and a steady hand: the spiral is the whole skill.', art: { shape: 'spiral', colors: ['#D9A44E', '#B37A2E'] } },
    { id: 'story-regional-mixtures', tag: 'Across India', title: 'The difference between regional mixtures', body: 'Flattened rice in Andhra, bhujia in Rajasthan, puffed rice in Bengal: same idea, different soul.', art: { shape: 'pile', colors: ['#E8C46A', '#B5462A'] } },
    { id: 'story-festival-snacks', tag: 'Festivals', title: 'Snacks that bring families together', body: 'Ariselu at Sankranti, ghewar at Teej, laddus at every celebration in between.', art: { shape: 'disc', colors: ['#8A4B1F', '#C98B4A'] } },
  ];
  return (
    <section ref={ref} className="page py-24">
      <SectionTitle eyebrow="Regional stories" title="Every Region Has a Flavour. Every Snack Has a Story." />
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {stories.map((s, i) => (
          <article key={s.title} className={cx('reveal grid items-center gap-4 sm:grid-cols-[0.9fr_1fr]', i % 2 && 'md:translate-y-12')} style={{ transitionDelay: `${i * 80}ms` }}>
            <AssetImage
              id={s.id}
              alt=""
              sizes="(min-width: 768px) 22vw, 90vw"
              className="reveal-mask block aspect-[4/5] overflow-hidden rounded-[26px]"
              imgClassName="parallax block h-full w-full object-cover"
              fallback={
                <div className="rounded-[26px] bg-gradient-to-br from-[#FFF1D6] to-[#FFDCCB] p-4">
                  <SnackArt shape={s.art.shape} colors={s.art.colors} className="w-full" />
                </div>
              }
            />
            <div>
              <Pill tone="orange">{s.tag}</Pill>
              <h3 className="mt-2 font-display text-2xl font-semibold leading-tight">{s.title}</h3>
              <p className="mt-2 text-grey-600">{s.body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
