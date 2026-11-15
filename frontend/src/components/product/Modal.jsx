import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { rupees } from '@shared/domain/money';
import { Modal, CloseButton, Pill, Price, SpiceMeter, TempBadge, QtyControl, Icon } from '../ui';
import { STATUS_TONE, availabilityNote } from '../../constants/availability';
import { SLOT_LABEL } from '@shared/domain/availability';
import SnackImage from '../ui/SnackImage';
import { closeProduct, openProduct } from '../../store/slices/ui';
import { fetchOffers } from '../../store/slices/products';
import { selectDeliveryPoint } from '../../store/slices/profile';
import { updateQuantity } from '../../store/slices/cart';

/** Product details in a modal (master prompt 6), opened with openProduct(product). */
export default function ProductModal() {
  const dispatch = useDispatch();
  const p = useSelector((state) => state.ui.selectedProduct);
  const qty = useSelector((state) => (p ? state.cart.items.find((i) => i.productId === p.id)?.qty || 0 : 0));
  const onClose = () => dispatch(closeProduct());
  return (
    <Modal open={Boolean(p)} onClose={onClose} title={p?.title || 'Snack'} wide>
      {p && (
        <div className="grid sm:grid-cols-2">
          <div className="relative bg-gradient-to-br from-sun/30 via-orange/15 to-red/10 p-6 sm:rounded-l-[28px]">
            <SnackImage slug={p.slug} art={p.art} title={p.title} sizes="(min-width: 640px) 384px, 100vw" priority className="mx-auto w-full max-w-xs drop-shadow-xl" />
            <p className="mt-2 text-center text-xs text-grey-600">Illustration, not a photo of the actual item</p>
          </div>
          <div className="relative p-6 sm:p-8">
            <CloseButton onClick={onClose} className="absolute right-3 top-3" />
            <div className="flex flex-wrap items-center gap-1.5 pr-10">
              <TempBadge temp={p.servingTemp} />
              {p.bestseller && <Pill tone="sun">Bestseller</Pill>}
              {p.stock > 0 && p.stock <= 3 && <Pill tone="red">Only {p.stock} left</Pill>}
              {p.servingSlot && p.servingSlot !== 'allday' && <Pill tone="grey">{SLOT_LABEL[p.servingSlot]}</Pill>}
              {p.availability && <Pill tone={STATUS_TONE[p.availability.status]}>{p.availability.label}</Pill>}
            </div>
            <h2 className="mt-3 text-3xl font-bold leading-tight">{p.title}</h2>
            <p className="mt-1 text-sm font-semibold text-grey-600">{p.region} · {p.weight}</p>
            <div className="mt-2 flex items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1 font-semibold"><Icon name="star" className="h-4 w-4 fill-sun text-sun" />{p.rating}</span>
              <span className="text-grey-600">{p.ratingCount} ratings</span>
              <SpiceMeter level={p.spice} />
            </div>
            <p className="mt-4 text-grey-600">{p.description}</p>
            {p.attrs?.allergens?.length > 0 && <p className="mt-3 text-sm text-grey-600"><span className="font-semibold text-grey-800">Contains:</span> {p.attrs.allergens.join(', ')}</p>}
            {p.shopName && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-grey-800">
                <Icon name="shield" className="h-4 w-4 text-emerald-600" /> {p.shopName} · verified shop
              </p>
            )}
            {availabilityNote(p.availability) && <p className="mt-4 rounded-xl bg-sun/15 p-3 text-sm text-grey-800" role="status">{availabilityNote(p.availability)}</p>}
            <div className="mt-6 flex items-center justify-between gap-4 border-t border-grey-800/10 pt-5">
              <div>
                <Price paise={p.pricePaise} mrp={p.mrpPaise} className="text-xl" />
                {p.window && <p className="mt-0.5 text-xs font-semibold text-grey-600">{p.window[0]} to {p.window[1]} min</p>}
              </div>
              <QtyControl qty={qty} onChange={(q) => dispatch(updateQuantity(p, q))} max={p.stock} disabled={qty === 0 && (p.availability ? p.availability.status !== 'AVAILABLE' : p.stock === 0)} label={p.title} />
            </div>
            {p.catalogItemId && <OtherShops product={p} />}
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * The same catalogue snack at the other open shops that deliver here (shared catalogue),
 * cheapest first; picking one opens it. Nothing shows when no other shop sells it.
 */
function OtherShops({ product }) {
  const dispatch = useDispatch();
  const point = useSelector(selectDeliveryPoint);
  const [offers, setOffers] = useState([]);
  const { catalogItemId: itemId, id } = product;
  const { lat, lng, pincode } = point;
  useEffect(() => {
    let live = true;
    dispatch(fetchOffers({ itemId, point: { lat, lng, pincode } })).unwrap().then((list) => live && setOffers(list), () => live && setOffers([]));
    return () => {
      live = false;
    };
  }, [dispatch, itemId, lat, lng, pincode]);
  const others = offers.filter((o) => o.id !== id);
  if (!others.length) return null;
  const cheapest = others[0].pricePaise < product.pricePaise;
  return (
    <section className="mt-5 border-t border-grey-800/10 pt-4" aria-labelledby="other-shops">
      <h3 id="other-shops" className="text-sm font-bold">Also at {others.length} other shop{others.length === 1 ? '' : 's'} near you{cheapest ? `, from ${rupees(others[0].pricePaise)}` : ''}</h3>
      <ul className="mt-2 space-y-1.5">
        {others.slice(0, 4).map((o) => (
          <li key={o.id}>
            <button type="button" onClick={() => dispatch(openProduct(o))} className="flex w-full items-center justify-between gap-3 rounded-xl bg-grey-50 px-3 py-2 text-left text-sm hover:bg-sun/15">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{o.shopName}</span>
                <span className="block text-xs text-grey-600">{o.distanceKm} km{o.window ? ` · ${o.window[0]} to ${o.window[1]} min` : ''}</span>
              </span>
              <span className="shrink-0 font-bold">{rupees(o.pricePaise)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
