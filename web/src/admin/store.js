import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../store/slices/authSlice';
import toastReducer from '../store/slices/toastSlice';
import adminReducer from '../store/slices/adminSlice';

// The admin console is a separate build with its own store (doc 16.3)
export const store = configureStore({
  reducer: {
    auth: authReducer,
    toast: toastReducer,
    admin: adminReducer,
  },
});

export default store;
