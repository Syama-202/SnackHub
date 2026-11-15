import { createSlice } from '@reduxjs/toolkit';

// the chosen saved address, or 0 for "where I am now" (the current location, kept as guestPoint)
const ADDRESS_KEY = 'snackhub.addressId';
export const HERE = 0;
const savedAddress = () => {
  try {
    const v = localStorage.getItem(ADDRESS_KEY);
    return v === String(HERE) ? HERE : Number(v) || 1;
  } catch {
    return 1;
  }
};

// a chosen city or the current location (this browser only): a guest's browsing point, and a
// signed-in customer's when they browse from where they are instead of a saved address
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
    // browse from a city or the current location, also when signed in with saved addresses
    pickCurrentPoint: (state, action) => {
      state.guestPoint = action.payload;
      state.addressId = HERE;
      try {
        localStorage.setItem(GUEST_KEY, JSON.stringify(action.payload));
        localStorage.setItem(ADDRESS_KEY, String(HERE));
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

export const { openCart, closeCart, bumpCart, setAddress, setGuestPoint, pickCurrentPoint, openProduct, closeProduct, setCartConflict, setSignInPrompt } = uiSlice.actions;
export default uiSlice.reducer;
