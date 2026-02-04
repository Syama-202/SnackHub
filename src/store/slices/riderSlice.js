import { createSlice } from '@reduxjs/toolkit';
import { apiThunk } from '../apiThunk';

// Rider PWA (doc 11.3): offers, delivery steps, location pings, earnings
export const fetchRiderProfile = apiThunk('rider/fetchMe', async (_, { apiFetch }) => apiFetch('/rider/me'));
export const setRiderStatus = apiThunk('rider/setStatus', async (status, { apiFetch }) => apiFetch('/rider/status', { method: 'PUT', body: { status } }));
export const fetchOffers = apiThunk('rider/fetchOffers', async (_, { apiFetch }) => apiFetch('/rider/offers'));
// action: accept | decline. Accepting is atomic on the server (rider_id IS NULL)
export const respondToOffer = apiThunk('rider/respondOffer', async ({ id, action }, { apiFetch }) => apiFetch(`/rider/offers/${id}/${action}`, { method: 'POST' }));
export const fetchActiveDelivery = apiThunk('rider/fetchActive', async (_, { apiFetch }) => apiFetch('/rider/active'));
// step: picked-up | deliver | emergency | unreachable
export const deliveryStep = apiThunk('rider/step', async ({ orderId, step, body }, { apiFetch }) => apiFetch(`/rider/orders/${orderId}/${step}`, { method: 'POST', body: body || {} }));
export const sendLocation = apiThunk('rider/location', async (point, { apiFetch }) => apiFetch('/rider/location', { method: 'POST', body: point }));
export const fetchEarnings = apiThunk('rider/fetchEarnings', async (_, { apiFetch }) => apiFetch('/rider/earnings'));
export const disputeEarning = apiThunk('rider/dispute', async ({ id, reason }, { apiFetch }) => apiFetch(`/rider/earnings/${id}/dispute`, { method: 'POST', body: { reason } }));

const riderSlice = createSlice({
  name: 'rider',
  initialState: { me: null, offers: [], active: null, activeLoaded: false, earnings: [], earningsLoaded: false, stepPending: false },
  reducers: {
    resetRider: () => ({ me: null, offers: [], active: null, activeLoaded: false, earnings: [], earningsLoaded: false, stepPending: false }),
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRiderProfile.fulfilled, (state, action) => {
        state.me = action.payload;
      })
      .addCase(setRiderStatus.fulfilled, (state, action) => {
        state.me = action.payload;
        if (action.payload.status === 'OFFLINE') state.offers = [];
      })
      .addCase(fetchOffers.fulfilled, (state, action) => {
        state.offers = action.payload;
      })
      .addCase(respondToOffer.fulfilled, (state, action) => {
        state.offers = state.offers.filter((o) => o.id !== action.meta.arg.id);
      })
      .addCase(respondToOffer.rejected, (state, action) => {
        state.offers = state.offers.filter((o) => o.id !== action.meta.arg.id);
      })
      .addCase(fetchActiveDelivery.fulfilled, (state, action) => {
        state.active = action.payload;
        state.activeLoaded = true;
      })
      .addCase(deliveryStep.pending, (state) => {
        state.stepPending = true;
      })
      .addCase(deliveryStep.fulfilled, (state) => {
        state.stepPending = false;
      })
      .addCase(deliveryStep.rejected, (state) => {
        state.stepPending = false;
      })
      .addCase(fetchEarnings.fulfilled, (state, action) => {
        state.earnings = action.payload;
        state.earningsLoaded = true;
      })
      .addCase(disputeEarning.fulfilled, (state, action) => {
        state.earnings = state.earnings.map((e) => (e.id === action.payload.id ? action.payload : e));
      });
  },
});

export const { resetRider } = riderSlice.actions;
export default riderSlice.reducer;
