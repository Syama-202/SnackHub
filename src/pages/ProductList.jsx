import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useNearbyProducts, useNearbySellers } from '../lib/useCatalog';
import { CATEGORIES, MOODS, REGIONS } from '../lib/catalogMeta';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard';
import { Pill, Icon, cx, EmptyState, Button } from '../components/ui';
import { useReducedMotion } from '../lib/hooks';

/** Catalogue with categories, moods, regions, search and sorting (master prompt 6). */
const ProductList = () => {
  const [params, setParams] = useSearchParams();
  const cat = params.get('cat') || 'all';
  const mood = params.get('mood');
  const region = params.get('region');
  const q = params.get('q') || '';
  const sort = params.get('sort') || 'relevance';
  const { items: products, isLoading, error, point } = useNearbyProducts();
  const sellers = useNearbySellers();
  const reduced = useReducedMotion();

  const set = (k, v) => {
    const next = new URLSearchParams(params);
    if (v == null || v === 'all' || v === '') next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };

  const list = useMemo(() => {
    let l = products;
    if (cat !== 'all') l = l.filter((p) => p.collections.includes(cat));
    if (mood) l = l.filter(MOODS.find((m) => m.id === mood)?.test || (() => true));
    if (region) l = l.filter((p) => p.region === region);
    if (q) {
      const t = q.toLowerCase();
      l = l.filter((p) => p.title.toLowerCase().includes(t) || p.region.toLowerCase().includes(t) || p.tags.some((x) => x.includes(t)));
    }
    if (sort === 'bestsellers') l = [...l].sort((a, b) => Number(b.bestseller) - Number(a.bestseller) || b.rating - a.rating);
    if (sort === 'price') l = [...l].sort((a, b) => a.pricePaise - b.pricePaise);
    if (sort === 'fastest') l = [...l].sort((a, b) => a.window[1] - b.window[1]);
    return l;
  }, [products, cat, mood, region, q, sort]);

  const regionsHere = useMemo(() => [...new Set(products.map((p) => p.region))], [products]);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-orange-deep">Near {point.label}</p>
          <h1 className="text-[clamp(2rem,5vw,3.2rem)] font-extrabold leading-none">{q ? <>Results for “{q}”</> : region || 'Snacks near you'}</h1>
          <p className="mt-2 text-grey-600">Only verified shops that can reach you within 30 minutes are shown.</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold">
          Sort
          <select value={sort} onChange={(e) => set('sort', e.target.value)} className="h-11 rounded-full border border-grey-800/15 bg-white px-4 font-semibold">
            <option value="relevance">Recommended</option>
            <option value="bestsellers">Bestsellers</option>
            <option value="fastest">Fastest delivery</option>
            <option value="price">Price: low to high</option>
          </select>
        </label>
      </div>

      {sellers.length > 0 && (
        <div className="no-scrollbar -mx-4 mt-6 flex gap-3 overflow-x-auto px-4 pb-2" aria-label="Shops near you">
          {sellers.map((s) => {
            const w = s.promise.HOT?.serviceable ? s.promise.HOT.window : s.promise.AMBIENT.window;
            return (
              <Link key={s.id} to={`/shop/${s.id}`} className="lift flex w-[280px] shrink-0 items-center gap-3 rounded-2xl border border-grey-800/[0.06] bg-white p-3 shadow-sm">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-hero font-display text-lg font-extrabold text-grey-800">{s.shopName[0]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{s.shopName}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <Icon name="shield" className="h-3.5 w-3.5" /> Verified
                    {s.isNew && <Pill tone="orange">New</Pill>}
                    {s.busyExtraMin > 0 && <Pill tone="grey">Busy +{s.busyExtraMin} min</Pill>}
                  </span>
                  <span className="block text-xs text-grey-600">{s.distanceKm} km · {w[0]} to {w[1]} min</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <div className="sticky top-[76px] z-30 -mx-4 mt-4 bg-cream/85 px-4 py-3 backdrop-blur md:top-[84px]">
        <div className="no-scrollbar flex gap-2 overflow-x-auto" role="tablist" aria-label="Categories">
          {CATEGORIES.map((c) => (
            <button key={c.id} role="tab" aria-selected={cat === c.id} onClick={() => set('cat', c.id)} className={cx('h-10 shrink-0 rounded-full px-4 text-sm font-bold transition', cat === c.id ? 'bg-grey-800 text-white' : 'bg-white text-grey-800 ring-1 ring-grey-800/10 hover:ring-orange')}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
          {MOODS.map((m) => (
            <button key={m.id} aria-pressed={mood === m.id} onClick={() => set('mood', mood === m.id ? null : m.id)} className={cx('h-9 shrink-0 rounded-full px-3 text-xs font-bold transition', mood === m.id ? 'bg-sun text-grey-800' : 'bg-white/70 text-grey-600 ring-1 ring-grey-800/10 hover:text-grey-800')}>
              {m.label}
            </button>
          ))}
          {regionsHere.length > 1 &&
            regionsHere.map((r) => (
              <button key={r} aria-pressed={region === r} onClick={() => set('region', region === r ? null : r)} className={cx('h-9 shrink-0 rounded-full px-3 text-xs font-bold transition', region === r ? 'bg-orange text-grey-800' : 'bg-white/70 text-grey-600 ring-1 ring-grey-800/10')}>
                {r}
              </button>
            ))}
          {(mood || region || q) && (
            <button onClick={() => setParams({}, { replace: true })} className="h-9 shrink-0 rounded-full px-3 text-xs font-bold text-red-text underline">Clear filters</button>
          )}
        </div>
      </div>

      {params.get('view') === 'regions' && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {REGIONS.map((r) => (
            <button key={r.id} onClick={() => set('region', r.id)} className="lift flex items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-grey-800/5">
              <span className="h-10 w-1.5 rounded-full" style={{ background: r.accent }} />
              <span>
                <span className="block font-display text-lg font-bold">{r.id}</span>
                <span className="block text-sm text-grey-600">{r.snacks}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-8 rounded-2xl bg-red/10 p-4 font-semibold text-red-text">Could not load snacks. {error}</p>}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
        {isLoading && !list.length && Array.from({ length: 8 }, (_, i) => <ProductCardSkeleton key={i} />)}
        <AnimatePresence mode="popLayout">
          {list.map((p) => (
            <motion.div key={p.id} layout={!reduced} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.3 }}>
              <ProductCard product={p} className="h-full" />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {!isLoading && list.length === 0 && (
        <EmptyState title="Nothing here near you yet" body="Try another category or mood, or pick a different delivery address." action={<Button variant="ghost" onClick={() => setParams({})}>Show all snacks</Button>} />
      )}
    </div>
  );
};

export default ProductList;
