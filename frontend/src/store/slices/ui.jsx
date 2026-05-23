import { createSlice } from '@reduxjs/toolkit';

const ADDRESS_KEY = 'snackhub.addressId';
const savedAddress = () => {
  try {
    return Number(localStorage.getItem(ADDRESS_KEY)) || 1;
  } catch {
    return 1;
  }
};

// a guest's chosen city or current location (this browser only; signed-in customers use addresses)
const GUEST_KEY = 'snackhub.guestPoint';
const savedGuestPoint = () => {
  try {
    const p = JSON.parse(localStorage.getItem(GUEST_KEY));
    return p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && typeof p.label === 'string' ? p : null;
  } catch {
    return null;
  }
};

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    cartOpen: false,
    cartBump: 0,
    addressId: savedAddress(),
    guestPoint: savedGuestPoint(),
    selectedProduct: null, // product details modal
    cartConflict: null, // { product, qty, message } when adding from a second shop
    signInPrompt: null, // { product, qty } waiting for a guest to sign in
  },
  reducers: {
    openCart: (state) => {
      state.cartOpen = true;
    },
    closeCart: (state) => {
      state.cartOpen = false;
    },
    bumpCart: (state) => {
      state.cartBump += 1;
    },
    setAddress: (state, action) => {
      state.addressId = action.payload;
      try {
        localStorage.setItem(ADDRESS_KEY, String(action.payload));
      } catch {
        /* storage blocked */
      }
    },
    setGuestPoint: (state, action) => {
      state.guestPoint = action.payload;
      try {
        localStorage.setItem(GUEST_KEY, JSON.stringify(action.payload));
      } catch {
        /* storage blocked */
      }
    },
    openProduct: (state, action) => {
      state.selectedProduct = action.payload;
    },
    closeProduct: (state) => {
      state.selectedProduct = null;
    },
    setCartConflict: (state, action) => {
      state.cartConflict = action.payload;
    },
    setSignInPrompt: (state, action) => {
      state.signInPrompt = action.payload;
    },
  },
});

export const { openCart, closeCart, bumpCart, setAddress, setGuestPoint, openProduct, closeProduct, setCartConflict, setSignInPrompt } = uiSlice.actions;
export default uiSlice.reducer;
