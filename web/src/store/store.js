import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import toastReducer from './slices/toastSlice';
import uiReducer from './slices/uiSlice';
import productsReducer from './slices/productsSlice';
import cartReducer from './slices/cartSlice';
import profileReducer from './slices/profileSlice';
import orderReducer from './slices/orderSlice';
import notificationReducer from './slices/notificationSlice';
import sellerReducer from './slices/sellerSlice';
import riderReducer from './slices/riderSlice';

// Store for the public build: customer, seller and rider apps.
// The admin console has its own store (src/admin/store.js).
export const store = configureStore({
  reducer: {
    auth: authReducer,
    toast: toastReducer,
    ui: uiReducer,
    products: productsReducer,
    cart: cartReducer,
    profile: profileReducer,
    orders: orderReducer,
    notifications: notificationReducer,
    seller: sellerReducer,
    rider: riderReducer,
  },
});

export default store;
