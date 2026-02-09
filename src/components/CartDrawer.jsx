import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { AnimatePresence, motion } from 'motion/react';
import { Drawer, CloseButton, Button, QtyControl, EmptyState, TempBadge, Pill } from './ui';
import SnackImage from './SnackImage';
import { closeCart } from '../store/slices/uiSlice';
import { updateQuantity } from '../store/slices/cartSlice';
import { rupees } from '../domain/money';

export default function CartDrawer() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const open = useSelector((state) => state.ui.cartOpen);
  const user = useSelector((state) => state.auth.user);
  const cart = useSelector((state) => state.cart);
  const close = () => dispatch(closeCart());
  const items = cart.items;
  const total = cart.subtotalPaise + cart.deliveryFeePaise;
  const mixed = items.some((i) => i.servingTemp === 'HOT') && items.some((i) => i.servingTemp === 'AMBIENT');
  const go = (to) => {
    close();
    navigate(to);
  };

  return (
    <Drawer open={open} onClose={close} title="Your cart">
      <div className="flex items-center justify-between border-b border-grey-800/10 px-5 py-3">
        <div>
          <h2 className="text-2xl font-extrabold">Your cart</h2>
          {cart.seller && <p className="text-sm text-grey-600">From {cart.seller.shopName}</p>}
        </div>
        <CloseButton onClick={close} />
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            art={<EmptyCartArt />}
            title="Your snack adventure starts here."
            body={user ? 'Add something crunchy, spicy or sweet from a shop near you.' : 'Sign in and add snacks from a shop near you.'}
            action={<Button onClick={() => go('/shop')}>Explore snacks</Button>}
          />
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {mixed && (
              <p className="mb-3 rounded-2xl bg-sun/20 px-3 py-2 text-sm text-grey-800">
                Your cart mixes hot and sweet snacks, so the hot rules apply: 3 km range and a 12 minute ride.
              </p>
            )}
            <ul className="space-y-3">
              <AnimatePresence initial={false}>
                {items.map((i) => (
                  <motion.li key={i.productId} layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20, height: 0 }} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
                    <div className="grid h-16 w-20 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sun/25 to-orange/10">
                      <SnackImage slug={i.slug} art={i.art} plate={false} sizes="64px" className="h-14 w-16 rounded-lg" title={i.title} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{i.title}</p>
                      <p className="text-xs text-grey-600">{i.weight} · {rupees(i.pricePaise)}</p>
                      <div className="mt-1 flex gap-1">
                        <TempBadge temp={i.servingTemp} />
                        {i.stock < i.qty && <Pill tone="red">Only {i.stock} left</Pill>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <QtyControl size="sm" qty={i.qty} onChange={(q) => dispatch(updateQuantity({ id: i.productId, sellerId: cart.sellerId, ...i }, q))} max={i.stock} label={i.title} />
                      <span className="text-sm font-extrabold">{rupees(i.pricePaise * i.qty)}</span>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
          <div className="safe-bottom border-t border-grey-800/10 bg-white px-5 pt-4">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-grey-600">Subtotal</dt><dd className="font-bold">{rupees(cart.subtotalPaise)}</dd></div>
              <div className="flex justify-between"><dt className="text-grey-600">Delivery fee (sample)</dt><dd className="font-bold">{rupees(cart.deliveryFeePaise)}</dd></div>
              <div className="flex justify-between pt-1 text-base"><dt className="font-extrabold">Total</dt><dd className="font-extrabold">{rupees(total)}</dd></div>
            </dl>
            <p className="mt-1 text-xs text-grey-600">Prices and stock are checked again at checkout.</p>
            <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
              <Button variant="ghost" onClick={close}>Continue shopping</Button>
              <Button onClick={() => go('/checkout')}>Checkout · {rupees(total)}</Button>
            </div>
            <Link to={`/shop/${cart.sellerId}`} onClick={close} className="mt-2 block py-2 text-center text-sm font-bold text-orange-text">Add more from this shop</Link>
          </div>
        </>
      )}
    </Drawer>
  );
}

function EmptyCartArt() {
  return (
    <svg viewBox="0 0 200 140" className="w-52" aria-hidden="true">
      <ellipse cx="100" cy="124" rx="70" ry="10" fill="#000" opacity=".07" />
      <path d="M50 60h100l-10 56H60z" fill="#FFF3D6" stroke="#FF7A00" strokeWidth="3" strokeLinejoin="round" />
      <path d="M70 60c0-22 60-22 60 0" stroke="#FF7A00" strokeWidth="3" fill="none" />
      <circle cx="84" cy="40" r="9" fill="#FFC300" className="animate-float" />
      <path d="M112 30l14 6-6 14z" fill="#E23744" opacity=".85" className="animate-float" />
      <path d="M140 44a8 8 0 1 1-16 0" stroke="#E86A00" strokeWidth="4" fill="none" className="animate-float" />
      <path d="M80 86q20 12 40 0" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="82" cy="76" r="3" fill="#1F2937" /><circle cx="118" cy="76" r="3" fill="#1F2937" />
    </svg>
  );
}
