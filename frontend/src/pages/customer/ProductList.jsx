import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, m } from 'motion/react';
import { useNearbyProducts, useNearbySellers } from '../../hooks/useCatalog';
import { CATEGORIES, MOODS, REGIONS, SELLER_KINDS } from '../../constants/catalog';
import ProductCard, { ProductCardSkeleton } from '../../components/product/Card';
import Spotlight from '../../components/product/Spotlight';
import { Pill, Icon, cx, EmptyState, Button } from '../../components/ui';
import { useReducedMotion } from '../../hooks';

/** Catalogue with categories, moods, regions, search and sorting (master prompt 6). */
const ProductList = () => {
  const [params, setParams] = useSearchParams();
  const cat = params.get('cat') || 'all';
  const mood = params.get('mood');
  const region = params.get('region');
  const kind = params.get('kind');
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
    if (kind) l = l.filter((p) => p.shopKind === kind);
    if (q) {
      const t = q.toLowerCase();
      l = l.filter((p) => p.title.toLowerCase().includes(t) || p.region.toLowerCase().includes(t) || p.tags.some((x) => x.includes(t)));
    }
    if (sort === 'bestsellers') l = [...l].sort((a, b) => Number(b.bestseller) - Number(a.bestseller) || b.rating - a.rating);
    if (sort === 'price') l = [...l].sort((a, b) => a.pricePaise - b.pricePaise);
    if (sort === 'fastest') l = [...l].sort((a, b) => a.window[1] - b.window[1]);
    return l;
  }, [products, cat, mood, region, kind, q, sort]);
  const shopsShown = kind ? sellers.filter((s) => s.kind === kind) : sellers;

  const regionsHere = useMemo(() => [...new Set(products.map((p) => p.region))], [products]);
  const fastest = useMemo(() => (products.length ? Math.min(...products.map((p) => p.window?.[0] ?? 99)) : null), [products]);

  return (
    <div className="page pt-6">
      <Spotlight eyebrow={`Near ${point.label}`} title={q ? <>Results for “{q}”</> : region ? <>{region} snacks,</> : <>Hometown snacks,</>} shops={sellers.length} snacks={products.length} fastest={fastest}>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 rounded-full border border-white/60 bg-white/55 py-1 pl-4 pr-1 text-sm font-bold text-grey-900 backdrop-blur-md">
            Sort
            <select value={sort} onChange={(e) => set('sort', e.target.value)} className="h-10 rounded-full border-0 bg-white px-4 font-semibold text-grey-800 shadow-sm focus:outline-none focus:ring-4 focus:ring-white/60">
              <option value="relevance">Recommended</option>
              <option value="bestsellers">Bestsellers</option>
              <option value="fastest">Fastest delivery</option>
              <option value="price">Price: low to high</option>
            </select>
          </label>
          <p className="text-sm font-semibold text-grey-900/80">Only verified shops that can reach you within 30 minutes are shown.</p>
        </div>
      </Spotlight>

      {shopsShown.length > 0 && (
        <div className="no-scrollbar bleed mt-6 flex gap-3 overflow-x-auto pb-2" aria-label="Shops near you">
          {shopsShown.map((s) => {
            const w = s.promise.HOT?.serviceable ? s.promise.HOT.window : s.promise.AMBIENT.window;
            return (
              <Link key={s.id} to={`/shop/${s.id}`} className="surface glow flex w-[18.75rem] shrink-0 items-center gap-3 p-3.5">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-hero font-display text-2xl font-extrabold text-grey-900 shadow-cta">{s.shopName[0]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[1.0625rem] font-bold">{s.shopName}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <Icon name="shield" className="h-3.5 w-3.5" /> Verified
                    {s.isNew && <Pill tone="orange">New</Pill>}
                    {SELLER_KINDS[s.kind] && <Pill tone={SELLER_KINDS[s.kind].tone}>{SELLER_KINDS[s.kind].label}</Pill>}
                    {s.busyExtraMin > 0 && <Pill tone="grey">Busy +{s.busyExtraMin} min</Pill>}
                  </span>
                  <span className="block text-xs text-grey-600">{s.distanceKm} km · {w[0]} to {w[1]} min</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <div className="glass sticky top-[4.75rem] z-30 mt-4 rounded-[26px] px-3 py-3 md:top-[5.25rem]">
        <div className="no-scrollbar flex gap-2 overflow-x-auto" role="tablist" aria-label="Categories">
          {CATEGORIES.map((c) => (
            <button key={c.id} role="tab" aria-selected={cat === c.id} onClick={() => set('cat', c.id)} className={cx('h-11 shrink-0 rounded-full px-5 text-sm font-bold transition', cat === c.id ? 'chip-on' : 'chip-off')}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
          {Object.entries(SELLER_KINDS).map(([k, v]) => (
            <button key={k} aria-pressed={kind === k} onClick={() => set('kind', kind === k ? null : k)} className={cx('h-9 shrink-0 rounded-full px-3.5 text-[0.8125rem] font-bold transition', kind === k ? 'chip-on' : 'chip-off')}>
              {v.filter}
            </button>
          ))}
          {MOODS.map((m) => (
            <button key={m.id} aria-pressed={mood === m.id} onClick={() => set('mood', mood === m.id ? null : m.id)} className={cx('h-9 shrink-0 rounded-full px-3.5 text-[0.8125rem] font-bold transition', mood === m.id ? 'chip-on' : 'chip-off')}>
              {m.label}
            </button>
          ))}
          {regionsHere.length > 1 &&
            regionsHere.map((r) => (
              <button key={r} aria-pressed={region === r} onClick={() => set('region', region === r ? null : r)} className={cx('h-9 shrink-0 rounded-full px-3.5 text-[0.8125rem] font-bold transition', region === r ? 'chip-on' : 'chip-off')}>
                {r}
              </button>
            ))}
          {(mood || region || kind || q) && (
            <button onClick={() => setParams({}, { replace: true })} className="h-9 shrink-0 rounded-full px-3 text-xs font-bold text-red-text underline">Clear filters</button>
          )}
        </div>
      </div>

      {params.get('view') === 'regions' && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {REGIONS.map((r) => (
            <button key={r.id} onClick={() => set('region', r.id)} className="surface glow flex items-center gap-3 p-4 text-left">
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

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5">
        {isLoading && !list.length && Array.from({ length: 8 }, (_, i) => <ProductCardSkeleton key={i} />)}
        <AnimatePresence mode="popLayout">
          {list.map((p) => (
            <m.div key={p.id} layout={!reduced} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.3 }}>
              <ProductCard product={p} className="h-full" />
            </m.div>
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
