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
export const fetchApplications = get('applications', '/admin/applications');
export const fetchComplaints = get('complaints', '/admin/complaints');
export const fetchFines = get('fines', '/admin/fines');
export const fetchPolicy = get('policy', '/admin/policy');
export const fetchAudit = get('audit', '/admin/audit');

// action: approve | reject | needs-info | check
export const decideApplication = apiThunk('admin/decideApplication', async ({ id, action, body }, { apiFetch }) =>
  apiFetch(`/admin/applications/${id}/${action}`, { method: 'POST', body: body || {} }),
);
export const decideComplaint = apiThunk('admin/decideComplaint', async ({ id, ...body }, { apiFetch }) => apiFetch(`/admin/complaints/${id}/decide`, { method: 'POST', body }));
export const reverseFine = apiThunk('admin/reverseFine', async (id, { apiFetch }) => apiFetch(`/admin/fines/${id}/reverse`, { method: 'POST' }));
export const savePolicy = apiThunk('admin/savePolicy', async (changes, { apiFetch }) => apiFetch('/admin/policy', { method: 'PUT', body: changes }));

const fetchers = [fetchSla, fetchAdminOrders, fetchAdminRiders, fetchAdminSellers, fetchReconciliation, fetchApplications, fetchComplaints, fetchFines, fetchPolicy, fetchAudit];
const replaceIn = (list, item) => (list || []).map((x) => (x.id === item.id ? item : x));

const adminSlice = createSlice({
  name: 'admin',
  initialState: { sla: null, orders: [], riders: [], sellers: [], reconciliation: [], applications: [], complaints: [], fines: [], policy: null, audit: [] },
  reducers: {},
  extraReducers: (builder) => {
    fetchers.forEach((f) =>
      builder.addCase(f.fulfilled, (state, action) => {
        state[action.payload.key] = action.payload.data;
      }),
    );
    builder
      .addCase(decideApplication.fulfilled, (state, action) => {
        state.applications = replaceIn(state.applications, action.payload);
      })
      .addCase(decideComplaint.fulfilled, (state, action) => {
        state.complaints = replaceIn(state.complaints, action.payload);
      })
      .addCase(reverseFine.fulfilled, (state, action) => {
        state.fines = replaceIn(state.fines, action.payload);
      });
  },
});

export default adminSlice.reducer;
