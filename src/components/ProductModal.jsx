import { useDispatch, useSelector } from 'react-redux';
import { Modal, CloseButton, Pill, Price, SpiceMeter, TempBadge, QtyControl, Icon } from './ui';
import SnackArt from './SnackArt';
import { closeProduct } from '../store/slices/uiSlice';
import { updateQuantity } from '../store/slices/cartSlice';

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
            <SnackArt shape={p.art.shape} colors={p.art.colors} title={p.title} className="mx-auto w-full max-w-xs drop-shadow-xl" />
            <p className="mt-2 text-center text-xs text-grey-600">Illustration, not a photo of the actual item</p>
          </div>
          <div className="relative p-6 sm:p-8">
            <CloseButton onClick={onClose} className="absolute right-3 top-3" />
            <div className="flex flex-wrap items-center gap-1.5 pr-10">
              <TempBadge temp={p.servingTemp} />
              {p.bestseller && <Pill tone="sun">Bestseller</Pill>}
              {p.stock > 0 && p.stock <= 3 && <Pill tone="red">Only {p.stock} left</Pill>}
            </div>
            <h2 className="mt-3 text-3xl font-extrabold leading-tight">{p.title}</h2>
            <p className="mt-1 text-sm font-semibold text-grey-600">{p.region} · {p.weight}</p>
            <div className="mt-2 flex items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1 font-bold"><Icon name="star" className="h-4 w-4 fill-sun text-sun" />{p.rating}</span>
              <span className="text-grey-600">{p.ratingCount} ratings</span>
              <SpiceMeter level={p.spice} />
            </div>
            <p className="mt-4 text-grey-600">{p.description}</p>
            {p.attrs?.allergens?.length > 0 && <p className="mt-3 text-sm text-grey-600"><span className="font-bold text-grey-800">Contains:</span> {p.attrs.allergens.join(', ')}</p>}
            {p.shopName && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-grey-800">
                <Icon name="shield" className="h-4 w-4 text-emerald-600" /> {p.shopName} · verified shop
              </p>
            )}
            <div className="mt-6 flex items-center justify-between gap-4 border-t border-grey-800/10 pt-5">
              <div>
                <Price paise={p.pricePaise} mrp={p.mrpPaise} className="text-xl" />
                {p.window && <p className="mt-0.5 text-xs font-semibold text-grey-600">{p.window[0]} to {p.window[1]} min</p>}
              </div>
              <QtyControl qty={qty} onChange={(q) => dispatch(updateQuantity(p, q))} max={p.stock} disabled={p.stock === 0} label={p.title} />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
