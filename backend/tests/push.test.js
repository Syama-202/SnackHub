// Push notifications: a device subscribes for its portal under its sign-in session, every
// new inbox message is copied to it, and signing out, a push service forgetting the device or
// an address that is not a push service all stop it. The sender is a fake.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHarness, beginTest, request, bearer, cookieFrom, WEB } from './helpers/app.js';
import { inbox } from '../src/utils/orders.js';
import { linkFor, pushEndpointOk, pushPayload } from '../../shared/domain/push.js';

const h = await openHarness();
if (h.skip) console.warn(`push tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

const ENDPOINT = (n = 1) => `https://fcm.googleapis.com/fcm/send/test-device-${n}-${'x'.repeat(40)}`;
const KEYS = { p256dh: `B${'a'.repeat(86)}`, auth: 'abcdefghijklmnopqrstuv' };

describe('push rules', () => {
  it('accepts only the browsers’ push services, and builds short messages with a link', () => {
    expect(pushEndpointOk(ENDPOINT())).toBe(true);
    expect(pushEndpointOk('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(pushEndpointOk('https://db5p.notify.windows.com/w/?token=abc')).toBe(true);
    expect(pushEndpointOk('https://web.push.apple.com/abc')).toBe(true);
    for (const bad of ['http://fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.test/x', 'https://evil.test/fcm.googleapis.com', 'https://fcm.googleapis.com:8443/x', 'https://u:p@fcm.googleapis.com/x', 'https://127.0.0.1/x', 'not a url']) {
      expect(pushEndpointOk(bad)).toBe(false);
    }
    expect(linkFor('customer', { orderId: 7 })).toBe('/orders/7');
    expect(linkFor('seller', { type: 'shop.payout.paid' })).toBe('/seller/payouts');
    expect(linkFor('rider', { type: 'delivery.news' })).toBeNull();
    expect(pushPayload('rider', { type: 'delivery.news', body: 'x'.repeat(400) })).toMatchObject({ url: '/rider/notifications', body: 'x'.repeat(180) });
  });
});

describe.skipIf(h.skip)('push notifications', () => {
  let t;
  let posts;
  let fail;
  const push = { enabled: true, publicKey: 'test-public-key', post: async (sub, body, opts) => (fail ? Promise.reject(fail) : posts.push({ id: sub.id, ...JSON.parse(body), urgency: opts.urgency })) };
  beforeEach(async () => {
    posts = [];
    fail = null;
    t = await beginTest(h, { push });
  });
  afterEach(() => t.end());

  // a customer signed in through the web portal: the access token and this device's session cookie
  async function device(roles = ['customer'], portal = 'customer') {
    const user = await t.makeUser({ roles, mfa: portal === 'seller' });
    const res = await t.signIn(user, portal);
    expect(res.status).toBe(200);
    const cookie = cookieFrom(res).split(';')[0];
    const call = (path, body = {}) => request(t.app).post(`/api/v1${path}`).set(WEB).set('Cookie', cookie).set(bearer(res.body.accessToken)).send(body);
    return { user, cookie, call };
  }
  const message = async (userId, type, orderId = null) => {
    await t.trx.ordering.transaction((trx) => inbox(trx, { userId, orderId, type, body: `Test message ${type} (demo)` }));
    await t.inbox();
  };

  it('copies each new inbox message to the devices of that portal, once, with its link', async () => {
    const c = await device();
    expect((await c.call('/auth/push/status').expect(200)).body).toEqual({ enabled: true, publicKey: 'test-public-key', subscribed: false, devices: 0 });
    await c.call('/auth/push/subscriptions', { endpoint: 'https://evil.test/collect', keys: KEYS }).expect(400);
    await c.call('/auth/push/subscriptions', { endpoint: ENDPOINT(), keys: KEYS, device: 'Chrome on Android' }).expect(201);
    await c.call('/auth/push/subscriptions', { endpoint: ENDPOINT(), keys: KEYS }).expect(201); // again: still one device
    expect((await c.call('/auth/push/status', { endpoint: ENDPOINT() }).expect(200)).body).toMatchObject({ subscribed: true, devices: 1 });

    await message(c.user.id, 'order.accepted', 77);
    expect(posts).toEqual([expect.objectContaining({ title: 'SnackHub', body: 'Test message order.accepted (demo)', url: '/orders/77', tag: 'order-77', urgency: 'normal' })]);
    await message(c.user.id, 'order.accepted', 77); // the same message again: no second push
    await message(c.user.id, 'shop.order.new', 78); // a shop message: not for the customer's devices
    expect(posts).toHaveLength(1);

    expect((await c.call('/auth/push/test').expect(200)).body).toEqual({ sent: 1 });
    await c.call('/auth/push/unsubscribe', { endpoint: ENDPOINT() }).expect(200);
    await c.call('/auth/push/test').expect(409);
  });

  it('stops when the device signs out, and forgets a device the push service no longer knows', async () => {
    const a = await device();
    await a.call('/auth/push/subscriptions', { endpoint: ENDPOINT(1), keys: KEYS }).expect(201);
    await request(t.app).post('/api/v1/auth/logout').set(WEB).set('Cookie', a.cookie).send({}).expect(204);
    await message(a.user.id, 'order.packed', 90);
    expect(posts).toEqual([]);
    expect(await t.trx.notify('push_subscriptions').where({ user_id: a.user.id }).count({ n: '*' }).first()).toEqual({ n: 0 });

    const b = await device();
    await b.call('/auth/push/subscriptions', { endpoint: ENDPOINT(2), keys: KEYS }).expect(201);
    fail = Object.assign(new Error('gone'), { statusCode: 410 });
    await message(b.user.id, 'order.packed', 91);
    expect(await t.trx.notify('push_subscriptions').where({ user_id: b.user.id }).count({ n: '*' }).first()).toEqual({ n: 0 });
    // the inbox has the message all the same
    expect(await t.trx.notify('notifications').where({ user_id: b.user.id, order_id: 91 }).count({ n: '*' }).first()).toEqual({ n: 1 });
  });

  it('is off without keys, and needs this device’s own session', async () => {
    const off = await beginTest(h);
    try {
      const user = await off.makeUser();
      const res = await off.signIn(user, 'customer');
      expect(res.status).toBe(200);
      const call = (path, body = {}, cookie = cookieFrom(res).split(';')[0]) => request(off.app).post(`/api/v1${path}`).set(WEB).set('Cookie', cookie).set(bearer(res.body.accessToken)).send(body);
      expect((await call('/auth/push/status').expect(200)).body).toMatchObject({ enabled: false, publicKey: null });
      await call('/auth/push/subscriptions', { endpoint: ENDPOINT(), keys: KEYS }).expect(503);
    } finally {
      await off.end();
    }
    const c = await device();
    const other = await device();
    // a token with someone else's session cookie is refused
    await request(t.app).post('/api/v1/auth/push/subscriptions').set(WEB).set('Cookie', other.cookie).set(bearer(t.tokenFor(c.user, 'customer'))).send({ endpoint: ENDPOINT(3), keys: KEYS }).expect(409);
  });
});
