import { createSlice } from '@reduxjs/toolkit';
import { apiThunk } from '../apiThunk';

// In-app notification feed (doc 10.6). Messages never contain the delivery code.
export const fetchNotifications = apiThunk('notifications/fetch', async (_, { apiFetch }) => apiFetch('/me/notifications'));
export const markAllRead = apiThunk('notifications/markAllRead', async (_, { apiFetch }) => apiFetch('/me/notifications/read', { method: 'POST' }));

// Push copies of these messages on this device (shared/domain/push.js). The endpoint is a
// secret address, so it always goes in a request body.
export const fetchPushStatus = apiThunk('notifications/pushStatus', async (endpoint, { apiFetch }) => apiFetch('/auth/push/status', { method: 'POST', body: endpoint ? { endpoint } : {} }));
export const savePushDevice = apiThunk('notifications/pushSubscribe', async (sub, { apiFetch }) => apiFetch('/auth/push/subscriptions', { method: 'POST', body: sub }));
export const removePushDevice = apiThunk('notifications/pushUnsubscribe', async (endpoint, { apiFetch }) => apiFetch('/auth/push/unsubscribe', { method: 'POST', body: { endpoint } }));
export const sendTestPush = apiThunk('notifications/pushTest', async (_, { apiFetch }) => apiFetch('/auth/push/test', { method: 'POST' }));

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
