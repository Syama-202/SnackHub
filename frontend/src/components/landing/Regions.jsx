import { Link } from 'react-router-dom';
import SnackArt from '../ui/SnackArt';
import { AssetImage } from '../ui/SnackImage';
import Carousel from '../ui/Carousel';
import { Icon, SectionTitle } from '../ui';
import { REGIONS } from '../../constants/catalog';
import { useReveal } from '../../hooks';

export default function Regions() {
  const ref = useReveal();
  return (
    <section id="regions" ref={ref} className="mx-auto max-w-7xl scroll-mt-24 px-4 py-24">
      <SectionTitle eyebrow="Regional collections" title="India, One Snack at a Time." sub="Little bites. Big regional stories." />
      <div className="mt-10">
        <Carousel label="Regional collections">
          {REGIONS.map((r, i) => (
            <Link key={r.id} to={`/shop?region=${encodeURIComponent(r.id)}`} className="reveal group lift relative flex w-[78%] shrink-0 snap-start flex-col overflow-hidden rounded-[26px] bg-white shadow-[0_10px_30px_rgba(31,41,55,0.08)] sm:w-[44%] lg:w-[30%]" style={{ transitionDelay: `${i * 60}ms` }} draggable={false}>
              <div className="relative h-56 overflow-hidden" style={{ background: `linear-gradient(135deg, ${r.accent}22, ${r.accent}55)` }}>
                <AssetImage
                  id={r.photo}
                  alt=""
                  sizes="(min-width: 1024px) 30vw, 78vw"
                  className="absolute inset-0"
                  imgClassName="block h-full w-full scale-105 object-cover transition-transform duration-[900ms] ease-[var(--ease-out-soft)] group-hover:scale-[1.18] group-hover:-rotate-2"
                  fallback={<SnackArt shape={r.art.shape} colors={r.art.colors} className="absolute inset-x-0 bottom-0 mx-auto w-[82%] transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3" />}
                />
                <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/35 to-transparent" aria-hidden="true" />
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
