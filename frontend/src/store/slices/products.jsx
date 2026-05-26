import { createSlice } from '@reduxjs/toolkit';
import { apiThunk } from '../apiThunk';

const FRESH_MS = 30_000;
const pointKey = ({ lat, lng, pincode }) => `${lat},${lng},${pincode ?? ''}`;
// where to look, and the pincode when the address has one (shops that list pincodes check it)
const near = ({ lat, lng, pincode }) => `lat=${lat}&lng=${lng}${pincode ? `&pincode=${pincode}` : ''}`;

/**
 * Snacks from shops that can reach this point within 30 minutes (doc 8.3).
 * The condition skips a refetch while the cached list is fresh, which gives
 * the dedupe and caching the doc asks for (5.1) inside Redux.
 */
export const fetchProducts = apiThunk(
  'products/fetchAll',
  async (point, { apiFetch }) => ({ key: pointKey(point), items: await apiFetch(`/products?${near(point)}`) }),
  {
    condition: (point, { getState }) => {
      const s = getState().products;
      if (s.isLoading && s.loadingKey === pointKey(point)) return false;
      return !(s.itemsKey === pointKey(point) && Date.now() - s.fetchedAt < FRESH_MS);
    },
  },
);

export const fetchSellers = apiThunk('products/fetchSellers', async (point, { apiFetch }) => ({
  key: pointKey(point),
  sellers: await apiFetch(`/sellers?${near(point)}`),
}));

export const fetchShop = apiThunk('products/fetchShop', async ({ id, point }, { apiFetch }) => apiFetch(`/sellers/${id}?${near(point)}`));

// Search: Elasticsearch in the real stack, with a MySQL FULLTEXT fallback (doc 12.2)
export const searchProducts = apiThunk('products/search', async ({ q, point }, { apiFetch }) =>
  apiFetch(`/search?q=${encodeURIComponent(q)}&${near(point)}`),
);

const productsSlice = createSlice({
  name: 'products',
  initialState: {
    items: [],
    itemsKey: null,
    loadingKey: null,
    fetchedAt: 0,
    sellers: [],
    shops: {},
    shopErrors: {},
    search: { q: '', results: [] },
    isLoading: false,
    error: null,
  },
  reducers: {
    clearSearch: (state) => {
      state.search = { q: '', results: [] };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProducts.pending, (state, action) => {
        state.isLoading = true;
        state.loadingKey = pointKey(action.meta.arg);
        state.error = null;
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        state.isLoading = false;
        state.items = action.payload.items;
        state.itemsKey = action.payload.key;
        state.fetchedAt = Date.now();
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message;
      })
      .addCase(fetchSellers.fulfilled, (state, action) => {
        state.sellers = action.payload.sellers;
      })
      .addCase(fetchShop.fulfilled, (state, action) => {
        state.shops[action.meta.arg.id] = action.payload;
        delete state.shopErrors[action.meta.arg.id];
      })
      .addCase(fetchShop.rejected, (state, action) => {
        state.shopErrors[action.meta.arg.id] = action.payload?.message || 'Shop not found';
      })
      .addCase(searchProducts.fulfilled, (state, action) => {
        // Ignore answers for an older query that arrive late
        if (action.meta.arg.q === state.search.pending) state.search = { q: action.meta.arg.q, results: action.payload.results };
      })
      .addCase(searchProducts.pending, (state, action) => {
        state.search.pending = action.meta.arg.q;
      });
  },
});

export const { clearSearch } = productsSlice.actions;
export default productsSlice.reducer;
