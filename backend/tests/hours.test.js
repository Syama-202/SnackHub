// Opening hours and delivery pincodes: the shared rules in India time, a seller setting their
// week, holidays and pincodes, and customers who can browse a closed shop but not order from
// it, or order to a pincode the shop does not serve.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHarness, beginTest } from './helpers/app.js';
import { staffToken } from './helpers/onboarding.js';
import { DAYS, openState, hoursLabel, scheduleOf, scheduleProblem, istDate, pincodeServed } from '../../shared/domain/hours.js';
import * as H from './helpers/orders.js';

const h = await openHarness();
if (h.skip) console.warn(`hours tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

const at = (y, m, d, hh, mm) => Date.UTC(y, m - 1, d, hh, mm) - 330 * 60_000; // an IST wall-clock time
const SPLIT = { mon: [['07:00', '11:00'], ['16:00', '22:00']], tue: [['07:00', '11:00'], ['16:00', '22:00']], wed: [], thu: [['09:00', '24:00']], fri: [['09:00', '21:00']], sat: [['09:00', '21:00']], sun: [] };
const week = (windows) => Object.fromEntries(DAYS.map((d) => [d, windows]));

describe('opening hours rules (India time)', () => {
  it('knows open, between windows, closed days, midnight and holidays', () => {
    // 2 November 2026 is a Monday
    expect(istDate(at(2026, 11, 2, 12, 0))).toMatchObject({ date: '2026-11-02', day: 'mon' });
    expect(openState(SPLIT, [], at(2026, 11, 2, 8, 0))).toEqual({ open: true, closesAt: at(2026, 11, 2, 11, 0), opensAt: null });
    expect(openState(SPLIT, [], at(2026, 11, 2, 12, 0))).toEqual({ open: false, closesAt: null, opensAt: at(2026, 11, 2, 16, 0) });
    expect(hoursLabel(openState(SPLIT, [], at(2026, 11, 2, 12, 0)), at(2026, 11, 2, 12, 0))).toBe('Opens today 4:00 pm');
    // Tuesday late: Wednesday is closed, so Thursday morning
    expect(hoursLabel(openState(SPLIT, [], at(2026, 11, 3, 23, 0)), at(2026, 11, 3, 23, 0))).toBe('Opens Thursday 9:00 am');
    // open until midnight on Thursday
    expect(openState(SPLIT, [], at(2026, 11, 5, 23, 59)).open).toBe(true);
    expect(hoursLabel(openState(SPLIT, [], at(2026, 11, 5, 23, 0)), at(2026, 11, 5, 23, 0))).toBe('Open till midnight');
    // a holiday on Thursday moves it to Friday
    expect(hoursLabel(openState(SPLIT, ['2026-11-05'], at(2026, 11, 3, 23, 0)), at(2026, 11, 3, 23, 0))).toBe('Opens Friday 9:00 am');
    // no schedule: always open; an empty week: closed with no next opening
    expect(openState(null)).toMatchObject({ open: true });
    expect(openState(week([]), [], at(2026, 11, 2, 12, 0))).toEqual({ open: false, closesAt: null, opensAt: null });
    // the old single daily window still works
    expect(scheduleOf({ openHours: '16:00-22:00' }).sat).toEqual([['16:00', '22:00']]);
  });

  it('refuses windows that close before they open, overlap, or are too many', () => {
    expect(scheduleProblem(SPLIT)).toBeNull();
    expect(scheduleProblem({ mon: [['22:00', '02:00']] })).toMatch(/close after it opens/);
    expect(scheduleProblem({ mon: [['09:00', '13:00'], ['12:00', '18:00']] })).toMatch(/overlap/);
    expect(scheduleProblem({ mon: [['06:00', '07:00'], ['08:00', '09:00'], ['10:00', '11:00']] })).toMatch(/up to 2/);
    expect(pincodeServed([], '522001')).toBe(true);
    expect(pincodeServed(['522002'], '522001')).toBe(false);
    expect(pincodeServed(['522002'], null)).toBe(false);
  });
});

describe.skipIf(h.skip)('shop hours and pincodes', () => {
  let t;
  let staff;
  beforeEach(async () => {
    t = await beginTest(h);
    staff = await staffToken(t, 'reviewer');
  });
  afterEach(() => t.end());

  const today = () => istDate(Date.now()).date;

  it('a seller sets their week, holidays and pincodes; bad ones are refused', async () => {
    const s = await H.openShop(t, staff);
    const shop = (await s.api.patch('/seller/shop', { weeklyHours: SPLIT, closedDates: [today(), today()], pincodes: ['522002', '522001', '522002'] }).expect(200)).body;
    expect(shop).toMatchObject({ weeklyHours: SPLIT, closedDates: [today()], pincodes: ['522001', '522002'], hours: { openNow: false } });
    // a holiday today closes the shop whatever the hour
    expect(shop.hours.label).toMatch(/^Opens /);

    await s.api.patch('/seller/shop', { weeklyHours: { ...SPLIT, mon: [['22:00', '02:00']] } }).expect(400);
    await s.api.patch('/seller/shop', { weeklyHours: { ...SPLIT, funday: [] } }).expect(400);
    await s.api.patch('/seller/shop', { closedDates: ['2020-01-01'] }).expect(400);
    await s.api.patch('/seller/shop', { pincodes: ['012345'] }).expect(400);
    await s.api.patch('/seller/shop', { pincodes: Array.from({ length: 51 }, (_, i) => String(500000 + i)) }).expect(400);
    // back to always open, no pincode list
    const back = (await s.api.patch('/seller/shop', { weeklyHours: null, closedDates: [], pincodes: [] }).expect(200)).body;
    expect(back).toMatchObject({ weeklyHours: null, closedDates: [], pincodes: [], hours: { openNow: true } });
  });

  it('a closed shop can be browsed but not ordered from, and its snacks leave the lists', async () => {
    const s = await H.openShop(t, staff);
    const c = await H.customerAt(t);
    const where = `lat=${H.HOME.lat}&lng=${H.HOME.lng}`;
    // the customer fills the cart while it is open
    await c.api.put('/cart', { productId: s.product.id, qty: 1 }).expect(200);
    await s.api.patch('/seller/shop', { weeklyHours: week([]) }).expect(200);

    const shops = (await c.api.get(`/sellers?${where}`).expect(200)).body;
    expect(shops.find((x) => x.id === s.shop.id)).toMatchObject({ hours: { openNow: false, label: 'Not open this week' } });
    expect((await c.api.get(`/products?${where}`).expect(200)).body.map((p) => p.sellerId)).not.toContain(s.shop.id);
    expect((await c.api.get(`/sellers/${s.shop.id}?${where}`).expect(200)).body.hours.openNow).toBe(false);

    const add = await c.api.put('/cart', { productId: s.product.id, qty: 2 }).expect(409);
    expect(add.body.error).toMatchObject({ code: 'SHOP_UNAVAILABLE', message: expect.stringMatching(/is closed now/) });
    expect((await c.api.get('/cart').expect(200)).body.shopOpen).toBe(false);
    const placed = await c.api.post('/orders', { addressId: c.address.id, paymentMode: 'COD' }, { 'Idempotency-Key': H.key() }).expect(409);
    expect(placed.body.error.code).toBe('SHOP_UNAVAILABLE');

    // open all day again: the order goes through
    await s.api.patch('/seller/shop', { weeklyHours: week([['00:00', '24:00']]) }).expect(200);
    await c.api.post('/orders', { addressId: c.address.id, paymentMode: 'COD' }, { 'Idempotency-Key': H.key() }).expect(201);
  });

  it('a shop that lists pincodes delivers only to them, and needs the pincode on the address', async () => {
    const s = await H.openShop(t, staff);
    const c = await H.customerAt(t);
    await s.api.patch('/seller/shop', { pincodes: ['522002'] }).expect(200);
    await c.api.put('/cart', { productId: s.product.id, qty: 1 }).expect(200);

    // no pincode on the address yet
    let quote = (await c.api.post('/orders/quote', { addressId: c.address.id }).expect(200)).body;
    expect(quote.promise).toMatchObject({ serviceable: false, reasons: [expect.stringMatching(/Add the pincode/)] });
    await c.api.post('/orders', { addressId: c.address.id, paymentMode: 'COD' }, { 'Idempotency-Key': H.key() }).expect(409);

    await c.api.patch(`/me/addresses/${c.address.id}`, { pincode: '522001' }).expect(200);
    quote = (await c.api.post('/orders/quote', { addressId: c.address.id }).expect(200)).body;
    expect(quote.promise.reasons[0]).toBe('This shop does not deliver to pincode 522001');
    const where = `lat=${H.HOME.lat}&lng=${H.HOME.lng}`;
    expect((await c.api.get(`/sellers?${where}&pincode=522001`).expect(200)).body.map((x) => x.id)).not.toContain(s.shop.id);
    expect((await c.api.get(`/sellers?${where}&pincode=522002`).expect(200)).body.map((x) => x.id)).toContain(s.shop.id);
    // browsing without a pincode still shows it: the address decides at checkout
    expect((await c.api.get(`/sellers?${where}`).expect(200)).body.map((x) => x.id)).toContain(s.shop.id);

    await c.api.patch(`/me/addresses/${c.address.id}`, { pincode: '522002' }).expect(200);
    expect((await c.api.post('/orders/quote', { addressId: c.address.id }).expect(200)).body.promise.serviceable).toBe(true);
    await c.api.post('/orders', { addressId: c.address.id, paymentMode: 'COD' }, { 'Idempotency-Key': H.key() }).expect(201);
    // a pincode must be six digits, not starting with 0
    await c.api.patch(`/me/addresses/${c.address.id}`, { pincode: '02200' }).expect(400);
  });
});
