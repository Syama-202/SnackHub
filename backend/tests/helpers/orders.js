// Order helpers shared by the order and complaint tests: an approved shop with a listed snack,
// an approved online rider, a customer with an address near the shop, and a whole delivery.
import { expect } from 'vitest';
import { request, bearer } from './app.js';
import { readySeller, readyRider, approveAll, refOf } from './onboarding.js';

// the shop in the onboarding helper stands at 16.3001, 80.4501 (Guntur), radius 3 km
export const SHOP = { lat: 16.3001, lng: 80.4501 };
export const HOME = { lat: 16.3051, lng: 80.4551 }; // about 750 m away
export const api = (t, token) => ({
  get: (path) => request(t.app).get(`/api/v1${path}`).set(bearer(token)),
  post: (path, body = {}, headers = {}) => request(t.app).post(`/api/v1${path}`).set(headers).set(bearer(token)).send(body),
  put: (path, body = {}) => request(t.app).put(`/api/v1${path}`).set(bearer(token)).send(body),
  patch: (path, body = {}) => request(t.app).patch(`/api/v1${path}`).set(bearer(token)).send(body),
  del: (path) => request(t.app).delete(`/api/v1${path}`).set(bearer(token)),
});
export const key = () => `test-${Math.random().toString(36).slice(2, 12)}`;
export const lerp = (a, b, k) => ({ lat: a.lat + (b.lat - a.lat) * k, lng: a.lng + (b.lng - a.lng) * k });

/** An approved shop with one listed snack and stock. */
export async function openShop(t, staff, { stock = 5, temp = 'AMBIENT', price = 6000 } = {}) {
  const s = await readySeller(t);
  await approveAll(t, staff.token, await refOf(t, s.token, 'seller'));
  const seller = api(t, s.token);
  const p = (await seller.post('/seller/products', { title: `Test chakli ${Math.random().toString(36).slice(2, 6)} (demo)`, category: 'namkeen', servingTemp: temp, prepMinutes: 4, pricePaise: price, weight: '200 g', shape: 'spiral' }).expect(201)).body;
  expect(p).toMatchObject({ active: false, stock: 0, art: { shape: 'spiral' } });
  if (stock) await seller.patch(`/seller/products/${p.id}/stock`, { delta: stock, reason: 'new batch' }).expect(200);
  await seller.patch(`/seller/products/${p.id}`, { active: true }).expect(200);
  const shop = await t.trx.catalog('sellers').where({ user_id: s.user.id }).first();
  return { ...s, api: seller, shop, product: { ...p, active: true, stock } };
}

/** An approved rider, online, at a point. */
export async function onlineRider(t, staff, at = SHOP) {
  const r = await readyRider(t);
  await approveAll(t, staff.token, await refOf(t, r.token, 'rider'));
  const rider = api(t, r.token);
  await rider.put('/rider/status', { status: 'ONLINE' }).expect(200);
  await rider.post('/rider/location', at).expect(200);
  const row = await t.trx.dispatch('riders').where({ user_id: r.user.id }).first();
  return { ...r, api: rider, row };
}

/** A ping as if `seconds` had passed since the last one, so the speed check sees a real ride. */
export async function ping(t, rider, at, seconds = 60) {
  await t.trx.dispatch('riders').where({ id: rider.row.id }).update({ last_seen_at: new Date(Date.now() - seconds * 1000) });
  return rider.api.post('/rider/location', at);
}

export async function customerAt(t, point = HOME) {
  const u = await t.makeUser({ roles: ['customer'] });
  const token = t.tokenFor(u, 'customer', { mfa: false });
  const c = api(t, token);
  const address = (await c.post('/me/addresses', { label: 'Home', line: 'Flat 2, 4-5 Arundelpet, Guntur (demo)', cityId: 'guntur', ...point }).expect(201)).body;
  return { user: u, token, api: c, address };
}

export async function placeOrder(c, shop, qty = 2) {
  await c.api.put('/cart', { productId: shop.product.id, qty }).expect(200);
  return (await c.api.post('/orders', { addressId: c.address.id, paymentMode: 'COD' }, { 'Idempotency-Key': key() }).expect(201)).body.order;
}

/** A delivered order: placed, accepted, packed, picked up, driven to the door, code entered. */
export async function deliveredOrder(t, staff, { qty = 2, stock = 5 } = {}) {
  const s = await openShop(t, staff, { stock });
  const c = await customerAt(t);
  const order = await placeOrder(c, s, qty);
  const r = await onlineRider(t, staff);
  await s.api.post(`/seller/orders/${order.id}/accept`).expect(200);
  const [offer] = (await r.api.get('/rider/offers').expect(200)).body;
  await r.api.post(`/rider/offers/${offer.id}/accept`).expect(200);
  await s.api.post(`/seller/orders/${order.id}/start`).expect(200);
  await s.api.post(`/seller/orders/${order.id}/packed`).expect(200);
  await r.api.post(`/rider/orders/${order.id}/picked-up`, { sealed: true }).expect(200);
  await ping(t, r, HOME);
  const { code } = (await c.api.get(`/orders/${order.id}/otp`).expect(200)).body;
  await r.api.post(`/rider/orders/${order.id}/deliver`, { code, collectedPaise: order.totalPaise }).expect(200);
  return { shop: s, customer: c, rider: r, order };
}
