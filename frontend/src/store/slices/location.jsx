import { createSlice } from '@reduxjs/toolkit';
import { apiThunk } from '../apiThunk';
import { pickCurrentPoint, setAddress } from './ui';
import { signInWithGoogle, signInWithPassword, verifyMfa, confirmEnrolment } from './auth';
import { distanceM } from '@shared/domain/geo';
import { CITIES } from '@shared/domain/cities';

// Where the customer is (doc 12.2). The browser's position, asked right after a customer
// signs in (or when they tap "Use my current location"), goes to /locate, which says which
// city it is in, how many shops deliver there and, where place lookup is set up, the street
// and pincode. The cities come from the API (catalog.cities), so a new city needs no release.

/** The browser's position, or a coded failure: DENIED, UNAVAILABLE or UNSUPPORTED. */
function currentPosition() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(Object.assign(new Error('This browser cannot share a location'), { code: 'UNSUPPORTED' }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }),
      (e) => reject(Object.assign(new Error(e.message || 'No location'), { code: e.code === 1 ? 'DENIED' : 'UNAVAILABLE' })),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 120000 },
    );
  });
}

const query = ({ lat, lng, pincode }) => `lat=${lat}&lng=${lng}${pincode ? `&pincode=${pincode}` : ''}`;

export const fetchCities = apiThunk('location/cities', async (_, { apiFetch }) => apiFetch('/cities'));

/** What SnackHub knows about a delivery point (served, out of the zone, or a city not served yet). */
export const checkLocation = apiThunk('location/check', async (point, { apiFetch }) => ({ ...(await apiFetch(`/locate?${query(point)}`)), at: { lat: point.lat, lng: point.lng } }));

/**
 * Asks the browser where the customer is and browses from there. A saved address within
 * 300 m of that spot is used instead (they are at home or at work). reason: 'login' or 'tap'.
 */
export const detectLocation = apiThunk('location/detect', async ({ reason = 'tap' } = {}, { apiFetch, dispatch, getState }) => {
  const here = await currentPosition();
  const info = await apiFetch(`/locate?${query(here)}`);
  const saved = (getState().profile.addresses ?? []).find((a) => distanceM(a, here) <= 300);
  if (saved) dispatch(setAddress(saved.id));
  else {
    const a = info.address;
    const place = info.city?.name ?? a?.city ?? info.nearestCity?.name;
    dispatch(
      pickCurrentPoint({
        id: 1,
        label: a?.locality || place || 'Current location',
        line: a?.line || (place ? `Your current location, ${info.city ? 'in' : 'near'} ${place}` : 'Your current location'),
        lat: here.lat,
        lng: here.lng,
        cityId: info.city?.id ?? info.nearestCity?.id ?? null,
        pincode: a?.pincode ?? undefined,
        current: true,
      }),
    );
  }
  return { ...info, at: here, reason, usedAddress: saved?.id ?? null };
});

const locationSlice = createSlice({
  name: 'location',
  initialState: {
    cities: CITIES, // until the API answers
    // the last detection: idle | asking | found | DENIED | UNAVAILABLE | UNSUPPORTED
    detect: 'idle',
    detectReason: null,
    // a customer just signed in: ask for their position once
    askAfterSignIn: false,
    // /locate for the current delivery point
    info: null,
  },
  reducers: {
    signInHandled: (state) => {
      state.askAfterSignIn = false;
    },
    detectDismissed: (state) => {
      state.detect = 'idle';
    },
  },
  extraReducers: (builder) => {
    const signedIn = (state, action) => {
      // a session opened (not the code step that still waits); customers are asked for their position
      if (action.payload?.accessToken && (action.payload.user?.role ?? 'customer') === 'customer') state.askAfterSignIn = true;
    };
    builder
      .addCase(signInWithPassword.fulfilled, signedIn)
      .addCase(signInWithGoogle.fulfilled, signedIn)
      .addCase(verifyMfa.fulfilled, signedIn)
      .addCase(confirmEnrolment.fulfilled, signedIn)
      .addCase(fetchCities.fulfilled, (state, action) => {
        if (Array.isArray(action.payload) && action.payload.length) state.cities = action.payload;
      })
      .addCase(detectLocation.pending, (state, action) => {
        state.detect = 'asking';
        state.detectReason = action.meta.arg?.reason ?? 'tap';
      })
      .addCase(detectLocation.fulfilled, (state, action) => {
        state.detect = 'found';
        state.info = action.payload;
      })
      .addCase(detectLocation.rejected, (state, action) => {
        state.detect = ['DENIED', 'UNSUPPORTED'].includes(action.payload?.code) ? action.payload.code : 'UNAVAILABLE';
      })
      .addCase(checkLocation.fulfilled, (state, action) => {
        state.info = action.payload;
      });
  },
});

export const { signInHandled, detectDismissed } = locationSlice.actions;
export default locationSlice.reducer;
