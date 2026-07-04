// Your data (DPDP Act): a customer downloads a copy of their data, and deletes the account.
// Deleting needs the word DELETE and the password, waits for orders in progress, is refused for
// seller and rider accounts, and leaves past orders in place without the person's details.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHarness, beginTest } from './helpers/app.js';
import { staffToken } from './helpers/onboarding.js';
import * as H from './helpers/orders.js';

const h = await openHarness();
if (h.skip) console.warn(`account tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

describe.skipIf(h.skip)('your data', () => {
  let t;
  let staff;
  beforeEach(async () => {
    t = await beginTest(h);
    staff = await staffToken(t, 'reviewer');
  });
  afterEach(() => t.end());

  it('downloads a copy of the account, its addresses and its orders, for that customer only', async () => {
    const s = await H.openShop(t, staff);
    const c = await H.customerAt(t);
    const order = await H.placeOrder(c, s);
    const res = await c.api.get('/me/export').expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.body.account).toMatchObject({ email: c.user.email, name: c.user.name });
    expect(res.body.addresses).toHaveLength(1);
    expect(res.body.orders.map((o) => Number(o.id))).toEqual([Number(order.id)]);
    expect(res.body.orders[0].items[0]).toMatchObject({ qty: 2 });
    // never the delivery code's hash or the checkout key
    expect(JSON.stringify(res.body)).not.toMatch(/otp_hash|idem_key|password/);
    // sellers have no customer data to export
    await s.api.get('/me/export').expect(403);
  });

  it('waits for an order in progress, needs the password, and then erases the account', async () => {
    const s = await H.openShop(t, staff);
    const c = await H.customerAt(t);
    await c.api.put(`/me/favourites/${s.product.id}`, {}).expect(200);
    const order = await H.placeOrder(c, s);

    await c.api.post('/me/delete', { confirm: 'delete', password: c.user.password }).expect(400);
    await c.api.post('/me/delete', { confirm: 'DELETE', password: 'not my password' }).expect(403);
    expect((await c.api.post('/me/delete', { confirm: 'DELETE', password: c.user.password }).expect(409)).body.error.code).toBe('ORDER_IN_PROGRESS');

    await c.api.post(`/orders/${order.id}/cancel`, {}).expect(200);
    await t.inbox();
    const res = await c.api.post('/me/delete', { confirm: 'DELETE', password: c.user.password }).expect(200);
    expect(res.body).toEqual({ deleted: true });
    expect(res.headers['set-cookie']?.join(';')).toMatch(/sh_refresh=;/);

    const id = c.user.id;
    const user = await t.trx.identity('users').where({ id }).first();
    expect(user).toMatchObject({ email: `deleted-${id}@deleted.invalid`, name: 'Deleted account', mobile: null, google_sub: null, status: 'suspended' });
    for (const table of ['credentials', 'addresses', 'refresh_tokens']) expect(await t.trx.identity(table).where({ user_id: id }).first()).toBeUndefined();
    expect(await t.trx.ordering('favourites').where({ customer_id: id }).first()).toBeUndefined();
    // the order stays, as the law requires
    expect(await t.trx.ordering('orders').where({ id: order.id }).first()).toBeDefined();

    // the goodbye email went to the old address
    const mail = (await t.inbox()).find((m) => m.to === c.user.email);
    expect(mail?.subject).toMatch(/deleted/);
    // the token no longer opens anything, and the old password signs nobody in
    await c.api.get('/me').expect((r) => expect([401, 403]).toContain(r.status));
    expect((await t.signIn(c.user, 'customer')).status).toBeGreaterThanOrEqual(400);
  });

  it('sends seller and rider accounts to support', async () => {
    const u = await t.makeUser({ roles: ['customer', 'seller'] });
    const c = H.api(t, t.tokenFor(u, 'customer', { mfa: false }));
    expect((await c.post('/me/delete', { confirm: 'DELETE', password: u.password }).expect(409)).body.error.code).toBe('ACCOUNT_HAS_OTHER_ROLES');
  });
});
