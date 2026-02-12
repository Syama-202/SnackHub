import { createSlice } from '@reduxjs/toolkit';

let toastId = 0;

const toastSlice = createSlice({
  name: 'toast',
  initialState: {
    toasts: [],
  },
  reducers: {
    // type: info | success | error | sun
    addToast: (state, action) => {
      state.toasts.push({
        id: ++toastId,
        type: action.payload.type || 'info',
        title: action.payload.title || '',
        message: action.payload.message || '',
        duration: action.payload.duration || 4200,
      });
      // Keep only the last 3 toasts
      if (state.toasts.length > 3) state.toasts = state.toasts.slice(-3);
    },
    removeToast: (state, action) => {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
  },
});

export const { addToast, removeToast } = toastSlice.actions;
export default toastSlice.reducer;
