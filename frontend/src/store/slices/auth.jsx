import { createSlice, isAnyOf } from '@reduxjs/toolkit';
import { apiThunk } from '../apiThunk';
import { getAccessToken, getApiHost, refreshAccessToken, setAccessToken } from '../../services/api';
import { deviceId } from '../../utils/device';

// Sign-in for every portal (customer, seller, rider): a password (or Google for customers),
// then, when the account has an authenticator or the portal requires one, the code step on a
// short challenge. The backend issues the session only after that step; nothing here can
// skip it. A new account must confirm its email before it can sign in.

/** A session answer: keep the token in memory, remember that a cookie may exist. */
function opened(data) {
  if (data.accessToken) {
    setAccessToken(data.accessToken);
    hint.set(true);
  }
  return data;
}

export const registerAccount = apiThunk('auth/register', async (body, { apiFetch }) => apiFetch('/auth/register', { method: 'POST', body, retry: false }));

export const verifyEmail = apiThunk('auth/verifyEmail', async ({ token }, { apiFetch }) => apiFetch('/auth/verify-email', { method: 'POST', body: { token }, retry: false }));

export const resendVerification = apiThunk('auth/resendVerification', async ({ email }, { apiFetch }) => apiFetch('/auth/resend-verification', { method: 'POST', body: { email }, retry: false }));

/** join: add this portal's role to an existing account (it still needs the right password). */
export const signInWithPassword = apiThunk('auth/password', async ({ portal, identifier, password, join = false }, { apiFetch }) =>
  opened(await apiFetch(join ? '/auth/join' : '/auth/signin', { method: 'POST', body: { portal, identifier, password, deviceId: deviceId() }, retry: false })),
);

// Google for the customer portal: the Google button gives an ID token, the backend checks it.
export const signInWithGoogle = apiThunk('auth/google', async ({ credential }, { apiFetch }) =>
  opened(await apiFetch('/auth/google', { method: 'POST', body: { credential, deviceId: deviceId() }, retry: false })),
);

// Demo accounts served by the in-browser mock: the seeded seller and rider, the admin
// console, and a demo customer while Google is not set up.
export const signInWithDemo = apiThunk('auth/demo', async ({ demoRole = 'customer' }, { apiFetch }) =>
  opened(await apiFetch('/auth/demo', { method: 'POST', body: { demoRole }, retry: false })),
);

// The code step: a TOTP code or a recovery code on the challenge from the first step
export const verifyMfa = apiThunk('auth/verifyMfa', async ({ code }, { apiFetch, getState }) => {
  const { challenge } = getState().auth.mfaPending ?? {};
  return opened(await apiFetch('/auth/mfa/verify', { method: 'POST', body: { challenge, code, deviceId: deviceId() }, retry: false }));
});

// Forced enrolment (a portal that requires an authenticator): the QR code for the challenge
export const startEnrolment = apiThunk('auth/startEnrolment', async (_, { apiFetch, getState }) => {
  const { challenge } = getState().auth.mfaPending ?? {};
  return apiFetch('/auth/mfa/enrol/start', { method: 'POST', body: { challenge, deviceId: deviceId() }, retry: false });
});

export const confirmEnrolment = apiThunk('auth/confirmEnrolment', async ({ code }, { apiFetch, getState }) => {
  const { challenge } = getState().auth.mfaPending ?? {};
  return opened(await apiFetch('/auth/mfa/enrol/confirm', { method: 'POST', body: { challenge, code, deviceId: deviceId() }, retry: false }));
});

export const forgotPassword = apiThunk('auth/forgot', async ({ email }, { apiFetch }) => apiFetch('/auth/password/forgot', { method: 'POST', body: { email }, retry: false }));

export const resetPassword = apiThunk('auth/reset', async ({ token, password }, { apiFetch }) => apiFetch('/auth/password/reset', { method: 'POST', body: { token, password }, retry: false }));

// Admin console, step 1 (doc 16.3): Google for an account on the staff list gives only a
// challenge for the code step, kept in memory
export const signInAdminWithGoogle = apiThunk('auth/adminGoogle', async ({ credential }, { apiFetch }) =>
  apiFetch('/admin/auth/google', { method: 'POST', body: { credential, deviceId: deviceId() }, retry: false }),
);

