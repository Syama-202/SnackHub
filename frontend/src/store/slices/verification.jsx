import { createSlice } from '@reduxjs/toolkit';
import { apiThunk } from '../apiThunk';

// The verification team's console (admin build only), on the real API: the queue, one
// application at a time, document reviews and decisions, expiring documents, the document
// requirements, accounts and the audit log. Decisions need a code from the last 5 minutes;
// the console asks for one when the API answers MFA_REQUIRED.
const qs = (params) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false).map(([k, v]) => [k, String(v)]));
  return q.toString() ? `?${q}` : '';
};

export const loadQueue = apiThunk('verification/queue', ({ kind, ...params }, { apiFetch }) => apiFetch(`/admin/verification/${kind}${qs(params)}`));
export const loadItem = apiThunk('verification/item', ({ ref }, { apiFetch }) => apiFetch(`/admin/verification/item/${ref}`));
export const tickCheck = apiThunk('verification/check', ({ ref, check, value }, { apiFetch }) => apiFetch(`/admin/verification/item/${ref}/check`, { method: 'POST', body: { check, value } }));
export const decideItem = apiThunk('verification/decide', ({ ref, action, reason }, { apiFetch }) => apiFetch(`/admin/verification/item/${ref}/${action}`, { method: 'POST', body: reason ? { reason } : {} }));
export const reviewDocument = apiThunk('verification/document', ({ ref, decision, reason, remarks }, { apiFetch }) =>
  apiFetch(`/admin/documents/${ref}/review`, { method: 'POST', body: { decision, ...(reason ? { reason } : {}), ...(remarks ? { remarks } : {}) } }),
);
export const documentLink = apiThunk('verification/link', ({ ref }, { apiFetch }) => apiFetch(`/admin/documents/${ref}/link`, { method: 'POST', body: {} }));
export const revealNumber = apiThunk('verification/number', ({ ref }, { apiFetch }) => apiFetch(`/admin/documents/${ref}/number`, { method: 'POST', body: {} }));
export const loadExpiring = apiThunk('verification/expiring', (_, { apiFetch }) => apiFetch('/admin/expiring'));
export const loadRequirements = apiThunk('verification/requirements', ({ kind }, { apiFetch }) => apiFetch(`/admin/requirements/${kind}`));
export const saveRequirements = apiThunk('verification/saveRequirements', ({ kind, rows }, { apiFetch }) => apiFetch(`/admin/requirements/${kind}`, { method: 'PUT', body: { rows } }));
export const loadUsers = apiThunk('verification/users', (params, { apiFetch }) => apiFetch(`/admin/users${qs(params)}`));
// action: suspend | reactivate | mfa-reset; role: one role instead of the whole account
export const userAction = apiThunk('verification/userAction', ({ id, action, role, reason }, { apiFetch }) =>
  apiFetch(role ? `/admin/users/${id}/roles/${role}/${action}` : `/admin/users/${id}/${action}`, { method: 'POST', body: { reason } }),
);
export const loadAudit = apiThunk('verification/audit', (params, { apiFetch }) => apiFetch(`/admin/audit${qs(params)}`));

const verificationSlice = createSlice({
  name: 'verification',
  initialState: { queue: null, item: null, expiring: null, requirements: {}, users: null, audit: null, loading: false, error: null },
  reducers: {
    itemClosed: (state) => {
      state.item = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadQueue.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadQueue.fulfilled, (state, action) => {
        state.loading = false;
        state.queue = action.payload;
      })
      .addCase(loadQueue.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(loadExpiring.fulfilled, (state, action) => {
        state.expiring = action.payload;
      })
      .addCase(loadRequirements.fulfilled, (state, action) => {
        state.requirements[action.payload.kind] = action.payload;
      })
      .addCase(saveRequirements.fulfilled, (state, action) => {
        state.requirements[action.payload.kind] = { ...state.requirements[action.payload.kind], rows: action.payload.rows };
      })
      .addCase(loadUsers.fulfilled, (state, action) => {
        state.users = action.payload;
      })
      .addCase(loadAudit.fulfilled, (state, action) => {
        state.audit = action.payload;
      });
    // every call that returns an application refreshes the open one
    for (const t of [loadItem, tickCheck, decideItem, reviewDocument]) {
      builder.addCase(t.fulfilled, (state, action) => {
        state.item = action.payload;
        const row = state.queue?.items.find((i) => i.ref === action.payload.ref);
        if (row) row.status = action.payload.status;
      });
    }
  },
});

export const { itemClosed } = verificationSlice.actions;
export default verificationSlice.reducer;
