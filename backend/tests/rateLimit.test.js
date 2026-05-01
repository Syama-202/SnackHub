// Rate limits: one 429 shape everywhere, counters shared by every API process through Redis
// (two apps here stand for two servers), no way around the per-account limits by changing IP
// address, and Redis going away never switches the limits off or fails a request.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import pino from 'pino';
import { openHarness, beginTest, request, bearer, WEB } from './helpers/app.js';
import { createApp } from '../src/app.js';
import { createRedis, closeRedis } from '../src/utils/redis.js';
import { createLimiter, memoryCounter, redisCounter } from '../src/utils/rateLimit.js';

const h = await openHarness();
if (h.skip) console.warn(`rate limit tests skipped: ${h.skip}`);

// the development Redis (npm run redis:up), database 15, so flushing it never touches the dev
// server's counters; the shared-counter tests skip without it
const REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6380/15';
const redis = createRedis({ REDIS_URL }, null, { name: 'test' });
const redisUp = await new Promise((resolve) => {
  redis.once('ready', () => resolve(true));
  redis.once('error', () => resolve(false));
  setTimeout(() => resolve(false), 3000);
});
if (!redisUp) console.warn('shared rate limit tests skipped: Redis is not running (npm run redis:up)');
afterAll(async () => {
  await closeRedis(redis);
  await h.close?.();
});

const silent = pino({ level: 'silent' });
const signIn = (app, email, ip) => request(app).post('/api/v1/auth/signin').set('X-Forwarded-For', ip).send({ portal: 'customer', identifier: email, password: 'not the password at all' });

describe('the limiter', () => {
  it('counts per key inside a window and reports when to retry', async () => {
    const l = createLimiter({ name: `t-${Date.now()}`, windowMs: 60_000, max: 2 });
    expect(await l.hit('a')).toMatchObject({ ok: true, remaining: 1 });
    expect(await l.hit('a')).toMatchObject({ ok: true, remaining: 0 });
    const third = await l.hit('a');
    expect(third.ok).toBe(false);
    expect(third.retryAfter).toBeGreaterThan(55);
    expect((await l.hit('b')).ok).toBe(true);
  });

  it('needs a name, so two limits never share a counter by accident', () => {
    expect(() => createLimiter({ windowMs: 1000, max: 1 })).toThrow(/name/);
  });

  it.skipIf(!redisUp)('stores hashed keys only, never the email or address', async () => {
    const name = `t-hash-${Date.now()}`;
    await createLimiter({ name, windowMs: 60_000, max: 5, store: redisCounter(redis) }).hit('asha@example.test|203.0.113.9');
    const keys = await redis.keys(`rl:${name}:*`);
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toMatch(/asha|example|203\.0/);
    await redis.del(keys);
  });

  it('keeps limiting in memory when Redis is unreachable, without failing the request', async () => {
    const dead = createRedis({ REDIS_URL: 'redis://127.0.0.1:1' }, null, { name: 'dead' });
    dead.on('error', () => {});
    const l = createLimiter({ name: 't-dead', windowMs: 60_000, max: 2, store: redisCounter(dead) });
    const results = [];
    for (let i = 0; i < 3; i += 1) results.push((await l.hit('x')).ok);
    expect(results).toEqual([true, true, false]);
    dead.disconnect();
  });
});

