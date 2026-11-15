import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { AssetImage } from '../ui/SnackImage';
import { Icon, Pill, SectionTitle } from '../ui';
import { readyAsset } from '../../utils/assets';
import { useNearbyProducts, useNearbySellers } from '../../hooks/useCatalog';
import { useReveal } from '../../hooks';

const SHOWN = 4;

/**
 * Street carts and home kitchens near the delivery point: the bandi that fries mirchi bajji
 * and punugulu all evening, and the home cook whose ariselu sell out before Sankranti.
 */
export default function Streets() {
  const ref = useReveal();
  const sellers = useNearbySellers();
  const { items: products } = useNearbyProducts();
  const bySeller = useMemo(() => {
    const m = new Map();
    for (const p of products) m.set(p.sellerId, [...(m.get(p.sellerId) || []), p]);
    return m;
  }, [products]);
  const stalls = sellers.filter((s) => s.kind === 'stall').slice(0, SHOWN);
  const homes = sellers.filter((s) => s.kind === 'home').slice(0, SHOWN);
  if (!stalls.length && !homes.length) return null;

  const card = (s, tone) => {
    const menu = bySeller.get(s.id) || [];
    const photo = menu.map((p) => `snack-${p.slug}`).find((id) => readyAsset(id));
    const w = s.promise.HOT?.serviceable ? s.promise.HOT.window : s.promise.AMBIENT.window;
    return (
      <Link key={s.id} to={`/shop/${s.id}`} className="reveal surface glow group flex min-w-0 items-center gap-3 p-3 xs:gap-4 xs:p-3.5">
        <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-hero xs:h-20 xs:w-20">
          {photo ? (
            <AssetImage id={photo} alt="" sizes="80px" className="absolute inset-0" imgClassName="block h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
          ) : (
            <span className="grid h-full w-full place-items-center font-display text-3xl font-bold text-grey-900">{s.shopName[0]}</span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="line-clamp-2 font-display text-lg font-semibold leading-tight text-grey-900">{s.shopName}</span>
          </span>
          <span className="mt-1 flex flex-wrap gap-1">
            {menu.slice(0, 3).map((p) => (
              <Pill key={p.id} tone={tone}>{p.title}</Pill>
            ))}
          </span>
          <span className="mt-1.5 block text-sm text-grey-600">{s.distanceKm} km · {w[0]} to {w[1]} min</span>
        </span>
        <Icon name="arrowRight" className="h-5 w-5 shrink-0 text-orange-text transition group-hover:translate-x-1" />
      </Link>
    );
  };

  return (
    <section id="street-food" ref={ref} className="page scroll-mt-24 py-24">
      <SectionTitle
        eyebrow="Street carts and home kitchens"
        title="From the Bandi and the Home Kitchen."
        sub="The evening mirchi bajji cart, the punugulu stall by the bus stand, and the home cook whose ariselu sell out before every festival. Verified like every shop on SnackHub."
      />
      <div className="mt-10 grid gap-6 lg:grid-cols-2 lg:items-start">
        {stalls.length > 0 && (
          <div className="bg-hero relative min-w-0 overflow-hidden rounded-[30px] p-5 shadow-glass sm:p-6">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/25 blur-3xl" aria-hidden="true" />
            <div className="relative flex items-center justify-between gap-3">
              <h3 className="font-display text-2xl font-bold text-grey-900">Street stalls</h3>
              <Link to="/shop?kind=stall" className="rounded-full bg-white/70 px-4 py-2 text-sm font-bold text-grey-900 backdrop-blur transition hover:bg-white">See all</Link>
            </div>
            <p className="relative mt-1 text-sm font-semibold text-grey-900/80">Fried to order at the cart, sent out hot.</p>
            <div className="relative mt-5 grid gap-3">{stalls.map((s) => card(s, 'red'))}</div>
          </div>
        )}
        {homes.length > 0 && (
          <div className="relative min-w-0 overflow-hidden rounded-[30px] border border-white/80 bg-white/55 p-5 shadow-glass backdrop-blur-md sm:p-6">
            <div className="pointer-events-none absolute -left-16 -bottom-16 h-56 w-56 rounded-full bg-sun/40 blur-3xl" aria-hidden="true" />
            <div className="relative flex items-center justify-between gap-3">
              <h3 className="font-display text-2xl font-bold text-grey-900">Home kitchens</h3>
              <Link to="/shop?kind=home" className="chip-on rounded-full px-4 py-2 text-sm font-bold">See all</Link>
            </div>
            <p className="relative mt-1 text-sm font-semibold text-grey-600">Made at home in small batches, the way grandmothers make them.</p>
            <div className="relative mt-5 grid gap-3">{homes.map((s) => card(s, 'green'))}</div>
          </div>
        )}
      </div>
    </section>
  );
}
