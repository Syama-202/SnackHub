import { createSlice } from '@reduxjs/toolkit';
import { apiThunk } from '../apiThunk';
import { apiUpload } from '../../services/api';

// Checkout: the server recomputes prices, re-runs serviceability and reserves stock
export const fetchQuote = apiThunk('orders/quote', async ({ addressId }, { apiFetch }) => apiFetch('/orders/quote', { method: 'POST', body: { addressId } }));

export const placeOrder = apiThunk('orders/place', async ({ addressId, paymentMode, note, simulate, idempotencyKey }, { apiFetch }) =>
  apiFetch('/orders', { method: 'POST', idempotencyKey, body: { addressId, paymentMode, note: note?.trim() || undefined, simulate } }),
);

// Online payment (doc 10.9): placing an ONLINE order returns PhonePe's pay page; afterwards the
// server asks PhonePe itself. The browser's return from the pay page proves nothing.
export const checkPayment = apiThunk('orders/checkPayment', async (orderId, { apiFetch }) => apiFetch(`/orders/${orderId}/payment/check`, { method: 'POST' }));

export const fetchOrders = apiThunk('orders/fetchAll', async (_, { apiFetch }) => apiFetch('/orders'));
// older history, a page at a time, after the last order shown
export const OLDER_PAGE = 20;
export const fetchOlderOrders = apiThunk('orders/fetchOlder', async (before, { apiFetch }) => apiFetch(`/orders?before=${before}&limit=${OLDER_PAGE}`));
export const fetchOrder = apiThunk('orders/fetchOne', async (id, { apiFetch }) => apiFetch(`/orders/${id}`));

// Stand-in for the socket events order:update and rider:location (doc 10.4)
export const fetchTracking = apiThunk('orders/track', async (id, { apiFetch }) => apiFetch(`/orders/${id}/track`));

// The delivery code comes only from this endpoint, never in order payloads (doc 10.3)
export const fetchOtp = apiThunk('orders/otp', async (id, { apiFetch }) => apiFetch(`/orders/${id}/otp`));

// the cart refilled from a past order at today's prices; what was left out comes back as skipped
export const reorder = apiThunk('orders/reorder', async (id, { apiFetch }) => apiFetch(`/orders/${id}/reorder`, { method: 'POST', body: {} }));
export const cancelOrder = apiThunk('orders/cancel', async (id, { apiFetch }) => apiFetch(`/orders/${id}/cancel`, { method: 'POST' }));
export const reviewOrder = apiThunk('orders/review', async ({ id, rating }, { apiFetch }) => apiFetch(`/orders/${id}/review`, { method: 'POST', body: { rating } }));
// A real account sends the photos as multipart; the demo mock only needs their count
export const fileComplaint = apiThunk('orders/complaint', async ({ id, files, demo, ...body }, { apiFetch }) => {
  if (demo) return apiFetch(`/orders/${id}/complaints`, { method: 'POST', body });
  const form = new FormData();
  form.append('category', body.category);
  form.append('subtype', body.subtype);
  if (body.description) form.append('description', body.description);
  if (body.itemIds?.length) form.append('itemIds', body.itemIds.join(','));
  for (const f of files ?? []) form.append('photos', f);
  return apiUpload(`/orders/${id}/complaints`, form);
});

const orderSlice = createSlice({
  name: 'orders',
  initialState: {
    list: [],
    listLoaded: false,
    // the first load failed: the history page offers to try again instead of loading forever
    listError: false,
    // older pages of the history, loaded on request
    older: [],
    olderDone: false,
    byId: {},
    tracking: {},
    trackingErrors: {},
    otp: {},
    quote: null,
    quoteError: null,
    quoteLoading: false,
  },
  reducers: {
    resetOrders: (state) => {
      state.list = [];
      state.listLoaded = false;
      state.listError = false;
      state.older = [];
      state.olderDone = false;
      state.byId = {};
      state.tracking = {};
      state.otp = {};
      state.quote = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchQuote.pending, (state) => {
        state.quoteLoading = true;
      })
      .addCase(fetchQuote.fulfilled, (state, action) => {
        state.quoteLoading = false;
        state.quote = action.payload;
        state.quoteError = null;
      })
      .addCase(fetchQuote.rejected, (state, action) => {
        state.quoteLoading = false;
        state.quote = null;
        state.quoteError = action.payload;
      })
      .addCase(placeOrder.fulfilled, (state, action) => {
        const o = action.payload.order;
        state.byId[o.id] = o;
        state.list = [o, ...state.list.filter((x) => x.id !== o.id)];
      })
      .addCase(checkPayment.fulfilled, (state, action) => {
        const o = action.payload;
        state.byId[o.id] = o;
        state.list = state.list.map((x) => (x.id === o.id ? o : x));
        // the tracking page reads the order from its tracking entry
        if (state.tracking[o.id]) state.tracking[o.id] = { ...state.tracking[o.id], stage: o.status, order: o };
      })
      .addCase(fetchOrders.fulfilled, (state, action) => {
        state.list = action.payload;
        state.listLoaded = true;
        state.listError = false;
      })
      .addCase(fetchOrders.pending, (state) => {
        state.listError = false;
      })
      .addCase(fetchOrders.rejected, (state) => {
        // a failed refresh keeps the list already shown
        if (!state.listLoaded) state.listError = true;
      })
      .addCase(fetchOlderOrders.fulfilled, (state, action) => {
        const known = new Set([...state.list, ...state.older].map((o) => o.id));
        state.older.push(...action.payload.filter((o) => !known.has(o.id)));
        state.olderDone = action.payload.length < OLDER_PAGE;
      })
      .addCase(fetchOrder.fulfilled, (state, action) => {
        state.byId[action.payload.id] = action.payload;
      })
      .addCase(fetchTracking.fulfilled, (state, action) => {
        state.tracking[action.meta.arg] = action.payload;
        delete state.trackingErrors[action.meta.arg];
      })
      .addCase(fetchTracking.rejected, (state, action) => {
        state.trackingErrors[action.meta.arg] = action.payload;
      })
      .addCase(fetchOtp.fulfilled, (state, action) => {
        state.otp[action.meta.arg] = action.payload.code;
      })
      .addCase(cancelOrder.fulfilled, (state, action) => {
        state.byId[action.payload.id] = action.payload;
        const t = state.tracking[action.payload.id];
        if (t) t.order = action.payload;
      });
  },
});

export const { resetOrders } = orderSlice.actions;
export default orderSlice.reducer;
