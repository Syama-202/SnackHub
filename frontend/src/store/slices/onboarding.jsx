import { createSlice } from '@reduxjs/toolkit';
import { apiThunk } from '../apiThunk';
import { apiUpload } from '../../services/api';

// Seller and rider onboarding (kind = 'seller' or 'rider'): the draft answers, the documents
// and where the application stands. Everything is saved on the server as it is entered, so
// the person can stop and come back later on any device.
export const loadOnboarding = apiThunk('onboarding/load', ({ kind }, { apiFetch }) => apiFetch(`/${kind}/onboarding`));

export const saveProfile = apiThunk('onboarding/saveProfile', ({ kind, body }, { apiFetch }) => apiFetch(`/${kind}/onboarding/profile`, { method: 'PUT', body }));

export const saveVehicle = apiThunk('onboarding/saveVehicle', ({ body }, { apiFetch }) => apiFetch('/rider/onboarding/vehicle', { method: 'PUT', body }));

/** One document with its details; progress goes to state.uploads while it is sent. */
export const uploadDocument = apiThunk('onboarding/upload', async ({ kind, docType, fields, file }, { dispatch }) => {
  const form = new FormData();
  form.append('docType', docType);
  for (const [k, v] of Object.entries(fields)) if (v) form.append(k, v);
  form.append('file', file);
  return apiUpload(`/${kind}/onboarding/documents`, form, { onProgress: (pct) => dispatch(uploadProgress({ kind, docType, pct })) });
});

export const withdrawDocument = apiThunk('onboarding/withdraw', ({ kind, id }, { apiFetch }) => apiFetch(`/${kind}/onboarding/documents/${id}`, { method: 'DELETE' }));

/** A five-minute link to view one of your own uploads. */
export const documentLink = apiThunk('onboarding/link', ({ kind, id }, { apiFetch }) => apiFetch(`/${kind}/onboarding/documents/${id}/link`, { method: 'POST', body: {} }));

export const submitApplication = apiThunk('onboarding/submit', ({ kind }, { apiFetch }) => apiFetch(`/${kind}/onboarding/submit`, { method: 'POST', body: {} }));

export const restartApplication = apiThunk('onboarding/restart', ({ kind }, { apiFetch }) => apiFetch(`/${kind}/onboarding/restart`, { method: 'POST', body: {} }));

// Approved riders go online and offline; going online is refused while a document is missing or expired
export const setAvailability = apiThunk('onboarding/availability', ({ status }, { apiFetch }) => apiFetch('/rider/availability', { method: 'POST', body: { status } }));

// An approved seller's own menu on the real API: publishing needs valid documents
export const loadOwnProducts = apiThunk('onboarding/products', (_, { apiFetch }) => apiFetch('/seller/products'));
export const setProductPublished = apiThunk('onboarding/publish', ({ id, active }, { apiFetch }) =>
  apiFetch(`/seller/products/${id}/${active ? 'publish' : 'unpublish'}`, { method: 'POST', body: {} }),
);

const empty = { view: null, loading: false, saving: false, error: null };
const key = (kind, docType) => `${kind}:${docType}`;

const onboardingSlice = createSlice({
  name: 'onboarding',
  initialState: { seller: { ...empty }, rider: { ...empty }, uploads: {}, products: null, availability: null, workError: null },
  reducers: {
    uploadProgress: (state, action) => {
      const { kind, docType, pct } = action.payload;
      state.uploads[key(kind, docType)] = { pct, error: null };
    },
    uploadCleared: (state, action) => {
      delete state.uploads[key(action.payload.kind, action.payload.docType)];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadOwnProducts.fulfilled, (state, action) => {
        state.products = action.payload;
      })
      .addCase(setProductPublished.pending, (state) => {
        state.workError = null;
      })
      .addCase(setProductPublished.fulfilled, (state, action) => {
        const p = state.products?.find((x) => x.id === action.payload.id);
        if (p) p.active = action.payload.active;
      })
      .addCase(setProductPublished.rejected, (state, action) => {
        state.workError = action.payload;
      })
      .addCase(setAvailability.pending, (state) => {
        state.workError = null;
      })
      .addCase(setAvailability.fulfilled, (state, action) => {
        state.availability = action.payload.status;
      })
      .addCase(setAvailability.rejected, (state, action) => {
        state.workError = action.payload;
      });
    const kindOf = (action) => action.meta.arg?.kind ?? 'rider';
    const viewThunks = [loadOnboarding, saveProfile, saveVehicle, uploadDocument, withdrawDocument, submitApplication, restartApplication];
    for (const t of viewThunks) {
      builder
        .addCase(t.pending, (state, action) => {
          const s = state[kindOf(action)];
          if (t === loadOnboarding) s.loading = !s.view;
          else s.saving = true;
          s.error = null;
          if (t === uploadDocument) state.uploads[key(kindOf(action), action.meta.arg.docType)] = { pct: 0, error: null };
        })
        .addCase(t.fulfilled, (state, action) => {
          const s = state[kindOf(action)];
          s.loading = false;
          s.saving = false;
          s.view = action.payload;
          if (t === uploadDocument) delete state.uploads[key(kindOf(action), action.meta.arg.docType)];
        })
        .addCase(t.rejected, (state, action) => {
          const s = state[kindOf(action)];
          s.loading = false;
          s.saving = false;
          s.error = action.payload;
          if (t === uploadDocument) state.uploads[key(kindOf(action), action.meta.arg.docType)] = { pct: null, error: action.payload?.message ?? 'The upload failed' };
        });
    }
  },
});

export const { uploadProgress, uploadCleared } = onboardingSlice.actions;
export const uploadKey = key;
export default onboardingSlice.reducer;
