// Favourites on the account, and "order again": the cart refilled from a past order at
// today's prices, leaving out what cannot be ordered and saying why.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHarness, beginTest } from './helpers/app.js';
import { staffToken } from './helpers/onboarding.js';
import * as H from './helpers/orders.js';

const h = await openHarness();
if (h.skip) console.warn(`favourites tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

describe.skipIf(h.skip)('favourites and order again', () => {
  let t;
  let staff;
  beforeEach(async () => {
    t = await beginTest(h);
    staff = await staffToken(t, 'reviewer');
  });
  afterEach(() => t.end());

  it('saves snacks to the account once each, says when one cannot be ordered, and keeps them private', async () => {
    const s = await H.openShop(t, staff);
    const c = await H.customerAt(t);
    const other = await H.customerAt(t);
    expect((await c.api.put(`/me/favourites/${s.product.id}`, {}).expect(200)).body.ids).toEqual([s.product.id]);
    await c.api.put(`/me/favourites/${s.product.id}`, {}).expect(200); // twice is still once
    await c.api.put('/me/favourites/999999999', {}).expect(404);
    let list = (await c.api.get('/me/favourites').expect(200)).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: s.product.id, shopName: s.shop.shop_name, unavailable: null });
    expect((await other.api.get('/me/favourites').expect(200)).body).toEqual([]);

    // the shop closes for the week: still saved, marked as not orderable now
    await s.api.patch('/seller/shop', { weeklyHours: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, []])) }).expect(200);
    list = (await c.api.get('/me/favourites').expect(200)).body;
    expect(list[0].unavailable).toMatch(/closed now/);

    expect((await c.api.del(`/me/favourites/${s.product.id}`).expect(200)).body.ids).toEqual([]);
    // sellers and riders have no favourites
    await s.api.get('/me/favourites').expect(403);
  });

  it('order again refills the cart at today’s prices, lowers a quantity to the stock left, and names what it left out', async () => {
    const s = await H.openShop(t, staff, { stock: 6 });
    // a second snack from the same shop
    const second = (await s.api.post('/seller/products', { title: 'Test murukku (demo)', category: 'namkeen', servingTemp: 'AMBIENT', prepMinutes: 3, pricePaise: 5000, weight: '200 g', shape: 'spiral' }).expect(201)).body;
    await s.api.patch(`/seller/products/${second.id}/stock`, { delta: 2, reason: 'new batch' }).expect(200);
    await s.api.patch(`/seller/products/${second.id}`, { active: true }).expect(200);
    const c = await H.customerAt(t);
    await c.api.put('/cart', { productId: s.product.id, qty: 3 }).expect(200);
    await c.api.put('/cart', { productId: second.id, qty: 2 }).expect(200);
    const { order } = (await c.api.post('/orders', { addressId: c.address.id, paymentMode: 'COD' }, { 'Idempotency-Key': H.key() }).expect(201)).body;

    // since then: the price went up, only 1 of the first is left, the second is off the menu
    await s.api.patch(`/seller/products/${s.product.id}`, { pricePaise: 6500 }).expect(200);
    await t.trx.catalog('stock').where({ product_id: s.product.id }).update({ qty: 1 });
    await s.api.patch(`/seller/products/${second.id}`, { active: false }).expect(200);
    await c.api.put('/cart', { productId: s.product.id, qty: 1 }).expect(200); // something already in the cart is replaced

    const again = (await c.api.post(`/orders/${order.id}/reorder`, {}).expect(200)).body;
    expect(again.cart.items).toEqual([expect.objectContaining({ productId: s.product.id, qty: 1, pricePaise: 6500 })]);
    expect(again.skipped).toEqual([
      { productId: s.product.id, title: s.product.title, reason: 'Only 1 left, so 1 went in' },
      { productId: second.id, title: 'Test murukku (demo)', reason: 'No longer on the menu' },
    ]);

    // nothing orderable: refused, the cart untouched; someone else's order: not found
    await t.trx.catalog('stock').where({ product_id: s.product.id }).update({ qty: 0 });
    expect((await c.api.post(`/orders/${order.id}/reorder`, {}).expect(409)).body.error.code).toBe('NOTHING_TO_REORDER');
    const stranger = await H.customerAt(t);
    await stranger.api.post(`/orders/${order.id}/reorder`, {}).expect(404);
  });
});
