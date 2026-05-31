import { createSlice } from '@reduxjs/toolkit';
import { apiThunk } from '../apiThunk';

// Admin console (doc 11.4). Every route needs fresh MFA; sensitive actions need
// MFA within 5 minutes and reject with code MFA_REQUIRED otherwise (doc 16.3).
const get = (key, path) => apiThunk(`admin/fetch_${key}`, async (_, { apiFetch }) => ({ key, data: await apiFetch(path) }));

export const fetchSla = get('sla', '/admin/metrics/sla');
export const fetchAdminOrders = get('orders', '/admin/orders');
export const fetchAdminRiders = get('riders', '/admin/riders');
export const fetchAdminSellers = get('sellers', '/admin/sellers');
export const fetchReconciliation = get('reconciliation', '/admin/reconciliation');
export const fetchComplaints = get('complaints', '/admin/complaints');
export const fetchFines = get('fines', '/admin/fines');
export const fetchPolicy = get('policy', '/admin/policy');
export const fetchAudit = get('audit', '/admin/audit');
export const fetchEarningsAdmin = get('earnings', '/admin/earnings');
export const fetchCash = get('cash', '/admin/cash');
export const fetchPayouts = get('payouts', '/admin/payouts');
export const fetchPayout = apiThunk('admin/fetchPayout', async (id, { apiFetch }) => apiFetch(`/admin/payouts/${id}`));
// a statement of everything payable to a shop; then paid (with the bank reference) or cancelled
export const draftPayout = apiThunk('admin/draftPayout', async (sellerId, { apiFetch }) => apiFetch('/admin/payouts', { method: 'POST', body: { sellerId } }));
export const markPayoutPaid = apiThunk('admin/markPayoutPaid', async ({ id, reference }, { apiFetch }) => apiFetch(`/admin/payouts/${id}/paid`, { method: 'POST', body: { reference } }));
export const cancelPayout = apiThunk('admin/cancelPayout', async ({ id, reason }, { apiFetch }) => apiFetch(`/admin/payouts/${id}/cancel`, { method: 'POST', body: { reason } }));

export const decideComplaint = apiThunk('admin/decideComplaint', async ({ id, ...body }, { apiFetch }) => apiFetch(`/admin/complaints/${id}/decide`, { method: 'POST', body }));
export const reverseFine = apiThunk('admin/reverseFine', async ({ id, reason }, { apiFetch }) => apiFetch(`/admin/fines/${id}/reverse`, { method: 'POST', body: { reason } }));
// a rider's dispute: give the lateness cut back (reverse) or keep it, always with a reason
export const resolveEarning = apiThunk('admin/resolveEarning', async ({ id, reverse, reason }, { apiFetch }) => apiFetch(`/admin/earnings/${id}/resolve`, { method: 'POST', body: { reverse, reason } }));
// cash a rider handed in; a mistake is reversed, never edited
export const recordDeposit = apiThunk('admin/recordDeposit', async (body, { apiFetch }) => apiFetch('/admin/cash/deposits', { method: 'POST', body }));
export const reverseDeposit = apiThunk('admin/reverseDeposit', async ({ id, reason }, { apiFetch }) => apiFetch(`/admin/cash/deposits/${id}/reverse`, { method: 'POST', body: { reason } }));
export const savePolicy = apiThunk('admin/savePolicy', async (changes, { apiFetch }) => apiFetch('/admin/policy', { method: 'PUT', body: changes }));

const fetchers = [fetchSla, fetchAdminOrders, fetchAdminRiders, fetchAdminSellers, fetchReconciliation, fetchComplaints, fetchFines, fetchPolicy, fetchAudit, fetchEarningsAdmin, fetchCash, fetchPayouts];
const replaceIn = (list, item) => (list || []).map((x) => (x.id === item.id ? item : x));

const adminSlice = createSlice({
  name: 'admin',
  initialState: { sla: null, orders: [], riders: [], sellers: [], reconciliation: [], complaints: [], fines: [], policy: null, audit: [], earnings: [], cash: null, payouts: null },
  reducers: {},
  extraReducers: (builder) => {
    fetchers.forEach((f) =>
      builder.addCase(f.fulfilled, (state, action) => {
        state[action.payload.key] = action.payload.data;
      }),
    );
    builder
      .addCase(decideComplaint.fulfilled, (state, action) => {
        state.complaints = replaceIn(state.complaints, action.payload);
      })
      .addCase(reverseFine.fulfilled, (state, action) => {
        state.fines = replaceIn(state.fines, action.payload);
      })
      .addCase(resolveEarning.fulfilled, (state, action) => {
        state.earnings = replaceIn(state.earnings, action.payload);
      });
  },
});

export default adminSlice.reducer;
