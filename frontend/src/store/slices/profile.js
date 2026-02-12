import { createSlice } from '@reduxjs/toolkit';
import { apiThunk } from '../apiThunk';

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

// Guests browse from the demo Guntur address
export const GUEST_POINT = { id: 1, label: 'Guntur (demo)', line: 'Brodipet, Guntur (demo)', lat: 16.3152, lng: 80.4301, cityId: 'guntur' };

/** The selected delivery point. */
export const selectDeliveryPoint = (state) => state.profile.addresses.find((a) => a.id === state.ui.addressId) || GUEST_POINT;

export default profileSlice.reducer;
