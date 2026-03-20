import { createSlice, isAnyOf } from '@reduxjs/toolkit';
import { apiThunk } from '../apiThunk';
import { sessionUpgraded, logoutUser } from './auth';

// The signed-in person's own security settings: password, authenticator, recovery codes,
// mobile number and sessions. Every sensitive change needs the current password or code.
export const loadSecurity = apiThunk('security/load', (_, { apiFetch }) => apiFetch('/auth/security'));

export const changePassword = apiThunk('security/password', (body, { apiFetch }) => apiFetch('/auth/password/change', { method: 'POST', body }));

export const startMfaSetup = apiThunk('security/mfaStart', (_, { apiFetch }) => apiFetch('/auth/security/mfa/start', { method: 'POST', body: {} }));

export const confirmMfaSetup = apiThunk('security/mfaConfirm', async ({ code }, { apiFetch, dispatch }) => {
  const data = await apiFetch('/auth/security/mfa/confirm', { method: 'POST', body: { code } });
  dispatch(sessionUpgraded(data));
  dispatch(loadSecurity());
  return data;
});

export const disableMfa = apiThunk('security/mfaDisable', async ({ code }, { apiFetch, dispatch }) => {
  const data = await apiFetch('/auth/mfa/disable', { method: 'POST', body: { code } });
  dispatch(loadSecurity());
  return data;
});

export const regenerateRecoveryCodes = apiThunk('security/codes', async ({ code }, { apiFetch, dispatch }) => {
  const data = await apiFetch('/auth/mfa/recovery-codes', { method: 'POST', body: { code } });
  dispatch(loadSecurity());
  return data;
});

export const endSession = apiThunk('security/endSession', async ({ id }, { apiFetch, dispatch }) => {
  await apiFetch(`/auth/sessions/${id}`, { method: 'DELETE' });
  dispatch(loadSecurity());
  return id;
});

export const logoutEverywhere = apiThunk('security/logoutAll', async (_, { apiFetch, dispatch }) => {
  await apiFetch('/auth/logout-all', { method: 'POST' });
  await dispatch(logoutUser());
  return true;
});

export const startMobile = apiThunk('security/mobileStart', (body, { apiFetch }) => apiFetch('/auth/mobile/start', { method: 'POST', body }));

export const verifyMobile = apiThunk('security/mobileVerify', async ({ code }, { apiFetch, dispatch }) => {
  const data = await apiFetch('/auth/mobile/verify', { method: 'POST', body: { code } });
  dispatch(loadSecurity());
  return data;
});

const securitySlice = createSlice({
  name: 'security',
  initialState: { data: null, loading: false, error: null, setup: null, recoveryCodes: null },
  reducers: {
    setupCancelled: (state) => {
      state.setup = null;
    },
    codesSeen: (state) => {
      state.recoveryCodes = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadSecurity.pending, (state) => {
        state.loading = !state.data;
        state.error = null;
      })
      .addCase(loadSecurity.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
      })
      .addCase(loadSecurity.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(startMfaSetup.fulfilled, (state, action) => {
        state.setup = action.payload;
      })
      .addCase(logoutUser.fulfilled, () => ({ data: null, loading: false, error: null, setup: null, recoveryCodes: null }))
      .addMatcher(isAnyOf(confirmMfaSetup.fulfilled, regenerateRecoveryCodes.fulfilled), (state, action) => {
        state.setup = null;
        state.recoveryCodes = action.payload.recoveryCodes;
      });
  },
});

export const { setupCancelled, codesSeen } = securitySlice.actions;
export default securitySlice.reducer;
