import { createSlice } from '@reduxjs/toolkit';
import { apiThunk } from '../apiThunk';
import { bumpCart, setCartConflict, setSignInPrompt } from './uiSlice';
import { addToast } from './toastSlice';

/**
 * Server cart (Redis hash cart:{userId}, one shop only, doc 11.1). Fixes the
 * legacy two-sources-of-truth bug: the cart lives on the server and Redux
 * mirrors it, with an optimistic update while the request is in flight.
 */
export const fetchCart = apiThunk('cart/fetch', async (_, { apiFetch }) => apiFetch('/cart'));

export const setCartQty = apiThunk('cart/setQty', async ({ product, qty, replace = false }, { apiFetch }) =>
  apiFetch('/cart', { method: 'PUT', body: { productId: product.id, qty, replace } }),
);

export const clearServerCart = apiThunk('cart/clear', async (_, { apiFetch }) => apiFetch('/cart', { method: 'DELETE' }));

const empty = { sellerId: null, seller: null, items: [], subtotalPaise: 0, deliveryFeePaise: 0, tempClass: null };
const total = (items) => items.reduce((s, i) => s + i.pricePaise * i.qty, 0);

const cartSlice = createSlice({
  name: 'cart',
  initialState: { ...empty, isLoading: false, snapshot: null },
  reducers: {
    resetCart: () => ({ ...empty, isLoading: false, snapshot: null }),
  },
  extraReducers: (builder) => {
    const apply = (state, cart) => {
      Object.assign(state, cart);
      state.snapshot = null;
    };
    builder
      .addCase(fetchCart.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchCart.fulfilled, (state, action) => {
        state.isLoading = false;
        apply(state, action.payload);
      })
      .addCase(fetchCart.rejected, (state) => {
        state.isLoading = false;
      })
      // Optimistic: change the line now, keep a snapshot to roll back to
      .addCase(setCartQty.pending, (state, action) => {
        const { product, qty } = action.meta.arg;
        if (state.sellerId && state.sellerId !== product.sellerId) return; // the server will answer 409
        state.snapshot = { sellerId: state.sellerId, items: state.items.map((i) => ({ ...i })), subtotalPaise: state.subtotalPaise };
        const line = state.items.find((i) => i.productId === product.id);
        if (line) line.qty = qty;
        else if (qty > 0) state.items.push({ productId: product.id, slug: product.slug, qty, title: product.title, pricePaise: product.pricePaise, servingTemp: product.servingTemp, art: product.art, weight: product.weight, stock: product.stock });
        state.items = state.items.filter((i) => i.qty > 0);
        state.sellerId = state.items.length ? product.sellerId : null;
        state.subtotalPaise = total(state.items);
      })
      .addCase(setCartQty.fulfilled, (state, action) => apply(state, action.payload))
      .addCase(setCartQty.rejected, (state) => {
        if (state.snapshot) Object.assign(state, state.snapshot);
        state.snapshot = null;
      })
      .addCase(clearServerCart.fulfilled, (state, action) => apply(state, action.payload));
  },
});

export const { resetCart } = cartSlice.actions;

/**
 * What ADD, + and − dispatch. Guests are asked to sign in first (then the add
 * continues), a second shop asks before clearing the cart, and the cart badge
 * bumps on success.
 */
export const updateQuantity = (product, qty, { replace = false } = {}) => async (dispatch, getState) => {
  if (getState().auth.user?.role !== 'customer') {
    dispatch(setSignInPrompt({ product, qty }));
    return;
  }
  const wasInCart = getState().cart.items.some((i) => i.productId === product.id);
  const result = await dispatch(setCartQty({ product, qty, replace }));
  if (setCartQty.fulfilled.match(result)) {
    dispatch(bumpCart());
    if (qty > 0 && !wasInCart) dispatch(addToast({ type: 'info', title: `${product.title} added`, message: `From ${product.shopName || 'this shop'}`, duration: 2200 }));
  } else if (result.payload?.code === 'CART_OTHER_SELLER') {
    dispatch(setCartConflict({ product, qty, message: result.payload.message }));
  } else {
    dispatch(addToast({ type: 'error', title: 'Could not update cart', message: result.payload?.message }));
  }
};
export const selectCartCount = (state) => state.cart.items.reduce((s, i) => s + i.qty, 0);
export const selectQtyOf = (id) => (state) => state.cart.items.find((i) => i.productId === id)?.qty || 0;
export default cartSlice.reducer;
