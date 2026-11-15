// Where a customer is (doc 12.2): /locate says whether shops deliver to a point, whether it is
// in a city SnackHub serves but out of every shop's reach, or in a city not served yet. Cities
// come from catalog.cities, so a new city is a new row, not a release.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHarness, beginTest } from './helpers/app.js';
import { staffToken } from './helpers/onboarding.js';
import * as H from './helpers/orders.js';

const h = await openHarness();
if (h.skip) console.warn(`location tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

const q = (p) => `lat=${p.lat}&lng=${p.lng}`;
const OUTSKIRTS = { lat: 16.36, lng: 80.48 }; // inside Guntur's area, beyond every shop's range
const NAGPUR = { lat: 21.1458, lng: 79.0882 };

describe.skipIf(h.skip)('location', () => {
  let t;
  let staff;
  beforeEach(async () => {
    t = await beginTest(h, { geocoder: { enabled: true, reverse: async ({ lat }) => (lat > 21 ? { line: 'Sitabuldi, Nagpur', postcode: '440012', locality: 'Sitabuldi', city: 'Nagpur', state: 'Maharashtra' } : null) } });
    staff = await staffToken(t, 'reviewer');
  });
  afterEach(() => t.end());

  it('tells served, out of the delivery zone and not-yet-served cities apart', async () => {
    const s = await H.openShop(t, staff);
    const c = await H.customerAt(t);
    const here = (await c.api.get(`/locate?${q(H.HOME)}`).expect(200)).body;
    expect(here).toMatchObject({ status: 'SERVED', city: { id: 'guntur' }, shops: expect.any(Number) });
    expect(here.shops).toBeGreaterThan(0);
    expect((await c.api.get(`/sellers?${q(H.HOME)}`).expect(200)).body.map((x) => x.id)).toContain(s.shop.id);

    // a city we serve, but no shop reaches this spot: no shops listed, no fake ones
    const edge = (await c.api.get(`/locate?${q(OUTSKIRTS)}`).expect(200)).body;
    expect(edge).toMatchObject({ status: 'OUT_OF_ZONE', city: { id: 'guntur' }, shops: 0 });
    expect((await c.api.get(`/products?${q(OUTSKIRTS)}`).expect(200)).body).toEqual([]);

    // a city we do not serve: named by place lookup, with the nearest one we do
    const far = (await c.api.get(`/locate?${q(NAGPUR)}`).expect(200)).body;
    expect(far).toMatchObject({ status: 'UNSUPPORTED_CITY', city: null, shops: 0, address: { city: 'Nagpur', pincode: '440012' }, nearestCity: { id: expect.any(String), distanceKm: expect.any(Number) } });
    await c.api.get('/locate?lat=51.5&lng=-0.12').expect(400);
  });

  it('reads the cities from the database: a new row is a new city', async () => {
    const c = await H.customerAt(t);
    expect((await c.api.get('/cities').expect(200)).body.map((x) => x.id)).toContain('guntur');
    await t.trx.catalog('cities').insert({ id: 'nagpur', name: 'Nagpur', state: 'Maharashtra', lat: 21.1458, lng: 79.0882, position: 99 });
    const cities = (await c.api.get('/cities').expect(200)).body;
    expect(cities.find((x) => x.id === 'nagpur')).toMatchObject({ name: 'Nagpur', radiusKm: 25, timezone: 'Asia/Kolkata' });
    // now a city we serve, though no shop delivers there yet
    expect((await c.api.get(`/locate?${q(NAGPUR)}`).expect(200)).body).toMatchObject({ status: 'OUT_OF_ZONE', city: { id: 'nagpur' } });
    await t.trx.catalog('cities').where({ id: 'nagpur' }).update({ active: false });
    expect((await c.api.get('/cities').expect(200)).body.map((x) => x.id)).not.toContain('nagpur');
  });
});
