import { createSlice } from '@reduxjs/toolkit';

const ADDRESS_KEY = 'snackhub.addressId';
const savedAddress = () => {
  try {
    return Number(localStorage.getItem(ADDRESS_KEY)) || 1;
  } catch {
    return 1;
  }
};

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    cartOpen: false,
    cartBump: 0,
    addressId: savedAddress(),
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

export const { openCart, closeCart, bumpCart, setAddress, openProduct, closeProduct, setCartConflict, setSignInPrompt } = uiSlice.actions;
export default uiSlice.reducer;
