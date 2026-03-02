import { createSlice } from '@reduxjs/toolkit';
import { apiThunk } from '../apiThunk';

// In-app notification feed (doc 10.6). Messages never contain the delivery code.
export const fetchNotifications = apiThunk('notifications/fetch', async (_, { apiFetch }) => apiFetch('/me/notifications'));
export const markAllRead = apiThunk('notifications/markAllRead', async (_, { apiFetch }) => apiFetch('/me/notifications/read', { method: 'POST' }));

const notificationSlice = createSlice({
  name: 'notifications',
  initialState: { items: [], loaded: false },
  reducers: {
    resetNotifications: () => ({ items: [], loaded: false }),
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.items = action.payload;
        state.loaded = true;
      })
      .addCase(markAllRead.fulfilled, (state) => {
        state.items.forEach((n) => {
          if (!n.readAt) n.readAt = Date.now();
        });
      });
  },
});

export const { resetNotifications } = notificationSlice.actions;
export const selectUnreadCount = (state) => state.notifications.items.filter((n) => !n.readAt).length;
export default notificationSlice.reducer;
