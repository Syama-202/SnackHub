// The shared product catalogue: admins keep the entries, shops sell an entry at their own
// price (once each), its name and details stay the catalogue's, and customers compare the
// shops near them that sell it.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHarness, beginTest, request, ADMIN, bearer } from './helpers/app.js';
import { staffToken, admin } from './helpers/onboarding.js';
import { priceSpread, ownedFieldsIn } from '../../shared/domain/catalogue.js';
import * as H from './helpers/orders.js';

const h = await openHarness();
if (h.skip) console.warn(`catalogue tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

describe('catalogue rules', () => {
  it('spreads prices and names the fields a shop may not change', () => {
    expect(priceSpread([])).toEqual({ shops: 0, minPaise: null, maxPaise: null, medianPaise: null });
    expect(priceSpread([3000, 2000, 5000])).toEqual({ shops: 3, minPaise: 2000, maxPaise: 5000, medianPaise: 3000 });
    expect(priceSpread([2000, 3001]).medianPaise).toBe(2501);
    expect(ownedFieldsIn({ title: 'x', pricePaise: 100, spice: 2 })).toEqual(['title', 'spice']);
  });
});

describe.skipIf(h.skip)('shared catalogue', () => {
  let t;
  let staff;
  let ops;
  const patch = (path, body) => request(t.app).patch(`/api/v1/admin${path}`).set(ADMIN).set(bearer(ops.token)).send(body);
  beforeEach(async () => {
    t = await beginTest(h);
    staff = await staffToken(t, 'reviewer');
    ops = await staffToken(t, 'admin');
  });
  afterEach(() => t.end());

  it('lets shops sell one entry at their own prices, keeps its details, and shows customers the cheapest first', async () => {
    const a = admin(t, ops.token);
    const entry = (await a.post('/catalogue', { title: 'Test sakinalu (demo)', category: 'namkeen', servingTemp: 'AMBIENT', weight: '250 g', spice: 1, shape: 'spiral' }).expect(201)).body;
    expect(entry).toMatchObject({ title: 'Test sakinalu (demo)', active: true, prices: { shops: 0 } });
    await a.post('/catalogue', { title: 'test SAKINALU (demo)', category: 'namkeen', servingTemp: 'AMBIENT' }).expect(409);

    const one = await H.openShop(t, staff);
    const two = await H.openShop(t, staff);
    const add = (s, pricePaise) => s.api.post('/seller/products/from-catalogue', { catalogItemId: entry.id, pricePaise, prepMinutes: 3 });
    const p1 = (await add(one, 7000).expect(201)).body;
    expect(p1).toMatchObject({ catalogItemId: entry.id, title: entry.title, weight: '250 g', active: false, stock: 0, pricePaise: 7000 });
    await add(one, 6000).expect(409); // once per shop
    await add(one, 100).expect(400);
    const p2 = (await add(two, 5500).expect(201)).body;

    // the shop sets its price and words, not the catalogue's details
    const res = await one.api.patch(`/seller/products/${p1.id}`, { title: 'Renamed', pricePaise: 6500 }).expect(422);
    expect(res.body.error.code).toBe('CATALOGUE_OWNED');
    await one.api.patch(`/seller/products/${p1.id}`, { pricePaise: 6500, description: 'Our grandmother’s way (demo)' }).expect(200);

    for (const [s, p] of [[one, p1], [two, p2]]) {
      await s.api.patch(`/seller/products/${p.id}/stock`, { delta: 4, reason: 'new batch' }).expect(200);
      await s.api.patch(`/seller/products/${p.id}`, { active: true }).expect(200);
    }
    const picker = (await one.api.get('/seller/catalogue?q=sakinalu').expect(200)).body;
    expect(picker.find((i) => i.id === entry.id)).toMatchObject({ onMenu: p1.id, pricesInCity: { shops: 2, minPaise: 5500, maxPaise: 6500 } });

    const offers = (await request(t.app).get(`/api/v1/catalogue/${entry.id}/offers`).query(H.HOME).expect(200)).body;
    expect(offers.map((o) => [o.id, o.pricePaise])).toEqual([[p2.id, 5500], [p1.id, 6500]]);
    expect(offers[0]).toMatchObject({ shopName: two.shop.shop_name, serviceable: true });

    // an admin edit reaches every shop's copy; a retired entry leaves the picker, menus keep it
    await patch(`/catalogue/${entry.id}`, { title: 'Test sakinalu, Telangana style (demo)', spice: 2 }).expect(200);
    const after = await t.trx.catalog('products').whereIn('id', [p1.id, p2.id]).select('title', 'price_paise', 'attrs');
    expect(after.map((r) => r.title)).toEqual(['Test sakinalu, Telangana style (demo)', 'Test sakinalu, Telangana style (demo)']);
    expect(after.map((r) => (typeof r.attrs === 'string' ? JSON.parse(r.attrs) : r.attrs).spice)).toEqual([2, 2]);
    expect(after.map((r) => r.price_paise).sort()).toEqual([5500, 6500]);
    await patch(`/catalogue/${entry.id}`, { active: false }).expect(200);
    expect((await one.api.get('/seller/catalogue?q=sakinalu').expect(200)).body.some((i) => i.id === entry.id)).toBe(false);
    const three = await H.openShop(t, staff);
    await add(three, 6000).expect(404);
  });

  it('links a shop’s own recipe to an entry once, and only admins manage the catalogue', async () => {
    const a = admin(t, ops.token);
    const entry = (await a.post('/catalogue', { title: 'Test kara boondi (demo)', category: 'namkeen', servingTemp: 'AMBIENT', weight: '200 g' }).expect(201)).body;
    const s = await H.openShop(t, staff);
    expect(s.product.catalogItemId).toBeNull();
    await a.post(`/catalogue/${entry.id}/link`, { productId: s.product.id }).expect(200);
    const row = await t.trx.catalog('products').where({ id: s.product.id }).first();
    expect(row).toMatchObject({ catalog_item_id: entry.id, title: 'Test kara boondi (demo)', price_paise: s.product.pricePaise });
    // the shop already sells it: neither a second link nor an add
    const other = (await s.api.post('/seller/products', { title: 'Test boondi two (demo)', category: 'namkeen', servingTemp: 'AMBIENT', prepMinutes: 3, pricePaise: 4000 }).expect(201)).body;
    await a.post(`/catalogue/${entry.id}/link`, { productId: other.id }).expect(409);
    await s.api.post('/seller/products/from-catalogue', { catalogItemId: entry.id, pricePaise: 4000, prepMinutes: 3 }).expect(409);

    await request(t.app).get('/api/v1/admin/catalogue').set(ADMIN).set(bearer(staff.token)).expect(403); // reviewers do not
    await s.api.get('/admin/catalogue').expect(404); // not on the shop host
    const list = (await a.get('/catalogue?q=kara%20boondi').expect(200)).body;
    expect(list.find((i) => i.id === entry.id)).toMatchObject({ prices: { shops: 1 } });
  });
});
