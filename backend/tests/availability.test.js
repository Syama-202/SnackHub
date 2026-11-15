// Snack availability (doc 12.1): the shared rule at fixed India times (breakfast, evening and
// late-night snacks, closed shops, sold out, switched off, past midnight, another time zone),
// and the API using it everywhere: listings and the shop page find every snack with its status,
// the cart and checkout refuse what cannot be ordered now and say when it can.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHarness, beginTest } from './helpers/app.js';
import { staffToken } from './helpers/onboarding.js';
import { DAYS } from '../../shared/domain/hours.js';
import { availabilityOf, servingSlot } from '../../shared/domain/availability.js';
import * as H from './helpers/orders.js';

const h = await openHarness();
if (h.skip) console.warn(`availability tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

const at = (y, m, d, hh, mm) => Date.UTC(y, m - 1, d, hh, mm) - 330 * 60_000; // IST wall clock
const week = (windows) => Object.fromEntries(DAYS.map((d) => [d, windows]));
const SHOP = { listed: true, schedule: week([['08:00', '22:00']]), closedDates: [] };
const EVENING = week([['17:00', '21:30']]);
const BREAKFAST = week([['07:00', '11:00']]);
const NIGHT = week([['21:00', '01:00']]);
const status = (shop, product, now) => availabilityOf({ shop, product: { stock: 5, ...product }, now });

describe('availability rule', () => {
  // 2 November 2026 is a Monday
  it('evening snacks in the morning are found, with when they come back', () => {
    expect(status(SHOP, { schedule: EVENING }, at(2026, 11, 2, 11, 0))).toMatchObject({ status: 'LATER_TODAY', orderable: false, nextAt: at(2026, 11, 2, 17, 0), label: 'Available from 5:00 pm' });
    expect(status(SHOP, { schedule: EVENING }, at(2026, 11, 2, 18, 0))).toMatchObject({ status: 'AVAILABLE', orderable: true, closesAt: at(2026, 11, 2, 21, 30) });
    // after its window: tomorrow evening
    expect(status(SHOP, { schedule: EVENING }, at(2026, 11, 2, 21, 45))).toMatchObject({ status: 'ANOTHER_DAY', nextAt: at(2026, 11, 3, 17, 0), label: 'Available tomorrow 5:00 pm' });
    // breakfast in the evening: tomorrow morning, never "not available"
    expect(status(SHOP, { schedule: BREAKFAST }, at(2026, 11, 2, 19, 0)).label).toBe('Available tomorrow 8:00 am');
    // sweets follow the shop's hours
    expect(status(SHOP, { schedule: null }, at(2026, 11, 2, 12, 0)).status).toBe('AVAILABLE');
    expect(servingSlot(EVENING)).toBe('evening');
    expect(servingSlot(BREAKFAST)).toBe('morning');
    expect(servingSlot(null)).toBe('allday');
  });

  it('late-night snacks run past midnight; a closed shop says so, not "later"', () => {
    const lateShop = { listed: true, schedule: week([['18:00', '02:00']]) };
    expect(status(lateShop, { schedule: NIGHT }, at(2026, 11, 3, 0, 30))).toMatchObject({ status: 'AVAILABLE', closesAt: at(2026, 11, 3, 1, 0) });
    // after 1 am the next window is tonight, the same date
    expect(status(lateShop, { schedule: NIGHT }, at(2026, 11, 3, 1, 30))).toMatchObject({ status: 'LATER_TODAY', label: 'Available from 9:00 pm' });
    // the snack's time, but the shop is shut (Sunday off)
    const weekdays = { ...SHOP.schedule, sun: [] };
    expect(status({ listed: true, schedule: weekdays }, { schedule: null }, at(2026, 11, 8, 12, 0))).toMatchObject({ status: 'SHOP_CLOSED', label: 'Shop closed · opens tomorrow 8:00 am' });
    // a holiday
    expect(status({ ...SHOP, closedDates: ['2026-11-02'] }, { schedule: null }, at(2026, 11, 2, 12, 0)).status).toBe('SHOP_CLOSED');
  });

  it('tells sold out, switched off, paused and not taking orders apart', () => {
    expect(status(SHOP, { stock: 0 }, at(2026, 11, 2, 12, 0))).toMatchObject({ status: 'OUT_OF_STOCK', label: 'Out of stock' });
    // out of its time and out of stock: the time comes first (stock may be back by then)
    expect(status(SHOP, { schedule: EVENING, stock: 0 }, at(2026, 11, 2, 12, 0)).status).toBe('LATER_TODAY');
    expect(status(SHOP, { unavailable: true, unavailableUntil: at(2026, 11, 3, 9, 0) }, at(2026, 11, 2, 12, 0))).toMatchObject({ status: 'TEMPORARILY_UNAVAILABLE', label: 'Back tomorrow 9:00 am' });
    expect(status(SHOP, { unavailable: true }, at(2026, 11, 2, 12, 0)).label).toBe('Temporarily unavailable');
    // the "until" has passed: back on by itself
    expect(status(SHOP, { unavailable: true, unavailableUntil: at(2026, 11, 2, 9, 0) }, at(2026, 11, 2, 12, 0)).status).toBe('AVAILABLE');
    expect(status({ ...SHOP, listed: false }, {}, at(2026, 11, 2, 12, 0))).toMatchObject({ status: 'SHOP_UNAVAILABLE', label: 'Not taking orders' });
    // listed and serving, but the shop takes no orders on SnackHub
    expect(status({ ...SHOP, takesOrders: false }, {}, at(2026, 11, 2, 12, 0))).toMatchObject({ status: 'AVAILABLE', orderable: false });
  });

  it("uses the shop's own time zone", () => {
    // 18:00 in Dubai (UTC+4) is 19:30 in India: an evening window in Dubai time is open
    const dubai = { ...SHOP, tz: 'Asia/Dubai' };
    const sixPmDubai = Date.UTC(2026, 10, 2, 14, 0);
    expect(status(dubai, { schedule: EVENING }, sixPmDubai).status).toBe('AVAILABLE');
    // 10 am in Dubai: from 5 pm, Dubai time (13:00 UTC)
    expect(status(dubai, { schedule: EVENING }, Date.UTC(2026, 10, 2, 6, 0))).toMatchObject({ nextAt: Date.UTC(2026, 10, 2, 13, 0), label: 'Available from 5:00 pm' });
  });
});

describe.skipIf(h.skip)('availability through the API', () => {
  let t;
  let staff;
  beforeEach(async () => {
    t = await beginTest(h);
    staff = await staffToken(t, 'reviewer');
  });
  afterEach(() => t.end());

  // a window that opens two hours from now and closes four hours from now, India time
  const laterWindow = () => {
    const ist = new Date(Date.now() + 330 * 60_000);
    const hh = (d) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(Math.floor(d.getUTCMinutes() / 5) * 5).padStart(2, '0')}`;
    return week([[hh(new Date(ist.getTime() + 2 * 3600_000)), hh(new Date(ist.getTime() + 4 * 3600_000))]]);
  };

  it('a seller sets serving times; the snack stays findable, the cart and checkout refuse it until then', async () => {
    const s = await H.openShop(t, staff);
    const c = await H.customerAt(t);
    const where = `lat=${H.HOME.lat}&lng=${H.HOME.lng}`;
    await c.api.put('/cart', { productId: s.product.id, qty: 1 }).expect(200);

    // its serving time ends while it waits in the cart
    const hours = laterWindow();
    const edited = (await s.api.patch(`/seller/products/${s.product.id}`, { availableHours: hours }).expect(200)).body;
    expect(edited).toMatchObject({ availableHours: hours, availability: { status: expect.stringMatching(/LATER_TODAY|ANOTHER_DAY/) } });

    const listed = (await c.api.get(`/products?${where}`).expect(200)).body.find((p) => p.id === s.product.id);
    expect(listed.availability).toMatchObject({ orderable: false, nextAt: expect.any(Number), label: expect.stringMatching(/^Available /) });
    expect((await c.api.get(`/sellers/${s.shop.id}?${where}`).expect(200)).body.products[0].availability.orderable).toBe(false);

    const cart = (await c.api.get('/cart').expect(200)).body;
    expect(cart.blocked).toEqual([expect.objectContaining({ productId: s.product.id, nextAt: expect.any(Number) })]);
    const add = await c.api.put('/cart', { productId: s.product.id, qty: 2 }).expect(409);
    expect(add.body.error).toMatchObject({ code: 'NOT_AVAILABLE_NOW', message: expect.stringMatching(/^Craving this already\?/), details: { status: expect.any(String), nextAt: expect.any(Number) } });
    // removing it from the cart always works
    await c.api.put('/cart', { productId: s.product.id, qty: 0 }).expect(200);
    await c.api.put('/cart', { productId: s.product.id, qty: 0 }).expect(200);

    // served all day again: it goes in and the order is placed
    await s.api.patch(`/seller/products/${s.product.id}`, { availableHours: null }).expect(200);
    await c.api.put('/cart', { productId: s.product.id, qty: 1 }).expect(200);
    const blockedAtCheckout = async () => {
      await s.api.patch(`/seller/products/${s.product.id}`, { availableHours: laterWindow() }).expect(200);
      const r = await c.api.post('/orders', { addressId: c.address.id, paymentMode: 'COD' }, { 'Idempotency-Key': H.key() }).expect(409);
      await s.api.patch(`/seller/products/${s.product.id}`, { availableHours: null }).expect(200);
      return r.body.error.code;
    };
    // the time ends between the cart and checkout: checkout checks again
    expect(await blockedAtCheckout()).toBe('NOT_AVAILABLE_NOW');
    await c.api.post('/orders', { addressId: c.address.id, paymentMode: 'COD' }, { 'Idempotency-Key': H.key() }).expect(201);
  });

  it('switched off for a while, or sold out: listed with the reason, refused in the cart', async () => {
    const s = await H.openShop(t, staff);
    const c = await H.customerAt(t);
    const where = `lat=${H.HOME.lat}&lng=${H.HOME.lng}`;
    const until = Date.now() + 3 * 3600_000;
    await s.api.patch(`/seller/products/${s.product.id}`, { unavailable: true, unavailableUntil: until }).expect(200);
    let p = (await c.api.get(`/products?${where}`).expect(200)).body.find((x) => x.id === s.product.id);
    expect(p).toMatchObject({ unavailable: true, availability: { status: 'TEMPORARILY_UNAVAILABLE', nextAt: until } });
    expect((await c.api.put('/cart', { productId: s.product.id, qty: 1 }).expect(409)).body.error.code).toBe('TEMPORARILY_UNAVAILABLE');
    // a past or far-off "until" is refused; switching back on clears it
    await s.api.patch(`/seller/products/${s.product.id}`, { unavailableUntil: Date.now() - 1000 }).expect(400);
    await s.api.patch(`/seller/products/${s.product.id}`, { unavailableUntil: Date.now() + 40 * 24 * 3600_000 }).expect(400);
    const on = (await s.api.patch(`/seller/products/${s.product.id}`, { unavailable: false }).expect(200)).body;
    expect(on).toMatchObject({ unavailable: false, unavailableUntil: null, availability: { status: 'AVAILABLE' } });

    // sold out
    await t.trx.catalog('stock').where({ product_id: s.product.id }).update({ qty: 0 });
    p = (await c.api.get(`/products?${where}`).expect(200)).body.find((x) => x.id === s.product.id);
    expect(p.availability).toMatchObject({ status: 'OUT_OF_STOCK', label: 'Out of stock' });
    expect((await c.api.put('/cart', { productId: s.product.id, qty: 1 }).expect(409)).body.error.code).toBe('OUT_OF_STOCK');

    // bad serving times are refused
    await s.api.patch(`/seller/products/${s.product.id}`, { availableHours: { mon: [['09:00', '09:00']] } }).expect(400);
    await s.api.patch(`/seller/products/${s.product.id}`, { availableHours: { mon: [['06:00', '07:00'], ['08:00', '09:00'], ['10:00', '11:00'], ['12:00', '13:00']] } }).expect(400);
    await s.api.patch(`/seller/products/${s.product.id}`, { availableHours: { mon: [['06:00', '07:00'], ['08:00', '09:00'], ['20:00', '01:00']] } }).expect(200);
  });
});
