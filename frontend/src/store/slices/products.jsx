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
      // fresh: the clock changed something (useAvailabilityRefresh), ask even if just fetched
      return Boolean(point.fresh) || !(s.itemsKey === pointKey(point) && Date.now() - s.fetchedAt < FRESH_MS);
    },
  },
);

export const fetchSellers = apiThunk('products/fetchSellers', async (point, { apiFetch }) => ({
  key: pointKey(point),
  sellers: await apiFetch(`/sellers?${near(point)}`),
}));

export const fetchShop = apiThunk('products/fetchShop', async ({ id, point }, { apiFetch }) => apiFetch(`/sellers/${id}?${near(point)}`));

// Search (doc 12.3): Elasticsearch where it runs, PostgreSQL otherwise; the server decides what
// can be ordered. filters: { category, minPrice, maxPrice, minRating, maxKm, availability, shopId }
const searchQuery = ({ q, point, filters = {}, sort, page }) => {
  // defaults (any availability, relevance, the first page) are left out of the address
  const extra = Object.entries({ ...filters, sort, page }).filter(([k, v]) => v != null && v !== '' && v !== 'any' && v !== 'relevance' && !(k === 'page' && Number(v) === 1));
  return `q=${encodeURIComponent(q)}&${near(point)}${extra.map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('')}`;
};
export const searchProducts = apiThunk('products/search', async (args, { apiFetch }) => ({ key: searchQuery(args), ...(await apiFetch(`/search?${searchQuery(args)}`)) }));

// autocomplete while typing: snack and shop names that reach the delivery point
export const suggestSearch = apiThunk('products/suggest', async ({ q, point }, { apiFetch }) => apiFetch(`/search/suggest?q=${encodeURIComponent(q)}&${near(point)}`));

// one catalogue snack at every open shop that delivers here, cheapest first
export const fetchOffers = apiThunk('products/fetchOffers', async ({ itemId, point }, { apiFetch }) => apiFetch(`/catalogue/${itemId}/offers?${near(point)}`));

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
    search: { key: null, pending: null, q: '', results: [], total: 0, page: 1, pages: 1, location: null, loading: false, error: null },
    suggest: { q: '', pending: null, suggestions: [] },
    isLoading: false,
    error: null,
  },
  reducers: {
    clearSearch: (state) => {
      state.suggest = { q: '', pending: null, suggestions: [] };
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
      .addCase(searchProducts.pending, (state, action) => {
        state.search.pending = searchQuery(action.meta.arg);
        state.search.loading = true;
        state.search.error = null;
      })
      .addCase(searchProducts.fulfilled, (state, action) => {
        // an answer for an older query that arrives late is dropped
        if (action.payload.key !== state.search.pending) return;
        const { key, results, total, page, pages, location, q } = action.payload;
        state.search = { ...state.search, key, q, results, total, page, pages, location, loading: false, error: null };
      })
      .addCase(searchProducts.rejected, (state, action) => {
        if (searchQuery(action.meta.arg) !== state.search.pending) return;
        state.search.loading = false;
        state.search.error = action.payload?.message ?? 'Search is not answering';
      })
      .addCase(suggestSearch.pending, (state, action) => {
        state.suggest.pending = action.meta.arg.q;
      })
      .addCase(suggestSearch.fulfilled, (state, action) => {
        if (action.meta.arg.q === state.suggest.pending) state.suggest = { q: action.meta.arg.q, pending: null, suggestions: action.payload.suggestions };
      });
  },
});

export const { clearSearch } = productsSlice.actions;
export default productsSlice.reducer;
