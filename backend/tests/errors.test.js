// Error monitoring: crashes are grouped by cause, scrubbed of personal data, reopened when a
// resolved one comes back (with an admin alert), and only admins on the admin host read them.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHarness, beginTest, request, ADMIN, bearer } from './helpers/app.js';
import { staffToken, admin } from './helpers/onboarding.js';
import { fingerprintParts, routeShape, scrub } from '../../shared/domain/errors.js';
import { describeError } from '../src/utils/errors.js';
import * as H from './helpers/orders.js';

const h = await openHarness();
if (h.skip) console.warn(`error monitoring tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

describe('error rules', () => {
  it('scrubs personal data and groups errors that differ only in numbers', () => {
    const s = scrub('Lookup for priya@example.com, +91 98765 43210 9876543210, code 4821, token eyJhbGciOiJIUzI1.eyJzdWIiOjEyMzQ1.c2lnbmF0dXJlMTIz at /x?lat=16.3&q=home');
    expect(s).not.toMatch(/priya|98765|4821|eyJ|lat=|home/);
    expect(s).toContain('<email>');
    expect(scrub('ab '.repeat(200)).length).toBe(300);
    expect(routeShape('/orders/1234/report?x=1')).toBe('/orders/:id/report');
    const a = fingerprintParts({ source: 'api', kind: 'TypeError', where: 'GET /x', message: 'order 12 not found' });
    expect(fingerprintParts({ source: 'api', kind: 'TypeError', where: 'GET /x', message: 'order 99 not found' })).toBe(a);
    expect(fingerprintParts({ source: 'web', kind: 'TypeError', where: 'GET /x', message: 'order 12 not found' })).not.toBe(a);
    // a database error keeps PostgreSQL's own message, without the SQL or its values
    const db = Object.assign(new Error(`insert into "addresses" ("line") values ('12 MG Road') - duplicate key value violates unique constraint "addresses_uq_default"`), { severity: 'ERROR', code: '23505', constraint: 'addresses_uq_default' });
    const d = describeError(db);
    expect(d).toMatchObject({ kind: '23505', message: 'duplicate key value violates unique constraint "addresses_uq_default"' });
    expect(d.stack).not.toContain('MG Road');
    const typed = Object.assign(new Error('select 1 - invalid input syntax for type integer: "12 MG Road"'), { severity: 'ERROR', code: '22P02' });
    expect(describeError(typed).message).toBe('invalid input syntax for type integer: "?"');
  });
});

describe.skipIf(h.skip)('error monitoring', () => {
  let t;
  let ops;
  let boom;
  const geocoder = { enabled: true, search: async () => { throw boom; }, reverse: async () => { throw boom; } };
  beforeEach(async () => {
    t = await beginTest(h, { geocoder });
    ops = await staffToken(t, 'admin');
  });
  afterEach(() => t.end());
  const settle = () => new Promise((r) => setTimeout(r, 150)); // recording runs after the response

  it('records an API crash once per cause, scrubbed, with the request id, and reopens it when it comes back', async () => {
    const c = await H.customerAt(t);
    boom = new TypeError('Cannot read lookup for priya@example.com order 123456');
    const first = await c.api.post('/me/places/search', { q: 'Brodipet Guntur' }).expect(500);
    boom = new TypeError('Cannot read lookup for ravi@example.com order 777777');
    await c.api.post('/me/places/search', { q: 'Lakshmipuram' }).expect(500);
    await settle();

    const a = admin(t, ops.token);
    const list = (await a.get('/errors').expect(200)).body;
    const g = list.groups.find((x) => x.where === 'POST /me/places/search');
    expect(g).toMatchObject({ source: 'api', kind: 'TypeError', status: 'open', seen: 2, message: 'Cannot read lookup for <email> order <n>' });
    const one = (await a.get(`/errors/${g.id}`).expect(200)).body;
    expect(one.stack).toContain('TypeError');
    expect(JSON.stringify(one)).not.toMatch(/priya|ravi|123456|777777/);
    expect(one.context).toMatchObject({ status: 500, role: 'customer' });
    expect(one.requestId).toBeTruthy();
    expect(first.body.error.requestId).toBeTruthy();

    // one alert for the new error
    const alerts = async () => (await t.trx.identity('outbox').where({ type: 'admin.alert' }).select('payload')).map((r) => (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload)).filter((p) => p.errorId === g.id);
    expect(await alerts()).toHaveLength(1);

    await a.post(`/errors/${g.id}/status`, { status: 'resolved' }).expect(200);
    await c.api.post('/me/places/search', { q: 'Brodipet Guntur' }).expect(500);
    await settle();
    const back = (await a.get(`/errors/${g.id}`).expect(200)).body;
    expect(back).toMatchObject({ status: 'open', seen: 3 });
    expect(back.regressedAt).toBeTruthy();
    // ignored stays ignored
    await a.post(`/errors/${g.id}/status`, { status: 'ignored' }).expect(200);
    await c.api.post('/me/places/search', { q: 'Brodipet Guntur' }).expect(500);
    await settle();
    expect((await a.get(`/errors/${g.id}`).expect(200)).body.status).toBe('ignored');
  });

  it('takes browser reports without sign-in, keeps only a path, and lets only admins read', async () => {
    const report = (body) => request(t.app).post('/api/v1/client-errors').send(body);
    await report({ source: 'web', kind: 'TypeError', message: 'x is undefined for 9876543210', page: '/orders/4411', stack: 'TypeError: x\n at Tracking (/src/pages/customer/OrderTracking.jsx:40:3)', release: 'dev', browser: 'Chrome on Android' }).expect(202);
    await report({ source: 'web', message: 'x', page: 'https://evil.test/' }).expect(400);
    await report({ source: 'api', message: 'x', page: '/' }).expect(400); // browsers report as web or admin only
    await settle();
    const a = admin(t, ops.token);
    const g = (await a.get('/errors?source=web').expect(200)).body.groups.find((x) => x.where === 'page /orders/:id');
    expect(g).toMatchObject({ kind: 'TypeError', message: 'x is undefined for <phone>' });

    const reviewer = await staffToken(t, 'reviewer');
    await request(t.app).get('/api/v1/admin/errors').set(ADMIN).set(bearer(reviewer.token)).expect(403);
    const c = await H.customerAt(t);
    await c.api.get('/admin/errors').expect(404);
  });
});
