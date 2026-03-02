import { useDispatch, useSelector } from 'react-redux';
import { Button, Modal, CloseButton, LogoMark } from '../ui';
import GoogleG from '../ui/GoogleG';
import GoogleButton from '../ui/GoogleButton';
import { signInWithDemo, signInWithGoogle } from '../../store/slices/auth';
import { GOOGLE_CLIENT_ID } from '../../constants/auth';
import { setCartConflict, setSignInPrompt } from '../../store/slices/ui';
import { fetchCart, updateQuantity } from '../../store/slices/cart';
import { fetchAddresses } from '../../store/slices/profile';

/**
 * The two questions adding to the cart can raise: a guest must sign in first,
 * and a snack from a second shop needs the cart cleared (one order, one shop).
 */
export default function CartPrompts() {
  const dispatch = useDispatch();
  const conflict = useSelector((state) => state.ui.cartConflict);
  const prompt = useSelector((state) => state.ui.signInPrompt);
  const isLoading = useSelector((state) => state.auth.isLoading);

  // signs in (Google, or the demo customer until Google is set up), then adds the snack
  const quickSignIn = async (signInAction) => {
    const res = await dispatch(signInAction);
    if (res.meta.requestStatus !== 'fulfilled') return;
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
          {GOOGLE_CLIENT_ID ? (
            <div className="mt-6">
              <GoogleButton disabled={isLoading} onCredential={(credential) => quickSignIn(signInWithGoogle({ credential }))} />
            </div>
          ) : (
            <button onClick={() => quickSignIn(signInWithDemo({ demoRole: 'customer' }))} disabled={isLoading} className="mt-6 flex h-12 w-full items-center justify-center gap-3 rounded-full border border-grey-800/15 bg-white font-bold text-grey-800 shadow-sm transition hover:shadow-md disabled:opacity-60">
              <GoogleG /> Continue with the demo account
            </button>
          )}
          <p className="mt-3 text-center text-xs text-grey-600">{GOOGLE_CLIENT_ID ? 'New accounts are always customers.' : 'Demo sign-in. No Google account is used. New accounts are always customers.'}</p>
        </div>
      </Modal>
    </>
  );
}