// Step 2: the challenge and a TOTP or recovery code give a token with mfa_at
export const verifyAdminMfa = apiThunk('auth/verifyAdminMfa', async ({ code }, { apiFetch, getState }) => {
  const { challenge } = getState().auth.mfaPending ?? {};
  return opened(await apiFetch('/admin/auth/mfa', { method: 'POST', body: { challenge, code }, retry: false }));
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

// A sensitive admin action needs a code from the last 5 minutes: a fresh code renews it
export const adminStepUp = apiThunk('auth/adminStepUp', async ({ code }, { apiFetch }) => {
  const data = await apiFetch('/admin/auth/step-up', { method: 'POST', body: { code }, retry: false });
  setAccessToken(data.accessToken);
  return data;
});

// The admin console only offers "sign out everywhere" (doc 16.3)
export const logoutUser = apiThunk('auth/logout', async (_, { apiFetch }) => {
  await apiFetch(getApiHost() === 'admin' ? '/admin/auth/logout-all' : '/auth/logout', { method: 'POST', retry: false }).catch(() => {});
  setAccessToken(null);
  hint.set(false);
  return null;
});

/** Demo sessions live in the in-browser mock; everything else is the real backend. */
export const isDemoSession = () => Boolean(getAccessToken()?.startsWith('demo.'));

const pendingFrom = (payload, demo = false) => ({ challenge: payload.challenge ?? payload.halfToken, purpose: payload.mfa ?? 'verify', methods: payload.methods ?? ['totp', 'recovery'], portal: payload.portal ?? payload.user?.role, user: payload.user ?? null, demo });

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    accessToken: null,
    // the code step after a correct password: { challenge, purpose: 'verify' | 'enrol', portal }
    mfaPending: null,
    // forced enrolment: the QR code and secret, shown once
    enrolment: null,
    // shown once after enrolment, then forgotten
    recoveryCodes: null,
    isLoading: false,
    isInitializing: true,
    error: null,
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    // back to the first step (the challenge expired, or another account)
    mfaCancelled: (state) => {
      state.mfaPending = null;
      state.enrolment = null;
      state.error = null;
    },
    recoveryCodesSeen: (state) => {
      state.recoveryCodes = null;
    },
    // Demo helper for the admin step-up screen: pretend the factor was checked long ago
    tokenReplaced: (state, action) => {
      state.accessToken = action.payload;
      setAccessToken(action.payload);
    },
    // the security page turned the authenticator on: the new token carries the factor
    sessionUpgraded: (state, action) => {
      state.accessToken = action.payload.accessToken;
      setAccessToken(action.payload.accessToken);
      if (state.user) state.user.mfaEnrolled = true;
    },
  },
  extraReducers: (builder) => {
    const session = (state, payload) => {
      state.isLoading = false;
      state.mfaPending = null;
      state.enrolment = null;
      state.user = payload.user;
      state.accessToken = payload.accessToken;
    };
    builder
      .addCase(signInWithDemo.fulfilled, (state, action) => {
        state.isLoading = false;
        if (action.payload.mfaPending) state.mfaPending = pendingFrom(action.payload, true);
        else session(state, action.payload);
      })
      .addCase(signInAdminWithGoogle.fulfilled, (state, action) => {
        state.isLoading = false;
        state.mfaPending = pendingFrom(action.payload);
      })
      .addCase(startEnrolment.fulfilled, (state, action) => {
        state.isLoading = false;
        state.enrolment = action.payload;
      })
      .addCase(confirmEnrolment.fulfilled, (state, action) => {
        session(state, action.payload);
        state.recoveryCodes = action.payload.recoveryCodes;
      })
      .addCase(adminStepUp.fulfilled, (state, action) => {
        state.accessToken = action.payload.accessToken;
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
        state.recoveryCodes = null;
      })
      // a first step either opens the session or asks for the code / enrolment
      .addMatcher(isAnyOf(signInWithPassword.fulfilled, signInWithGoogle.fulfilled), (state, action) => {
        if (action.payload.accessToken) session(state, action.payload);
        else {
          state.isLoading = false;
          state.mfaPending = pendingFrom(action.payload);
        }
      })
      .addMatcher(isAnyOf(verifyMfa.fulfilled, verifyAdminMfa.fulfilled), (state, action) => session(state, action.payload))
      .addMatcher(isAnyOf(signInWithPassword.pending, signInWithGoogle.pending, signInWithDemo.pending, signInAdminWithGoogle.pending, verifyMfa.pending, verifyAdminMfa.pending, startEnrolment.pending, confirmEnrolment.pending), (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addMatcher(isAnyOf(signInWithPassword.rejected, signInWithGoogle.rejected, signInWithDemo.rejected, signInAdminWithGoogle.rejected, verifyMfa.rejected, verifyAdminMfa.rejected, startEnrolment.rejected, confirmEnrolment.rejected), (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message;
        // a dead challenge sends the person back to the first step
        if (action.payload?.code === 'MFA_SESSION_EXPIRED') {
          state.mfaPending = null;
          state.enrolment = null;
        }
      });
  },
});

export const { clearError, tokenReplaced, mfaCancelled, recoveryCodesSeen, sessionUpgraded } = authSlice.actions;
export default authSlice.reducer;
