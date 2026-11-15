import { useCallback, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { searchProducts } from '../../store/slices/products';
import { selectDeliveryPoint } from '../../store/slices/profile';
import { CATEGORIES } from '../../constants/catalog';
import { CATEGORY_LABELS } from '@shared/domain/menu';
import ProductCard, { ProductCardSkeleton } from '../../components/product/Card';
import { Button, EmptyState, ErrorState, Icon, cx } from '../../components/ui';
import { usePageTitle } from '../../hooks';
import { useAvailabilityRefresh } from '../../hooks/useCatalog';

const SORTS = [
  ['relevance', 'Best match'],
  ['distance', 'Nearest first'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['popular', 'Most popular'],
];
const AVAILABILITY = [
  ['any', 'Any time'],
  ['now', 'Order now'],
  ['today', 'Today'],
];
// snack kinds first, then the collections (spicy, sweets, breakfast, chaat...)
const KINDS = [
  ...Object.entries(CATEGORY_LABELS).map(([id, label]) => ({ id, label })),
  ...CATEGORIES.filter((c) => c.id !== 'all' && !CATEGORY_LABELS[c.id]).map((c) => ({ id: c.id, label: c.label })),
];
const rupeeOptions = [100, 200, 300, 500];

/**
 * Search results (doc 12.3): every snack that matches and can reach the delivery point, even
 * when it cannot be ordered right now (each card says why and when), with filters, sorting
 * and pages. The server does the matching (Elasticsearch or PostgreSQL) and decides
 * availability; nothing is filtered in the browser.
 */
export default function Search() {
  const dispatch = useDispatch();
  const point = useSelector(selectDeliveryPoint);
  const s = useSelector((state) => state.products.search);
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const options = useMemo(
    () => ({
      sort: params.get('sort') || 'relevance',
      page: Number(params.get('page')) || 1,
      filters: {
        category: params.get('category') || undefined,
        maxPrice: params.get('maxPrice') ? Number(params.get('maxPrice')) : undefined,
        minRating: params.get('minRating') ? Number(params.get('minRating')) : undefined,
        maxKm: params.get('maxKm') ? Number(params.get('maxKm')) : undefined,
        availability: params.get('availability') || 'any',
      },
    }),
    [params],
  );
  usePageTitle(q ? `“${q}”: search` : 'Search');

  const load = useCallback(() => {
    if (q) dispatch(searchProducts({ q, point: { lat: point.lat, lng: point.lng, pincode: point.pincode }, ...options }));
  }, [q, point.lat, point.lng, point.pincode, options, dispatch]);
  useEffect(() => {
    load();
  }, [load]);
  // what cannot be ordered yet becomes orderable at its time, without a reload
  useAvailabilityRefresh(s.results, load);

  const set = (k, v) => {
    const next = new URLSearchParams(params);
    if (v == null || v === '' || v === 'any' || v === 'relevance') next.delete(k);
    else next.set(k, v);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: k !== 'page' });
    if (k === 'page') window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const filtered = Object.entries(options.filters).some(([k, v]) => v != null && !(k === 'availability' && v === 'any'));

  if (!q) return <EmptyState icon="search" title="What are you craving?" body="Type a snack, a sweet or a shop in the search box at the top." />;

  const notServed = s.location && s.location.status !== 'SERVED';
  return (
    <div className="page pt-6">
      <p className="text-sm font-semibold text-grey-600">Delivering to {point.label}</p>
      <h1 className="page-title mt-1">Results for “{q}”</h1>
      {!notServed && s.key && !s.loading && <p className="mt-1 text-sm text-grey-600">{s.total === 1 ? '1 snack' : `${s.total} snacks`} from shops that can reach you{filtered ? ', with your filters' : ''}.</p>}

      <div className="mt-5 flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
        <Choice label="Kind" value={options.filters.category ?? ''} onChange={(v) => set('category', v)} options={[['', 'All kinds'], ...KINDS.map((k) => [k.id, k.label])]} />
        <Choice label="When" value={options.filters.availability} onChange={(v) => set('availability', v)} options={AVAILABILITY} />
        <Choice label="Price" value={options.filters.maxPrice ?? ''} onChange={(v) => set('maxPrice', v)} options={[['', 'Any price'], ...rupeeOptions.map((r) => [String(r * 100), `Up to ₹${r}`])]} />
        <Choice label="Rating" value={options.filters.minRating ?? ''} onChange={(v) => set('minRating', v)} options={[['', 'Any rating'], ['4', '4.0 and up'], ['4.5', '4.5 and up']]} />
        <Choice label="Distance" value={options.filters.maxKm ?? ''} onChange={(v) => set('maxKm', v)} options={[['', 'Any distance'], ['1', 'Within 1 km'], ['2', 'Within 2 km'], ['3', 'Within 3 km']]} />
        <Choice label="Sort" value={options.sort} onChange={(v) => set('sort', v)} options={SORTS} />
        {filtered && (
          <button type="button" onClick={() => setParams(new URLSearchParams({ q }), { replace: true })} className="h-10 rounded-full px-3 text-sm font-semibold text-orange-text hover:bg-sun/15">
            Clear filters
          </button>
        )}
      </div>

      <div className="mt-6">
        {s.loading && !s.results.length && (
          <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => <ProductCardSkeleton key={i} />)}
          </div>
        )}
        {s.error && !s.loading && <ErrorState title="Search is not answering" body={s.error} onRetry={() => dispatch(searchProducts({ q, point, ...options }))} />}
        {notServed && !s.loading && <NotServed location={s.location} />}
        {!notServed && !s.loading && !s.error && s.key && s.results.length === 0 && (
          <EmptyState
            icon="search"
            title="Couldn't find that snack. Maybe try another craving?"
            body={filtered ? 'Nothing matches with these filters. Try clearing some of them.' : 'Check the spelling, or try a nearby favourite like murukku, mirchi bajji or laddu.'}
            action={filtered ? <Button variant="ghost" onClick={() => setParams(new URLSearchParams({ q }), { replace: true })}>Clear filters</Button> : <Link to="/shop"><Button variant="ghost">Browse every snack</Button></Link>}
          />
        )}
        {s.results.length > 0 && (
          <div className={cx('grid grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', s.loading && 'opacity-60')}>
            {s.results.map((p) => <ProductCard key={p.id} product={p} className="h-full" />)}
          </div>
        )}
        {s.pages > 1 && !notServed && (
          <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pages">
            <Button variant="ghost" size="sm" disabled={s.page <= 1} onClick={() => set('page', String(s.page - 1))}><Icon name="arrowLeft" className="h-4 w-4" /> Previous</Button>
            <span className="text-sm font-semibold">Page {s.page} of {s.pages}</span>
            <Button variant="ghost" size="sm" disabled={s.page >= s.pages} onClick={() => set('page', String(s.page + 1))}>Next <Icon name="arrowRight" className="h-4 w-4" /></Button>
          </nav>
        )}
      </div>
    </div>
  );
}

function Choice({ label, value, onChange, options }) {
  return (
    <label className="inline-flex items-center">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field h-10 w-auto min-h-0 rounded-full py-0 pr-8 text-sm font-semibold">
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </label>
  );
}

/** No shop reaches the delivery point: say where it is, never show shops from elsewhere. */
function NotServed({ location }) {
  const unsupported = location.status === 'UNSUPPORTED_CITY';
  const place = unsupported ? location.address?.city || 'your city' : location.address?.locality || 'your area';
  return (
    <EmptyState
      icon="pin"
      title={unsupported ? `We're not serving ${place} yet, but we're cooking up something exciting!` : `We're close, but not quite in your delivery zone yet!`}
      body={unsupported ? `The nearest city we serve is ${location.nearestCity?.name ?? 'not far'}. Pick it from “Deliver to” at the top to look around.` : `No shop delivers to ${place} yet. Try another address or a spot nearer the city centre.`}
    />
  );
}
