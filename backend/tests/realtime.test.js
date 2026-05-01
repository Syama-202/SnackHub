// Live updates over Socket.IO against the real app on a real port: every connection is
// authenticated, rooms come from the token alone, each side hears only about its own orders and
// offers, events carry ids and never data, suspensions and expired tokens close sockets, and a
// dropped connection comes back.
import http from 'node:http';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { io as connectClient } from 'socket.io-client';
import { openHarness, beginTest } from './helpers/app.js';
import { staffToken, admin } from './helpers/onboarding.js';
import * as H from './helpers/orders.js';
import { createSocketServer, SOCKET_PATH } from '../src/socket.js';
import { memoryCounter } from '../src/utils/rateLimit.js';

const h = await openHarness();
if (h.skip) console.warn(`realtime tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EVENT_KEYS = ['at', 'id', 'orderId', 'topic'];

describe.skipIf(h.skip)('live updates', () => {
  let t;
  let staff;
  let server;
  let sockets;
  let url;
  const clients = [];

  beforeEach(async () => {
    t = await beginTest(h);
    staff = await staffToken(t, 'reviewer');
    server = http.createServer(t.app);
    sockets = createSocketServer(server, { env: h.env, dbs: t.trx, rateStore: memoryCounter() });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${server.address().port}`;
  });
  afterEach(async () => {
    for (const c of clients.splice(0)) c.socket.disconnect();
    await sockets.close();
    await t.end();
  });

  /** A client that records every hint; resolves once the server said ready (or refused). */
  function connect(token, { auth = {}, reconnection = false } = {}) {
    const socket = connectClient(url, { path: SOCKET_PATH, auth: { token, ...auth }, transports: ['websocket'], reconnection, reconnectionDelay: 100, forceNew: true });
    const c = { socket, events: [], readies: 0 };
    socket.on('change', (e) => c.events.push(e));
    socket.on('ready', () => (c.readies += 1));
    clients.push(c);
    c.ready = new Promise((resolve) => {
      socket.once('ready', () => resolve({ ok: true }));
      socket.once('connect_error', (err) => resolve({ ok: false, code: err.data?.code }));
    });
    /** The first hint on topic (and order) that arrives within the wait, or null. */
    c.next = async (topic, orderId, ms = 3000) => {
      const match = (e) => e.topic === topic && (orderId === undefined || e.orderId === orderId);
      for (let waited = 0; waited < ms; waited += 25) {
        const e = c.events.find(match);
        if (e) return e;
        await sleep(25);
      }
      return null;
    };
    return c;
  }
  const live = async (token, opts) => {
    const c = connect(token, opts);
    expect(await c.ready).toEqual({ ok: true });
    return c;
  };

  describe('who may connect', () => {
    it('refuses a missing, forged or expired token, a suspended account and a role the account does not hold', async () => {
      expect(await connect('').ready).toEqual({ ok: false, code: 'UNAUTHENTICATED' });
      expect(await connect('not-a-token').ready).toEqual({ ok: false, code: 'UNAUTHENTICATED' });
      const u = await t.makeUser({ roles: ['customer'] });
      const forged = jwt.sign({ role: 'customer' }, 'some-other-secret-that-is-at-least-32-chars', { subject: String(u.id), issuer: 'snackhub', audience: 'snackhub-web', expiresIn: '5m' });
      expect(await connect(forged).ready).toEqual({ ok: false, code: 'UNAUTHENTICATED' });
      const expired = jwt.sign({ role: 'customer' }, h.env.JWT_SECRET, { subject: String(u.id), issuer: 'snackhub', audience: 'snackhub-web', expiresIn: -10 });
      expect(await connect(expired).ready).toEqual({ ok: false, code: 'UNAUTHENTICATED' });
      expect(await connect(t.tokenFor(u, 'seller')).ready).toEqual({ ok: false, code: 'FORBIDDEN' });
      const gone = await t.makeUser({ roles: ['customer'], status: 'suspended' });
      expect(await connect(t.tokenFor(gone, 'customer', { mfa: false })).ready).toEqual({ ok: false, code: 'ACCOUNT_SUSPENDED' });
    });

    it('needs two-step sign-in where the role does, and the admin host for staff', async () => {
      const seller = await t.makeUser({ roles: ['seller'], mfa: true });
      expect(await connect(t.tokenFor(seller, 'seller', { mfa: false })).ready).toEqual({ ok: false, code: 'MFA_REQUIRED' });
      const boss = await staffToken(t, 'admin');
      expect(await connect(boss.token).ready).toEqual({ ok: false, code: 'FORBIDDEN' });
      expect(await connect(boss.token, { auth: { host: 'admin' } }).ready).toEqual({ ok: true });
    });

    it('limits new connections per address', async () => {
      const u = await t.makeUser({ roles: ['customer'] });
      const token = t.tokenFor(u, 'customer', { mfa: false });
      const results = [];
      for (let i = 0; i < 31; i += 1) {
        const c = connect(token);
        results.push((await c.ready).ok ? 'ok' : (await c.ready).code);
        c.socket.disconnect();
      }
      expect(results.filter((r) => r === 'ok')).toHaveLength(30);
      expect(results.at(-1)).toBe('RATE_LIMITED');
    });
  });

  describe('each side hears only its own', () => {
    it('a new order reaches its shop and customer, not another shop or customer; hints carry no data', async () => {
      const shopA = await H.openShop(t, staff);
      const shopB = await H.openShop(t, staff);
      const alice = await H.customerAt(t);
      const bob = await H.customerAt(t);
      const [sa, sb, ca, cb] = await Promise.all([live(shopA.token), live(shopB.token), live(alice.token), live(bob.token)]);

      const order = await H.placeOrder(alice, shopA);
      const hint = await sa.next('order', order.id);
      expect(hint).toBeTruthy();
      expect(Object.keys(hint).sort()).toEqual(EVENT_KEYS);
      expect(await ca.next('order', order.id)).toBeTruthy();
      await sleep(300);
      expect(sb.events.filter((e) => e.topic === 'order')).toEqual([]);
      expect(cb.events.filter((e) => e.topic === 'order')).toEqual([]);

      // the seller accepts: the customer hears, the inbox message arrives as its own hint
      ca.events.length = 0;
      await shopA.api.post(`/seller/orders/${order.id}/accept`).expect(200);
      expect(await ca.next('order', order.id)).toBeTruthy();
      await t.inbox();
      expect(await ca.next('notification', order.id)).toBeTruthy();
      expect(cb.events).toEqual([]);
    });

    it('several customers ordering from one shop at once: one hint per order to the shop, each customer hears only theirs', async () => {
      const shop = await H.openShop(t, staff, { stock: 20 });
      const customers = await Promise.all([1, 2, 3, 4].map(() => H.customerAt(t)));
      const [board, ...mine] = await Promise.all([live(shop.token), ...customers.map((c) => live(c.token))]);
      const orders = await Promise.all(customers.map((c) => H.placeOrder(c, shop, 1)));
      for (const o of orders) expect(await board.next('order', o.id)).toBeTruthy();
      await sleep(300);
      expect(board.events.filter((e) => e.topic === 'order')).toHaveLength(orders.length);
      mine.forEach((m, i) => expect([...new Set(m.events.filter((e) => e.topic === 'order').map((e) => e.orderId))]).toEqual([orders[i].id]));
    });

    it('an offer reaches only the rider it was made to, and every rider asked hears when it is taken', async () => {
      const shop = await H.openShop(t, staff);
      const c = await H.customerAt(t);
      const near = await H.onlineRider(t, staff, H.SHOP);
      const far = await H.onlineRider(t, staff, H.lerp(H.SHOP, H.HOME, 0.5));
      const [rn, rf] = await Promise.all([live(near.token), live(far.token)]);
      const order = await H.placeOrder(c, shop);
      await shop.api.post(`/seller/orders/${order.id}/accept`).expect(200);

      const first = (await rn.next('offer', order.id)) ? rn : rf;
      const second = first === rn ? rf : rn;
      const firstRider = first === rn ? near : far;
      const secondRider = first === rn ? far : near;
      expect(await first.next('offer', order.id)).toBeTruthy();
      expect(second.events.filter((e) => e.topic === 'offer')).toEqual([]);

      // the first rider declines: the offer moves on and the second hears at once
      const [offer] = (await firstRider.api.get('/rider/offers').expect(200)).body;
      await firstRider.api.post(`/rider/offers/${offer.id}/decline`).expect(200);
      expect(await second.next('offer', order.id)).toBeTruthy();

      // the second accepts: both riders who were asked hear the offers changed, and the order event follows
      first.events.length = 0;
      const [next] = (await secondRider.api.get('/rider/offers').expect(200)).body;
      await secondRider.api.post(`/rider/offers/${next.id}/accept`).expect(200);
      expect(await first.next('offer', order.id)).toBeTruthy();
      expect(await second.next('order', order.id)).toBeTruthy();
    });

    it('the rider moving reaches the customer on the way and the operations room, not other customers', async () => {
      const { order, customer, rider } = await (async () => {
        const shop = await H.openShop(t, staff);
        const cust = await H.customerAt(t);
        const o = await H.placeOrder(cust, shop);
        const r = await H.onlineRider(t, staff);
        await shop.api.post(`/seller/orders/${o.id}/accept`).expect(200);
        const [offer] = (await r.api.get('/rider/offers').expect(200)).body;
        await r.api.post(`/rider/offers/${offer.id}/accept`).expect(200);
        await shop.api.post(`/seller/orders/${o.id}/start`).expect(200);
        await shop.api.post(`/seller/orders/${o.id}/packed`).expect(200);
        await r.api.post(`/rider/orders/${o.id}/picked-up`, { sealed: true }).expect(200);
        return { order: o, customer: cust, rider: r };
      })();
      const other = await H.customerAt(t);
      const boss = await staffToken(t, 'admin');
      const [cc, co, ops] = await Promise.all([live(customer.token), live(other.token), live(boss.token, { auth: { host: 'admin' } })]);

      await H.ping(t, rider, H.lerp(H.SHOP, H.HOME, 0.3));
      expect(await cc.next('position')).toBeTruthy();
      expect(await ops.next('position')).toBeTruthy();
      expect(co.events).toEqual([]);

      // the hint says only that it moved; the code itself still needs the REST route and 500 m
      await H.ping(t, rider, H.HOME);
      expect(await cc.next('order', order.id)).toBeTruthy();
      for (const e of [...cc.events, ...ops.events]) expect(Object.keys(e).every((k) => EVENT_KEYS.includes(k))).toBe(true);
      expect(JSON.stringify([...cc.events, ...ops.events])).not.toMatch(/code|otp|lat|lng|line/i);
    });

    it('staff rooms follow permissions: an admin hears operations and complaints, a reviewer neither', async () => {
      const boss = await staffToken(t, 'admin');
      const [ops, rev] = await Promise.all([live(boss.token, { auth: { host: 'admin' } }), live(staff.token, { auth: { host: 'admin' } })]);
      const shop = await H.openShop(t, staff);
      const c = await H.customerAt(t);
      const order = await H.placeOrder(c, shop);
      expect(await ops.next('order', order.id)).toBeTruthy();
      await sleep(200);
      expect(rev.events.filter((e) => e.topic === 'order')).toEqual([]);
    });
  });

  describe('nobody can widen their rooms', () => {
    it('join and subscribe messages change nothing, and a client that keeps sending is dropped', async () => {
      const shop = await H.openShop(t, staff);
      const alice = await H.customerAt(t);
      const mallory = await H.customerAt(t);
      const m = await live(mallory.token);
      for (const room of ['staff:ops', `u:${alice.user.id}:customer`, `u:${shop.user.id}:seller`]) {
        m.socket.emit('join', room);
        m.socket.emit('subscribe', { room });
      }
      const order = await H.placeOrder(alice, shop);
      await sleep(400);
      expect(m.events.filter((e) => e.orderId === order.id)).toEqual([]);
      const dropped = new Promise((r) => m.socket.once('disconnect', r));
      for (let i = 0; i < 25; i += 1) m.socket.emit('join', 'staff:ops');
      expect(await dropped).toBe('io server disconnect');
    });
  });

  describe('closing and coming back', () => {
    it('suspending an account closes its sockets at once', async () => {
      const boss = await staffToken(t, 'admin');
      const c = await H.customerAt(t);
      const s = await live(c.token);
      const closed = new Promise((r) => s.socket.once('disconnect', r));
      await admin(t, boss.token).post(`/users/${c.user.id}/suspend`, { reason: 'Test suspension for the live socket' }).expect(200);
      expect(await closed).toBe('io server disconnect');
      expect(await connect(c.token).ready).toEqual({ ok: false, code: 'ACCOUNT_SUSPENDED' });
    });

    it('a socket closes when its token expires', async () => {
      const u = await t.makeUser({ roles: ['customer'] });
      const short = jwt.sign({ role: 'customer' }, h.env.JWT_SECRET, { subject: String(u.id), issuer: 'snackhub', audience: 'snackhub-web', expiresIn: 2 });
      const s = await live(short);
      const reason = await new Promise((r) => s.socket.once('disconnect', r));
      expect(reason).toBe('io server disconnect');
    });

    it('a dropped connection reconnects by itself and hears new hints', async () => {
      const shop = await H.openShop(t, staff);
      const c = await H.customerAt(t);
      const s = await live(shop.token, { reconnection: true });
      s.socket.io.engine.close();
      for (let i = 0; i < 80 && s.readies < 2; i += 1) await sleep(25);
      expect(s.readies).toBe(2);
      const order = await H.placeOrder(c, shop);
      expect(await s.next('order', order.id)).toBeTruthy();
    });

    it('a notification delivered twice makes one hint; every hint has its own id', async () => {
      const shop = await H.openShop(t, staff);
      const c = await H.customerAt(t);
      const s = await live(shop.token);
      const order = await H.placeOrder(c, shop);
      await t.inbox();
      // the relay meets the same outbox row again (a crash before it marked the row sent)
      await t.trx.ordering('outbox').where({ type: 'notify.inbox' }).whereRaw("JSON_EXTRACT(payload, '$.orderId') = ?", [order.id]).update({ published_at: null, attempts: 0 });
      await t.inbox();
      await sleep(300);
      expect(s.events.filter((e) => e.topic === 'notification' && e.orderId === order.id)).toHaveLength(1);
      expect(new Set(s.events.map((e) => e.id)).size).toBe(s.events.length);
    });
  });
});
