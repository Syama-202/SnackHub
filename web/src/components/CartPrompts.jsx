import { useDispatch, useSelector } from 'react-redux';
import { Button, Modal, CloseButton, LogoMark } from './ui';
import GoogleG from './GoogleG';
import { signInWithGoogle } from '../store/slices/authSlice';
import { setCartConflict, setSignInPrompt } from '../store/slices/uiSlice';
import { fetchCart, updateQuantity } from '../store/slices/cartSlice';
import { fetchAddresses } from '../store/slices/profileSlice';

/**
 * The two questions adding to the cart can raise: a guest must sign in first,
 * and a snack from a second shop needs the cart cleared (one order, one shop).
 */
export default function CartPrompts() {
  const dispatch = useDispatch();
  const conflict = useSelector((state) => state.ui.cartConflict);
  const prompt = useSelector((state) => state.ui.signInPrompt);
  const isLoading = useSelector((state) => state.auth.isLoading);

  const quickSignIn = async () => {
    const res = await dispatch(signInWithGoogle({ demoRole: 'customer' }));
    if (!signInWithGoogle.fulfilled.match(res)) return;
    dispatch(setSignInPrompt(null));
    await Promise.all([dispatch(fetchCart()), dispatch(fetchAddresses())]);
    if (prompt) dispatch(updateQuantity(prompt.product, prompt.qty));
  };

  return (
    <>
      <Modal open={Boolean(conflict)} onClose={() => dispatch(setCartConflict(null))} title="Start a new cart?">
        <div className="p-6">
          <h2 className="text-2xl font-extrabold">Start a new cart?</h2>
          <p className="mt-2 text-grey-600">{conflict?.message}</p>
          <p className="mt-1 text-sm text-grey-600">Each order comes from one shop, so it can reach you hot and on time.</p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => dispatch(setCartConflict(null))}>Keep my cart</Button>
            <Button
              onClick={() => {
                dispatch(updateQuantity(conflict.product, conflict.qty, { replace: true }));
                dispatch(setCartConflict(null));
              }}
            >
              Clear and add {conflict?.product.title}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(prompt)} onClose={() => dispatch(setSignInPrompt(null))} title="Sign in to add snacks">
        <div className="relative p-6 sm:p-8">
          <CloseButton onClick={() => dispatch(setSignInPrompt(null))} className="absolute right-3 top-3" />
          <LogoMark className="h-12 w-12" />
          <h2 className="mt-4 text-2xl font-extrabold">Sign in to start your cart</h2>
          <p className="mt-1 text-grey-600">Your cart is saved to your account, so it follows you across devices.</p>
          <button onClick={quickSignIn} disabled={isLoading} className="mt-6 flex h-12 w-full items-center justify-center gap-3 rounded-full border border-grey-800/15 bg-white font-bold text-grey-800 shadow-sm transition hover:shadow-md disabled:opacity-60">
            <GoogleG /> Continue with Google <span className="text-xs font-semibold text-grey-600">(demo)</span>
          </button>
          <p className="mt-3 text-center text-xs text-grey-600">Demo sign-in. No Google account is used. New accounts are always customers.</p>
        </div>
      </Modal>
    </>
  );
}
