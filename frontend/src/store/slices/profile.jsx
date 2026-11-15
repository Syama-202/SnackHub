import { createSlice } from '@reduxjs/toolkit';
import { HERE } from './ui';
import { apiThunk } from '../apiThunk';
import { CITIES } from '@shared/domain/cities';
import { DELETE_CONFIRM } from '@shared/domain/accounts';

export const fetchAddresses = apiThunk('profile/fetchAddresses', async (_, { apiFetch }) => apiFetch('/me/addresses'));
export const addAddress = apiThunk('profile/addAddress', async (address, { apiFetch, dispatch }) => {
  const saved = await apiFetch('/me/addresses', { method: 'POST', body: address });
  // a new default changes another row too
  if (saved.isDefault) await dispatch(fetchAddresses());
  return saved;
});
/** Changes some fields, or { isDefault: true }; the answer is the whole list. */
export const updateAddress = apiThunk('profile/updateAddress', async ({ id, ...changes }, { apiFetch }) => apiFetch(`/me/addresses/${id}`, { method: 'PATCH', body: changes }));
export const deleteAddress = apiThunk('profile/deleteAddress', async (id, { apiFetch, dispatch }) => {
  await apiFetch(`/me/addresses/${id}`, { method: 'DELETE' });
  // the oldest one left may have become the default
  await dispatch(fetchAddresses());
  return id;
});
/** Up to five places in India for a typed query (through the API, never straight to the map server). */
export const searchPlaces = apiThunk('profile/searchPlaces', async (q, { apiFetch }) => apiFetch('/me/places/search', { method: 'POST', body: { q } }));
/** A street line for a pin, or null. */
export const describePin = apiThunk('profile/describePin', async (pin, { apiFetch }) => apiFetch('/me/places/reverse', { method: 'POST', body: pin }));
// favourites live on the account; the hearts read the ids, the page reads the list
export const fetchFavourites = apiThunk('profile/fetchFavourites', async (_, { apiFetch }) => apiFetch('/me/favourites'));
export const toggleFavourite = apiThunk('profile/toggleFavourite', async ({ id, on }, { apiFetch }) =>
  apiFetch(`/me/favourites/${id}`, on ? { method: 'PUT', body: {} } : { method: 'DELETE' }),
);
// Your data (DPDP Act): a copy of everything held about the account, and deleting it
export const fetchMyData = apiThunk('profile/fetchMyData', async (_, { apiFetch }) => apiFetch('/me/export'));
export const deleteMyAccount = apiThunk('profile/deleteMyAccount', async ({ password }, { apiFetch }) =>
  apiFetch('/me/delete', { method: 'POST', body: { confirm: DELETE_CONFIRM, ...(password ? { password } : {}) }, retry: false }),
);
export const fetchCredits = apiThunk('profile/fetchCredits', async (_, { apiFetch }) => apiFetch('/me/credits'));

const profileSlice = createSlice({
  name: 'profile',
  initialState: { addresses: [], addressesLoaded: false, credits: [], favouriteIds: [], favourites: [], favouritesLoaded: false },
  reducers: {
    resetProfile: () => ({ addresses: [], addressesLoaded: false, credits: [], favouriteIds: [], favourites: [], favouritesLoaded: false }),
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAddresses.fulfilled, (state, action) => {
        state.addresses = action.payload;
        state.addressesLoaded = true;
      })
      .addCase(addAddress.fulfilled, (state, action) => {
        if (!state.addresses.some((a) => a.id === action.payload.id)) state.addresses.push(action.payload);
      })
      .addCase(updateAddress.fulfilled, (state, action) => {
        state.addresses = action.payload;
      })
      .addCase(deleteAddress.fulfilled, (state, action) => {
        state.addresses = state.addresses.filter((a) => a.id !== action.payload);
      })
      .addCase(fetchFavourites.fulfilled, (state, action) => {
        state.favourites = action.payload;
        state.favouriteIds = action.payload.map((p) => p.id);
        state.favouritesLoaded = true;
      })
      // the heart changes at once; the server's answer settles it, a failure puts it back
      .addCase(toggleFavourite.pending, (state, action) => {
        const { id, on } = action.meta.arg;
        state.favouriteIds = on ? [id, ...state.favouriteIds.filter((x) => x !== id)] : state.favouriteIds.filter((x) => x !== id);
        if (!on) state.favourites = state.favourites.filter((p) => p.id !== id);
      })
      .addCase(toggleFavourite.fulfilled, (state, action) => {
        state.favouriteIds = action.payload.ids;
      })
      .addCase(toggleFavourite.rejected, (state, action) => {
        const { id, on } = action.meta.arg;
        state.favouriteIds = on ? state.favouriteIds.filter((x) => x !== id) : [id, ...state.favouriteIds];
      })
      .addCase(fetchCredits.fulfilled, (state, action) => {
        state.credits = action.payload;
      });
  },
});

export const { resetProfile } = profileSlice.actions;

/** A guest browsing point at a city's centre. */
export const cityPoint = (c) => ({ id: 1, label: c.name, line: `${c.name}, ${c.state} (city centre)`, lat: c.lat, lng: c.lng, cityId: c.id });

// until a guest picks a city or shares their location, browsing starts at the first city
export const GUEST_POINT = cityPoint(CITIES[0]);

/** The chosen saved address, else the customer's default one; none while browsing from where they are. */
export const selectSavedAddress = (state) =>
  state.ui.addressId === HERE ? null : state.profile.addresses.find((a) => a.id === state.ui.addressId) || state.profile.addresses.find((a) => a.isDefault) || null;

/** The selected delivery point: a saved address, else the chosen city or current location. */
export const selectDeliveryPoint = (state) => selectSavedAddress(state) || state.ui.guestPoint || GUEST_POINT;

export default profileSlice.reducer;
