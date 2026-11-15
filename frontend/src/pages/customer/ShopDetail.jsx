import { useCallback, useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchShop } from '../../store/slices/products';
import { selectDeliveryPoint } from '../../store/slices/profile';
import ProductCard, { ProductCardSkeleton } from '../../components/product/Card';
import { Pill, Icon, EmptyState, Button } from '../../components/ui';
import { usePageTitle } from '../../hooks';
import { useAvailabilityRefresh } from '../../hooks/useCatalog';

/** One verified shop, its delivery promise for this address, and its menu. */
const ShopDetail = () => {
  const { sellerId } = useParams();
  const [params] = useSearchParams();
  const highlight = Number(params.get('highlight'));
  const dispatch = useDispatch();
  const point = useSelector(selectDeliveryPoint);
  const shop = useSelector((state) => state.products.shops[sellerId]);
  const error = useSelector((state) => state.products.shopErrors[sellerId]);
  usePageTitle(shop?.shopName);

  const load = useCallback(() => dispatch(fetchShop({ id: sellerId, point })), [dispatch, sellerId, point]);
  useEffect(() => {
    load();
  }, [load]);
  // the menu changes with the clock (breakfast ends, the evening snacks start)
  useAvailabilityRefresh(shop?.products ?? [], load);

  useEffect(() => {
    if (highlight && shop) document.getElementById(`p-${highlight}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlight, shop]);

  if (error && !shop)
    return <EmptyState icon="store" title="This shop is not available" body="It may be closed, paused or outside your delivery range." action={<Link to="/shop"><Button>See shops near you</Button></Link>} />;

  const hot = shop?.promise?.HOT;
  const amb = shop?.promise?.AMBIENT;
  const products = (shop?.products || []).map((x) => ({ ...x, shopName: shop.shopName, window: (x.servingTemp === 'HOT' ? hot : amb)?.window }));

  return (
    <div className="page pt-6">
      <Link to="/shop" className="inline-flex h-11 items-center gap-1 text-sm font-semibold text-grey-600 hover:text-grey-800"><Icon name="arrowLeft" className="h-4 w-4" /> All shops</Link>
      <section className="relative mt-2 overflow-hidden rounded-[28px] bg-hero p-6 text-grey-800 sm:p-10">
        <div className="absolute -right-10 -top-10 h-56 w-56 rounded-full bg-white/20 blur-2xl" aria-hidden="true" />
        {!shop ? (
          <div className="h-24" />
        ) : (
          <div className="relative">
            <div className="flex flex-wrap gap-2">
              {shop.verified && <Pill tone="dark"><Icon name="shield" className="h-3.5 w-3.5" /> Verified shop · licence checked</Pill>}
              {shop.isNew && <Pill className="bg-white text-grey-800">New on SnackHub</Pill>}
              {shop.rating != null && <Pill className="bg-white/80 text-grey-800"><Icon name="star" className="h-3.5 w-3.5 fill-current" /> {shop.rating}</Pill>}
              {shop.qualityScore != null && <Pill className="bg-white/80 text-grey-800">Quality score {shop.qualityScore}</Pill>}
            </div>
            <h1 className="mt-3 text-[clamp(1.875rem,1.4rem+2vw,2.75rem)] font-bold leading-none">{shop.shopName}</h1>
            <p className="mt-2 font-semibold">{[shop.addressLine ?? shop.city, shop.region].filter(Boolean).join(', ')}</p>
            {shop.hours && (
              <p className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${shop.hours.openNow ? 'bg-emerald-50 text-emerald-800' : 'bg-grey-900 text-white'}`}>
                <Icon name="clock" className="h-4 w-4" /> {shop.hours.openNow ? shop.hours.label : `Closed now · ${shop.hours.label}`}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
              {hot && <span className="glass glass-strong rounded-full px-3 py-1.5">{hot.serviceable ? `Hot snacks: ${hot.window[0]} to ${hot.window[1]} min` : `Hot snacks: ${hot.reasons[0]}`}</span>}
              {amb && <span className="glass glass-strong rounded-full px-3 py-1.5">{amb.serviceable ? `Sweets and dry: ${amb.window[0]} to ${amb.window[1]} min` : amb.reasons[0]}</span>}
              {shop.busyExtraMin > 0 && <span className="rounded-full bg-grey-800 px-3 py-1.5 text-white">Busy right now: about {shop.busyExtraMin} min extra prep</span>}
            </div>
          </div>
        )}
      </section>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5">
        {!shop && Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={i} />)}
        {products.map((x) => (
          <div id={`p-${x.id}`} key={x.id}>
            <ProductCard product={x} highlight={x.id === highlight} className="h-full" closed={shop.hours ? !shop.hours.openNow : false} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default ShopDetail;
