import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useQueryClient } from '@tanstack/react-query';
import { useCart, useSetCartQty } from '../../lib/queries';
import { api } from '../../lib/api';
import { actions } from '../../store/webStore';
import { Button, Modal, CloseButton, LogoMark } from '../../components/ui';
import ProductModal from '../catalog/ProductModal';
import GoogleG from '../../components/GoogleG';

const Ctx = createContext(null);
export const useShop = () => useContext(Ctx);

export function ShopProvider({ children }) {
  const dispatch = useDispatch();
  const qc = useQueryClient();
  const user = useSelector((s) => s.auth.user);
  const { data: cart } = useCart();
  const setCartQty = useSetCartQty();
  const [product, setProduct] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [signInFor, setSignInFor] = useState(null);
  const pending = useRef(null);

  const qtyOf = useCallback((id) => cart?.items.find((i) => i.productId === id)?.qty || 0, [cart]);

  const doSet = useCallback(
    (p, qty, replace = false) =>
      setCartQty.mutate(
        { product: p, qty, replace },
        {
          onSuccess: () => {
            if (qty > 0 && qtyOf(p.id) === 0) dispatch(actions.toast({ title: `${p.title} added`, body: 'From ' + (p.shopName || 'this shop'), tone: 'info', duration: 2200 }));
          },
          onError: (e) => {
            if (e.code === 'CART_OTHER_SELLER') setConflict({ product: p, qty, message: e.message });
            else dispatch(actions.toast({ title: 'Could not update cart', body: e.message, tone: 'error' }));
          },
        },
      ),
    [setCartQty, dispatch, qtyOf],
  );

  const setQty = useCallback(
    (p, qty) => {
      if (!user || user.role !== 'customer') {
        pending.current = { p, qty };
        setSignInFor(p);
        return;
      }
      doSet(p, qty);
    },
    [user, doSet],
  );

  const quickSignIn = async () => {
    const res = await api('/auth/google', { method: 'POST', body: { demoRole: 'customer' } });
    dispatch(actions.signedIn({ token: res.accessToken, user: res.user }));
    setSignInFor(null);
    await qc.invalidateQueries();
    if (pending.current) {
      const { p, qty } = pending.current;
      pending.current = null;
      setTimeout(() => doSet(p, qty), 50);
    }
  };

  const value = useMemo(() => ({ cart, qtyOf, setQty, openProduct: setProduct }), [cart, qtyOf, setQty]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <ProductModal product={product} onClose={() => setProduct(null)} />

      <Modal open={Boolean(conflict)} onClose={() => setConflict(null)} title="Start a new cart?">
        <div className="p-6">
          <h2 className="text-2xl font-extrabold">Start a new cart?</h2>
          <p className="mt-2 text-grey-600">{conflict?.message}</p>
          <p className="mt-1 text-sm text-grey-600">Each order comes from one shop, so it can reach you hot and on time.</p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setConflict(null)}>Keep my cart</Button>
            <Button
              onClick={() => {
                doSet(conflict.product, conflict.qty, true);
                setConflict(null);
              }}
            >
              Clear and add {conflict?.product.title}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(signInFor)} onClose={() => setSignInFor(null)} title="Sign in to add snacks">
        <div className="relative p-6 sm:p-8">
          <CloseButton onClick={() => setSignInFor(null)} className="absolute right-3 top-3" />
          <LogoMark className="h-12 w-12" />
          <h2 className="mt-4 text-2xl font-extrabold">Sign in to start your cart</h2>
          <p className="mt-1 text-grey-600">Your cart is saved to your account, so it follows you across devices.</p>
          <button onClick={quickSignIn} className="mt-6 flex h-12 w-full items-center justify-center gap-3 rounded-full border border-grey-800/15 bg-white font-bold text-grey-800 shadow-sm transition hover:shadow-md">
            <GoogleG /> Continue with Google <span className="text-xs font-semibold text-grey-600">(demo)</span>
          </button>
          <p className="mt-3 text-center text-xs text-grey-600">Demo sign-in. No Google account is used. New accounts are always customers.</p>
        </div>
      </Modal>
    </Ctx.Provider>
  );
}

export { GoogleG };
