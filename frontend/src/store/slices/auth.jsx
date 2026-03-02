import { createSlice, isAnyOf } from '@reduxjs/toolkit';
import { apiThunk } from '../apiThunk';
import { getApiHost, refreshAccessToken, setAccessToken } from '../../services/api';
import { deviceId } from '../../utils/device';

// Google sign-in (doc 16.1): the Google button gives an ID token, the backend checks it
// and issues our own tokens. A new Google account is always a customer.
export const signInWithGoogle = apiThunk('auth/google', async ({ credential }, { apiFetch }) => {
  const data = await apiFetch('/auth/google', { method: 'POST', body: { credential, deviceId: deviceId() }, retry: false });
  setAccessToken(data.accessToken);
  hint.set(true);
  return data;
});

// Demo accounts served by the in-browser mock: the seeded seller and rider (approved
// applications), the admin console, and a demo customer while Google is not set up.
export const signInWithDemo = apiThunk('auth/demo', async ({ demoRole = 'customer' }, { apiFetch }) => {
  const data = await apiFetch('/auth/demo', { method: 'POST', body: { demoRole }, retry: false });
  if (data.accessToken) {
    setAccessToken(data.accessToken);
    hint.set(true);
  }
  return data;
});

// Admin second factor (doc 16.3): turns the mfa_pending half-session into a token with mfa_at
export const verifyAdminMfa = apiThunk('auth/verifyMfa', async ({ code }, { apiFetch }) => {
  const data = await apiFetch('/admin/auth/mfa', { method: 'POST', body: { code }, retry: false });
  setAccessToken(data.accessToken);
  hint.set(true);
  return data;
});

// Not a secret: only a hint that a refresh cookie may exist, so a first visit skips the call.
// Kept per app, so the admin console and the customer site never clear each other's hint.
const HINT = () => `snackhub.hasSession.${getApiHost() || 'web'}`;
const hint = {
  get: () => {
    try {
      return localStorage.getItem(HINT()) === '1';
    } catch {
      return true;
    }
  },
  set: (on) => {
    try {
      if (on) localStorage.setItem(HINT(), '1');
      else localStorage.removeItem(HINT());
    } catch {
      /* storage blocked */
    }
  },
};

// Called once on app load: turns the httpOnly refresh cookie, if any, back into an access token
export const restoreSession = apiThunk('auth/restoreSession', async () => {
  if (!hint.get()) throw Object.assign(new Error('No session'), { code: 'NO_SESSION' });
  try {
    return await refreshAccessToken();
  } catch (e) {
    hint.set(false);
    throw e;
  }
});

export const logoutUser = apiThunk('auth/logout', async (_, { apiFetch }) => {
  await apiFetch('/auth/logout', { method: 'POST', retry: false }).catch(() => {});
  setAccessToken(null);
  hint.set(false);
  return null;
});

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    accessToken: null,
    mfaPending: null,
    isLoading: false,
    isInitializing: true,
    error: null,
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    // Demo helper for the admin step-up screen: pretend the factor was checked long ago
    tokenReplaced: (state, action) => {
      state.accessToken = action.payload;
      setAccessToken(action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(signInWithGoogle.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
      })
      .addCase(signInWithDemo.fulfilled, (state, action) => {
        state.isLoading = false;
        if (action.payload.mfaPending) {
          state.mfaPending = { user: action.payload.user };
        } else {
          state.user = action.payload.user;
          state.accessToken = action.payload.accessToken;
        }
      })
      .addCase(verifyAdminMfa.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(verifyAdminMfa.fulfilled, (state, action) => {
        state.isLoading = false;
        state.mfaPending = null;
        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
      })
      .addCase(verifyAdminMfa.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message;
      })
      .addCase(restoreSession.pending, (state) => {
        state.isInitializing = true;
      })
      .addCase(restoreSession.fulfilled, (state, action) => {
        state.isInitializing = false;
        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
      })
      .addCase(restoreSession.rejected, (state) => {
        state.isInitializing = false;
        state.user = null;
        state.accessToken = null;
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.accessToken = null;
        state.mfaPending = null;
      })
      .addMatcher(isAnyOf(signInWithGoogle.pending, signInWithDemo.pending), (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addMatcher(isAnyOf(signInWithGoogle.rejected, signInWithDemo.rejected), (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message;
      });
  },
});

export const { clearError, tokenReplaced } = authSlice.actions;
export const selectUser = (state) => state.auth.user;
export const selectRole = (state) => state.auth.user?.role;
export default authSlice.reducer;
