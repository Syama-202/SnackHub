// Saved addresses on MySQL: kinds and rider details, one default per customer, edits that never
// reach a placed order, and the place search for the map pin (with a fake server).
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHarness, beginTest } from './helpers/app.js';
import { staffToken } from './helpers/onboarding.js';
import { ER, expectError } from './helpers/db.js';
import { createGeocoder } from '../src/utils/geocoder.js';
import * as H from './helpers/orders.js';

const h = await openHarness();
if (h.skip) console.warn(`address tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

const HOSTEL = { kind: 'HOSTEL', line: 'Arundelpet 4th Lane, Guntur (demo)', house: 'Room 214, Block B', floor: '2', landmark: 'Behind the bus stand', instructions: 'Leave it at the warden desk', cityId: 'guntur', ...H.HOME };

describe.skipIf(h.skip)('saved addresses', () => {
  let t;
  beforeEach(async () => {
    t = await beginTest(h);
  });
  afterEach(() => t.end());

  const customer = async () => {
    const u = await t.makeUser({ roles: ['customer'] });
    return { user: u, api: H.api(t, t.tokenFor(u, 'customer', { mfa: false })) };
  };

  it('keeps the kind and the rider details, names the place after its kind, and makes the first one the default', async () => {
    const c = await customer();
    const first = (await c.api.post('/me/addresses', HOSTEL).expect(201)).body;
    expect(first).toMatchObject({ kind: 'HOSTEL', label: 'Hostel', house: 'Room 214, Block B', floor: '2', landmark: 'Behind the bus stand', instructions: 'Leave it at the warden desk', isDefault: true });
    // an "other" place needs its own name; empty details are stored as nothing
    expect((await c.api.post('/me/addresses', { ...HOSTEL, kind: 'OTHER' }).expect(400)).body.error.code).toBe('VALIDATION');
    const second = (await c.api.post('/me/addresses', { ...HOSTEL, kind: 'OTHER', label: 'Parents', house: '', landmark: '  ' }).expect(201)).body;
    expect(second).toMatchObject({ label: 'Parents', house: null, landmark: null, isDefault: false });
    // the old shape (label, line, city, pin) still works
    expect((await c.api.post('/me/addresses', { label: 'Work', line: 'Plot 22, Arundelpet Main Rd (demo)', ...H.HOME }).expect(201)).body).toMatchObject({ kind: 'HOME', label: 'Work' });
    // unknown fields, a pin outside India and over-long details are refused
    await c.api.post('/me/addresses', { ...HOSTEL, userId: 1 }).expect(400);
    await c.api.post('/me/addresses', { ...HOSTEL, lat: 51.5, lng: -0.12 }).expect(400);
    await c.api.post('/me/addresses', { ...HOSTEL, instructions: 'x'.repeat(201) }).expect(400);
  });

  it('edits in place, moves the default, and promotes the oldest left when the default is deleted', async () => {
    const c = await customer();
    const a = (await c.api.post('/me/addresses', HOSTEL).expect(201)).body;
    const b = (await c.api.post('/me/addresses', { ...HOSTEL, kind: 'OFFICE' }).expect(201)).body;
    const d = (await c.api.post('/me/addresses', { ...HOSTEL, kind: 'COLLEGE', isDefault: true }).expect(201)).body;
    const defaults = async () => (await c.api.get('/me/addresses').expect(200)).body.filter((x) => x.isDefault).map((x) => x.id);
    expect(await defaults()).toEqual([d.id]);

    const list = (await c.api.patch(`/me/addresses/${b.id}`, { isDefault: true, landmark: 'Near the clock tower', floor: '' }).expect(200)).body;
    expect(list[0]).toMatchObject({ id: b.id, isDefault: true, landmark: 'Near the clock tower', floor: null });
    expect(await defaults()).toEqual([b.id]);
    // the pin moves only as a pair, and "not default" is never set directly
    await c.api.patch(`/me/addresses/${b.id}`, { lat: 16.31 }).expect(400);
    await c.api.patch(`/me/addresses/${b.id}`, { isDefault: false }).expect(400);
    await c.api.patch(`/me/addresses/${b.id}`, {}).expect(400);

    await c.api.del(`/me/addresses/${b.id}`).expect(200);
    expect(await defaults()).toEqual([a.id]);

    // MySQL itself refuses a second default for one customer
    await expectError(t.trx.identity('addresses').where({ id: d.id }).update({ is_default: true }), ER.DUP_ENTRY);
  });

  it("never reads, changes or deletes another customer's address", async () => {
    const owner = await customer();
    const other = await customer();
    const a = (await owner.api.post('/me/addresses', HOSTEL).expect(201)).body;
    await other.api.patch(`/me/addresses/${a.id}`, { landmark: 'Somewhere else' }).expect(404);
    await other.api.patch(`/me/addresses/${a.id}`, { isDefault: true }).expect(404);
    await other.api.del(`/me/addresses/${a.id}`).expect(404);
    expect((await other.api.get('/me/addresses').expect(200)).body).toEqual([]);
    expect((await owner.api.get('/me/addresses').expect(200)).body[0]).toMatchObject({ id: a.id, landmark: 'Behind the bus stand' });
  });

  it('keeps the address an order was placed with when the saved one is edited or deleted', async () => {
    const staff = await staffToken(t, 'reviewer');
    const s = await H.openShop(t, staff);
    const c = await customer();
    const a = (await c.api.post('/me/addresses', HOSTEL).expect(201)).body;
    await c.api.put('/cart', { productId: s.product.id, qty: 1 }).expect(200);
    const { order } = (await c.api.post('/orders', { addressId: a.id, paymentMode: 'COD' }, { 'Idempotency-Key': H.key() }).expect(201)).body;
    expect(order.addressText).toBe('Room 214, Block B, floor 2, Arundelpet 4th Lane, Guntur (demo), near Behind the bus stand');
    expect(order.addressDetail).toMatchObject({ kind: 'HOSTEL', label: 'Hostel', instructions: 'Leave it at the warden desk' });

    await c.api.patch(`/me/addresses/${a.id}`, { house: 'Room 9', instructions: 'Call me', lat: 16.32, lng: 80.46 }).expect(200);
    await c.api.del(`/me/addresses/${a.id}`).expect(200);
    const after = (await c.api.get(`/orders/${order.id}`).expect(200)).body;
    expect(after).toMatchObject({ addressText: order.addressText, addressDetail: order.addressDetail, drop: order.drop });

    // the seller never sees the address, and nobody can rewrite it in the table
    const board = (await s.api.get('/seller/orders').expect(200)).body;
    expect(JSON.stringify(board)).not.toMatch(/Room 214|warden/);
    await expectError(t.trx.ordering('orders').where({ id: order.id }).update({ address_text: 'Somewhere else' }), ER.SIGNAL);
    await expectError(t.trx.ordering('orders').where({ id: order.id }).update({ drop_lat: 16.4 }), ER.SIGNAL);
    // other columns still change as the order moves on
    await t.trx.ordering('orders').where({ id: order.id }).update({ cancel_reason: 'test only' });
  });

  it('shows a rider the area before pickup, and the door, floor and instructions after', async () => {
    const staff = await staffToken(t, 'reviewer');
    const s = await H.openShop(t, staff);
    const c = await customer();
    const a = (await c.api.post('/me/addresses', HOSTEL).expect(201)).body;
    await c.api.put('/cart', { productId: s.product.id, qty: 1 }).expect(200);
    const { order } = (await c.api.post('/orders', { addressId: a.id, paymentMode: 'COD' }, { 'Idempotency-Key': H.key() }).expect(201)).body;
    const r = await H.onlineRider(t, staff);
    await s.api.post(`/seller/orders/${order.id}/accept`).expect(200);
    const [offer] = (await r.api.get('/rider/offers').expect(200)).body;
    await r.api.post(`/rider/offers/${offer.id}/accept`).expect(200);
    const before = (await r.api.get('/rider/active').expect(200)).body;
    expect(before.addressText).not.toMatch(/Room 214|floor|warden/);
    expect(before.addressDetail).toBeNull();
    await s.api.post(`/seller/orders/${order.id}/start`).expect(200);
    await s.api.post(`/seller/orders/${order.id}/packed`).expect(200);
    await r.api.post(`/rider/orders/${order.id}/picked-up`, { sealed: true }).expect(200);
    const after = (await r.api.get('/rider/active').expect(200)).body;
    expect(after.addressText).toMatch(/Room 214/);
    expect(after.addressDetail).toMatchObject({ floor: '2', instructions: 'Leave it at the warden desk' });
  });

  it('says place search is off when no server is set, and limits each customer', async () => {
    const c = await customer();
    expect((await c.api.post('/me/places/search', { q: 'Brodipet Guntur' }).expect(503)).body.error.code).toBe('PLACE_SEARCH_OFF');
    await c.api.post('/me/places/search', { q: 'ab' }).expect(400);
    await c.api.post('/me/places/reverse', { lat: 51.5, lng: -0.1 }).expect(400);
  });
});

describe('place search', () => {
  const env = { GEOCODER_URL: 'http://geo.test/', GEOCODER_CONTACT: 'ops@example.test' };
  const reply = (body, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 502, json: async () => body });

  it('asks for India only, names the app, keeps the results short, and caches them', async () => {
    const calls = [];
    const fetchImpl = (url, init) => {
      calls.push({ url, agent: init.headers['User-Agent'] });
      return reply([{ name: 'Brodipet', display_name: 'Brodipet, Guntur, Andhra Pradesh, 522002, India', lat: '16.3152', lon: '80.4301', address: { road: '4th Lane', suburb: 'Brodipet', city: 'Guntur', state: 'Andhra Pradesh', postcode: '522002' } }]);
    };
    const g = createGeocoder(env, { fetchImpl });
    const [first] = await g.search('Brodipet Guntur');
    expect(first).toEqual({ name: 'Brodipet', line: '4th Lane, Brodipet, Guntur, Andhra Pradesh, 522002', lat: 16.3152, lng: 80.4301 });
    await g.search('Brodipet Guntur');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/^http:\/\/geo\.test\/search\?q=Brodipet\+Guntur&.*countrycodes=in/);
    expect(calls[0].agent).toBe('SnackHub/0.2 (ops@example.test)');
  });

  it('keeps one request a second for the whole process', async () => {
    const at = [];
    const g = createGeocoder(env, { fetchImpl: () => (at.push(Date.now()), reply([])) });
    await Promise.all([g.search('one place'), g.search('two place'), g.search('three place')]);
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(1000);
    expect(at[2] - at[1]).toBeGreaterThanOrEqual(1000);
  });

  it('turns a failing server into a clear 503', async () => {
    const down = createGeocoder(env, { fetchImpl: () => Promise.reject(new Error('offline')) });
    await expect(down.search('Brodipet')).rejects.toMatchObject({ status: 503, code: 'PLACE_SEARCH_DOWN' });
    const bad = createGeocoder(env, { fetchImpl: () => reply({}, false) });
    await expect(bad.reverse({ lat: 16.3, lng: 80.4 })).rejects.toMatchObject({ code: 'PLACE_SEARCH_DOWN' });
  });
});
