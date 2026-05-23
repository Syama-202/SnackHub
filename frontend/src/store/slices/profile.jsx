import { createSlice } from '@reduxjs/toolkit';
import { apiThunk } from '../apiThunk';
import { CITIES } from '@shared/domain/cities';
import { distanceM } from '@shared/domain/geo';

export const fetchAddresses = apiThunk('profile/fetchAddresses', async (_, { apiFetch }) => apiFetch('/me/addresses'));
export const addAddress = apiThunk('profile/addAddress', async (address, { apiFetch }) => apiFetch('/me/addresses', { method: 'POST', body: address }));
export const deleteAddress = apiThunk('profile/deleteAddress', async (id, { apiFetch }) => {
  await apiFetch(`/me/addresses/${id}`, { method: 'DELETE' });
  return id;
});
export const fetchCredits = apiThunk('profile/fetchCredits', async (_, { apiFetch }) => apiFetch('/me/credits'));

const profileSlice = createSlice({
  name: 'profile',
  initialState: { addresses: [], addressesLoaded: false, credits: [] },
  reducers: {
    resetProfile: () => ({ addresses: [], addressesLoaded: false, credits: [] }),
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAddresses.fulfilled, (state, action) => {
        state.addresses = action.payload;
        state.addressesLoaded = true;
      })
      .addCase(addAddress.fulfilled, (state, action) => {
        state.addresses.push(action.payload);
      })
      .addCase(deleteAddress.fulfilled, (state, action) => {
        state.addresses = state.addresses.filter((a) => a.id !== action.payload);
      })
      .addCase(fetchCredits.fulfilled, (state, action) => {
        state.credits = action.payload;
      });
  },
});

export const { resetProfile } = profileSlice.actions;

/** A guest browsing point at a city's centre. */
export const cityPoint = (c) => ({ id: 1, label: c.name, line: `${c.name}, ${c.state} (city centre)`, lat: c.lat, lng: c.lng, cityId: c.id });

/** A guest browsing point at the phone's position, named after the nearest city. */
export const herePoint = ({ lat, lng }) => {
  const near = CITIES.reduce((best, c) => (distanceM(c, { lat, lng }) < distanceM(best, { lat, lng }) ? c : best));
  return { id: 1, label: 'Current location', line: `Your current location, near ${near.name}`, lat, lng, cityId: near.id };
};

// until a guest picks a city or shares their location, browsing starts at the first demo city
export const GUEST_POINT = cityPoint(CITIES[0]);


/** The selected delivery point: a saved address, else the guest's city or location. */
export const selectDeliveryPoint = (state) => state.profile.addresses.find((a) => a.id === state.ui.addressId) || state.ui.guestPoint || GUEST_POINT;

export default profileSlice.reducer;
