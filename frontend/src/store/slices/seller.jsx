import { createSlice } from '@reduxjs/toolkit';
import { apiThunk } from '../apiThunk';

// Seller console (doc 11.2). seller_id always comes from the token on the server.
export const fetchShopProfile = apiThunk('seller/fetchShop', async (_, { apiFetch }) => apiFetch('/seller/shop'));
export const updateShop = apiThunk('seller/updateShop', async (changes, { apiFetch }) => apiFetch('/seller/shop', { method: 'PATCH', body: changes }));
export const fetchSellerOrders = apiThunk('seller/fetchOrders', async (_, { apiFetch }) => apiFetch('/seller/orders'));
// action: accept | reject | start | packed
export const sellerOrderAction = apiThunk('seller/orderAction', async ({ id, action }, { apiFetch }) => apiFetch(`/seller/orders/${id}/${action}`, { method: 'POST' }));
// what the shop is owed and its statements
export const fetchPayouts = apiThunk('seller/fetchPayouts', async (_, { apiFetch }) => apiFetch('/seller/payouts'));
export const fetchSellerProducts = apiThunk('seller/fetchProducts', async (_, { apiFetch }) => apiFetch('/seller/products'));
// Stock edits are adjustments (plus or minus, with a reason), never a replacement (doc 10.8)
export const adjustStock = apiThunk('seller/adjustStock', async ({ id, delta, reason }, { apiFetch }) => apiFetch(`/seller/products/${id}/stock`, { method: 'PATCH', body: { delta, reason } }));
export const updateProduct = apiThunk('seller/updateProduct', async ({ id, ...changes }, { apiFetch }) => apiFetch(`/seller/products/${id}`, { method: 'PATCH', body: changes }));
// A new snack starts unlisted with no stock; listing it needs an approved shop with valid documents
// the shared catalogue, with what shops in the city charge; then one entry at the shop's own price
export const fetchCatalogue = apiThunk('seller/fetchCatalogue', async (q, { apiFetch }) => apiFetch(`/seller/catalogue${q ? `?q=${encodeURIComponent(q)}` : ''}`));
export const addFromCatalogue = apiThunk('seller/addFromCatalogue', async (fields, { apiFetch }) => apiFetch('/seller/products/from-catalogue', { method: 'POST', body: fields }));
export const createProduct = apiThunk('seller/createProduct', async (fields, { apiFetch }) => apiFetch('/seller/products', { method: 'POST', body: fields }));
// Demo only: an order arrives at this shop, to be run by hand
export const simulateIncomingOrder = apiThunk('seller/simulateOrder', async (_, { apiFetch }) => apiFetch('/dev/incoming-order', { method: 'POST' }));

const replaceProduct = (state, p) => {
  state.products = state.products.map((x) => (x.id === p.id ? p : x));
};

const sellerSlice = createSlice({
  name: 'seller',
  initialState: { shop: null, orders: [], ordersLoaded: false, products: [], productsLoaded: false, pending: {}, payouts: null },
  reducers: {
    resetSeller: () => ({ shop: null, orders: [], ordersLoaded: false, products: [], productsLoaded: false, pending: {} }),
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchShopProfile.fulfilled, (state, action) => {
        state.shop = action.payload;
      })
      .addCase(fetchPayouts.fulfilled, (state, action) => {
        state.payouts = action.payload;
      })
      .addCase(updateShop.fulfilled, (state, action) => {
        state.shop = { ...state.shop, ...action.payload };
      })
      .addCase(fetchSellerOrders.fulfilled, (state, action) => {
        state.orders = action.payload;
        state.ordersLoaded = true;
      })
      .addCase(sellerOrderAction.pending, (state, action) => {
        state.pending[action.meta.arg.id] = true;
      })
      .addCase(sellerOrderAction.fulfilled, (state, action) => {
        delete state.pending[action.meta.arg.id];
        state.orders = state.orders.map((o) => (o.id === action.payload.id ? action.payload : o));
      })
      .addCase(sellerOrderAction.rejected, (state, action) => {
        delete state.pending[action.meta.arg.id];
      })
      .addCase(fetchSellerProducts.fulfilled, (state, action) => {
        state.products = action.payload;
        state.productsLoaded = true;
      })
      .addCase(adjustStock.fulfilled, (state, action) => replaceProduct(state, action.payload))
      .addCase(updateProduct.fulfilled, (state, action) => replaceProduct(state, action.payload))
      .addCase(createProduct.fulfilled, (state, action) => {
        state.products = [...state.products, action.payload];
      })
      .addCase(addFromCatalogue.fulfilled, (state, action) => {
        state.products = [...state.products, action.payload];
      });
  },
});

export const { resetSeller } = sellerSlice.actions;
export default sellerSlice.reducer;