describe.skipIf(h.skip)('limits on the routes', () => {
  let t;
  beforeEach(async () => {
    t = await beginTest(h);
  });
  afterEach(() => t.end());

  it('answer 429 RATE_LIMITED with Retry-After, the same seconds in the body, and the RateLimit headers', async () => {
    const u = await t.makeUser({ roles: ['customer'] });
    const token = t.tokenFor(u, 'customer', { mfa: false });
    const order = { id: 999_999 };
    let res;
    for (let i = 0; i < 11; i += 1) res = await request(t.app).post(`/api/v1/orders/${order.id}/cancel`).set(bearer(token)).send({});
    expect(res.status).toBe(429);
    expect(res.body.error).toMatchObject({ code: 'RATE_LIMITED', details: { retryAfter: expect.any(Number) } });
    expect(Number(res.headers['retry-after'])).toBe(res.body.error.details.retryAfter);
    expect(res.headers['ratelimit-limit']).toBe('10');
    expect(res.headers['ratelimit-remaining']).toBe('0');
  });

  it('cover what was open before: seller order actions, new snacks, addresses, reviews and public search', async () => {
    const seller = await t.makeUser({ roles: ['seller'], mfa: true });
    const st = t.tokenFor(seller, 'seller');
    const codes = [];
    for (let i = 0; i < 61; i += 1) codes.push((await request(t.app).post('/api/v1/seller/orders/1/accept').set(bearer(st)).send({})).status);
    expect(codes.at(-1)).toBe(429);
    expect(codes.slice(0, 60)).not.toContain(429);

    const u = await t.makeUser({ roles: ['customer'] });
    const ct = t.tokenFor(u, 'customer', { mfa: false });
    const adds = [];
    for (let i = 0; i < 31; i += 1) adds.push((await request(t.app).delete('/api/v1/me/addresses/999999').set(bearer(ct))).status);
    expect(adds.at(-1)).toBe(429);

    const searches = [];
    for (let i = 0; i < 61; i += 1) searches.push((await request(t.app).get('/api/v1/search').query({ lat: 16.3, lng: 80.45, q: 'murukku' })).status);
    expect(searches.at(-1)).toBe(429);
  });

  it('cap every request from one address across all routes', async () => {
    const app = createApp({ env: { ...h.env, RATE_LIMIT_IP_PER_MIN: 60 }, logger: silent, dbs: t.trx });
    const codes = [];
    for (let i = 0; i < 61; i += 1) codes.push((await request(app).get('/api/v1/cities').set('X-Forwarded-For', '198.51.100.7')).status);
    expect(codes.slice(0, 60)).not.toContain(429);
    expect(codes.at(-1)).toBe(429);
    // health checks sit outside the API and stay answerable
    expect((await request(app).get('/health').set('X-Forwarded-For', '198.51.100.7')).status).toBe(200);
  });

  it('cannot be dodged on one account by changing the forwarded IP address or the email case', async () => {
    const u = await t.makeUser({ roles: ['customer'] });
    const codes = [];
    for (let i = 0; i < 21; i += 1) codes.push((await signIn(t.app, i % 2 ? u.email.toUpperCase() : u.email, `203.0.113.${i + 1}`)).status);
    // every try came from a "new" address, so only the per-email limit can stop the 21st
    expect(codes.slice(0, 20)).not.toContain(429);
    expect(codes.at(-1)).toBe(429);
  });

  it.skipIf(!redisUp)('are shared by every server: two apps on one Redis count together, and a restart keeps the count', async () => {
    await redis.flushdb();
    const u = await t.makeUser({ roles: ['customer'] });
    const one = createApp({ env: h.env, logger: silent, dbs: t.trx, redis });
    const two = createApp({ env: h.env, logger: silent, dbs: t.trx, redis });
    const codes = [];
    for (let i = 0; i < 10; i += 1) codes.push((await signIn(i % 2 ? one : two, u.email, '192.0.2.10')).status);
    expect(codes).not.toContain(429);
    // a third server starts later: it sees the ten tries already counted
    const three = createApp({ env: h.env, logger: silent, dbs: t.trx, redis });
    const res = await signIn(three, u.email, '192.0.2.10');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    await redis.flushdb();
  });

  it.skipIf(!redisUp)('let concurrent requests on two servers through exactly up to the limit', async () => {
    await redis.flushdb();
    const u = await t.makeUser({ roles: ['customer'] });
    const token = t.tokenFor(u, 'customer', { mfa: false });
    const one = createApp({ env: h.env, logger: silent, dbs: t.trx, redis });
    const two = createApp({ env: h.env, logger: silent, dbs: t.trx, redis });
    const results = await Promise.all(Array.from({ length: 16 }, (_, i) => request(i % 2 ? one : two).post('/api/v1/orders/999999/cancel').set(bearer(token)).send({})));
    expect(results.filter((r) => r.status === 429)).toHaveLength(6);
    await redis.flushdb();
  });

  it('cover the session refresh route per address', async () => {
    const res = await request(t.app).post('/api/v1/auth/refresh').set(WEB);
    expect(res.status).toBe(401);
    expect(res.headers['ratelimit-limit']).toBe('120');
  });
});
