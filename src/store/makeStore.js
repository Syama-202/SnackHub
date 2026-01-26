import { configureStore, createSlice } from '@reduxjs/toolkit';

// Redux holds auth and UI only. Server state lives in TanStack Query (doc 5.1).
// The session survives a reload through sessionStorage, standing in for the
// httpOnly refresh cookie the real Identity service sets.
const SESSION_KEY = 'snackhub.session';
const loadSession = (ns) => {
  try {
    return JSON.parse(sessionStorage.getItem(`${SESSION_KEY}.${ns}`)) || {};
  } catch {
    return {};
  }
};

export function makeStore(ns = 'web') {
  const saved = loadSession(ns);
  const auth = createSlice({
    name: 'auth',
    initialState: { token: saved.token || null, user: saved.user || null, mfaPending: null },
    reducers: {
      signedIn(s, a) {
        s.token = a.payload.token;
        s.user = a.payload.user;
        s.mfaPending = null;
      },
      mfaPending(s, a) {
        s.mfaPending = a.payload;
      },
      signedOut(s) {
        s.token = null;
        s.user = null;
        s.mfaPending = null;
      },
    },
  });
  const ui = createSlice({
    name: 'ui',
    initialState: { cartOpen: false, toasts: [], addressId: saved.addressId || 1, cartBump: 0 },
    reducers: {
      openCart(s) { s.cartOpen = true; },
      closeCart(s) { s.cartOpen = false; },
      bumpCart(s) { s.cartBump += 1; },
      setAddress(s, a) { s.addressId = a.payload; },
      toast(s, a) {
        s.toasts.push({ id: Date.now() + Math.random(), tone: 'info', ...a.payload });
        if (s.toasts.length > 3) s.toasts.shift();
      },
      dismissToast(s, a) { s.toasts = s.toasts.filter((t) => t.id !== a.payload); },
    },
  });
  const store = configureStore({ reducer: { auth: auth.reducer, ui: ui.reducer } });
  store.subscribe(() => {
    const { auth: a, ui: u } = store.getState();
    try {
      sessionStorage.setItem(`${SESSION_KEY}.${ns}`, JSON.stringify({ token: a.token, user: a.user, addressId: u.addressId }));
    } catch {
      /* ignore */
    }
  });
  return { store, actions: { ...auth.actions, ...ui.actions } };
}
