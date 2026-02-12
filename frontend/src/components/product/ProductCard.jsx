import { memo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import SnackImage from '../ui/SnackImage';
import { Pill, Price, QtyControl, SpiceMeter, Icon, cx } from '../ui';
import { openProduct } from '../../store/slices/uiSlice';
import { updateQuantity } from '../../store/slices/cartSlice';

const ProductCard = ({ product: p, className, highlight }) => {
  const dispatch = useDispatch();
  const qty = useSelector((state) => state.cart.items.find((i) => i.productId === p.id)?.qty || 0);
  const [fav, setFav] = useState(false);
  const soldOut = p.stock === 0;
  return (
    <article className={cx('group lift relative flex flex-col rounded-[22px] border border-grey-800/[0.06] bg-white p-3 shadow-card', highlight && 'ring-4 ring-sun', className)}>
      <div className="relative">
        <button onClick={() => dispatch(openProduct(p))} className="block w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#FFF4DA] via-[#FFE9CF] to-[#FFE1DA] text-left" aria-label={`View ${p.title} details`}>
          <SnackImage slug={p.slug} art={p.art} title={p.title} decorative className={cx('aspect-[5/4] w-full transition-transform duration-500 group-hover:-rotate-2 group-hover:scale-[1.06]', soldOut && 'opacity-50 grayscale')} />
        </button>
        {/* Badges sit over the picture but outside the button, so its name stays "View … details" */}
        <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1">
          {p.servingTemp === 'HOT' && <Pill tone="red" className="bg-white/90">Hot</Pill>}
          {p.bestseller && <Pill tone="sun">Bestseller</Pill>}
          {!p.bestseller && p.trending && <Pill tone="dark">Trending</Pill>}
        </div>
        {soldOut && <span className="pointer-events-none absolute inset-x-0 bottom-2 mx-auto w-fit rounded-full bg-grey-800 px-3 py-1 text-xs font-bold text-white">Sold out today</span>}
        {!soldOut && p.stock <= 3 && <span className="pointer-events-none absolute inset-x-0 bottom-2 mx-auto w-fit rounded-full bg-white px-3 py-1 text-xs font-bold text-red-text shadow">Only {p.stock} left</span>}
      </div>
      <button onClick={() => setFav((f) => !f)} aria-pressed={fav} aria-label={fav ? `Remove ${p.title} from favourites` : `Save ${p.title} to favourites`} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-grey-600 shadow-sm transition hover:text-red">
        <Icon name="heart" className={cx('h-[18px] w-[18px]', fav && 'fill-red text-red')} />
      </button>
      <div className="flex flex-1 flex-col px-1 pt-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-lg font-bold leading-tight text-grey-800">{p.title}</h3>
          <SpiceMeter level={p.spice} />
        </div>
        <p className="mt-0.5 text-xs font-semibold text-grey-600">{p.region} · {p.weight}</p>
        <div className="mt-1 flex items-center gap-2 text-xs text-grey-600">
          <span className="inline-flex items-center gap-0.5 font-bold text-grey-800"><Icon name="star" className="h-3.5 w-3.5 fill-sun text-sun" />{p.rating}</span>
          {p.window && (
            <span className="inline-flex items-center gap-1"><Icon name="clock" className="h-3.5 w-3.5" />{p.window[0]} to {p.window[1]} min</span>
          )}
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <Price paise={p.pricePaise} mrp={p.mrpPaise} className="flex-wrap text-[15px]" />
          <QtyControl qty={qty} onChange={(q) => dispatch(updateQuantity(p, q))} max={p.stock} disabled={soldOut} label={p.title} />
        </div>
      </div>
    </article>
  );
};

export default memo(ProductCard);

export function ProductCardSkeleton() {
  return (
    <div className="rounded-[22px] border border-grey-800/[0.06] bg-white p-3">
      <div className="skeleton aspect-[5/4] w-full" />
      <div className="skeleton mt-3 h-5 w-2/3" />
      <div className="skeleton mt-2 h-3 w-1/2" />
      <div className="mt-4 flex justify-between"><div className="skeleton h-6 w-16" /><div className="skeleton h-10 w-20" /></div>
    </div>
  );
}
