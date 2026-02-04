import { createSlice } from '@reduxjs/toolkit';
import { apiThunk } from '../apiThunk';

// Checkout: the server recomputes prices, re-runs serviceability and reserves stock
export const fetchQuote = apiThunk('orders/quote', async ({ addressId }, { apiFetch }) => apiFetch('/orders/quote', { method: 'POST', body: { addressId } }));

export const placeOrder = apiThunk('orders/place', async ({ addressId, paymentMode, simulate, idempotencyKey }, { apiFetch }) =>
  apiFetch('/orders', { method: 'POST', idempotencyKey, body: { addressId, paymentMode, simulate } }),
);

// Razorpay (doc 10.9): the server decides the amount and creates the provider order
export const createPayment = apiThunk('orders/createPayment', async ({ orderId }, { apiFetch }) =>
  apiFetch('/payments', { method: 'POST', idempotencyKey: `pay-${orderId}`, body: { orderId } }),
);
// Browser fast path only; the signed webhook marks the order paid
export const verifyPayment = apiThunk('orders/verifyPayment', async (body, { apiFetch }) => apiFetch('/payments/verify', { method: 'POST', body }));
export const reportPaymentFailure = apiThunk('orders/paymentFailed', async (body, { apiFetch }) => apiFetch('/payments/fail', { method: 'POST', body }));
export const fetchPaymentStatus = apiThunk('orders/paymentStatus', async (orderId, { apiFetch }) => apiFetch(`/payments/by-order/${orderId}`));

export const fetchOrders = apiThunk('orders/fetchAll', async (_, { apiFetch }) => apiFetch('/orders'));
export const fetchOrder = apiThunk('orders/fetchOne', async (id, { apiFetch }) => apiFetch(`/orders/${id}`));

// Stand-in for the socket events order:update and rider:location (doc 10.4)
export const fetchTracking = apiThunk('orders/track', async (id, { apiFetch }) => apiFetch(`/orders/${id}/track`));

// The delivery code comes only from this endpoint, never in order payloads (doc 10.3)
export const fetchOtp = apiThunk('orders/otp', async (id, { apiFetch }) => apiFetch(`/orders/${id}/otp`));

export const cancelOrder = apiThunk('orders/cancel', async (id, { apiFetch }) => apiFetch(`/orders/${id}/cancel`, { method: 'POST' }));
export const reviewOrder = apiThunk('orders/review', async ({ id, rating }, { apiFetch }) => apiFetch(`/orders/${id}/review`, { method: 'POST', body: { rating } }));
export const fileComplaint = apiThunk('orders/complaint', async ({ id, ...body }, { apiFetch }) => apiFetch(`/orders/${id}/complaints`, { method: 'POST', body }));

const orderSlice = createSlice({
  name: 'orders',
  initialState: {
    list: [],
    listLoaded: false,
    byId: {},
    tracking: {},
    trackingErrors: {},
    otp: {},
    quote: null,
    quoteError: null,
    quoteLoading: false,
    payment: {},
  },
  reducers: {
    resetOrders: (state) => {
      state.list = [];
      state.listLoaded = false;
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
      .addCase(fetchPaymentStatus.fulfilled, (state, action) => {
        state.payment[action.meta.arg] = action.payload;
      })
      .addCase(fetchOrders.fulfilled, (state, action) => {
        state.list = action.payload;
        state.listLoaded = true;
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
