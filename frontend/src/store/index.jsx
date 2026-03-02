import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/auth';
import toastReducer from './slices/toast';
import uiReducer from './slices/ui';
import productsReducer from './slices/products';
import cartReducer from './slices/cart';
import profileReducer from './slices/profile';
import orderReducer from './slices/order';
import notificationReducer from './slices/notification';
import sellerReducer from './slices/seller';
import riderReducer from './slices/rider';

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
