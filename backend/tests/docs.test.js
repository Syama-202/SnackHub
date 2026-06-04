// API docs: the OpenAPI document is built from the routers, lists every route with what it
// checks, holds no secrets, and keeps the "every route validates input with zod" rule honest:
// a write route without a body schema must be on the short list of routes that take none.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pino from 'pino';
import { openHarness, request } from './helpers/app.js';
import { createApp } from '../src/app.js';
import { collectRoutes } from '../src/utils/apiDocs.js';

const h = await openHarness();
if (h.skip) console.warn(`docs tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

// write routes that take no body, each for a reason
const NO_BODY = [
  'POST /api/v1/auth/refresh', // the refresh cookie and the client header are the input
  'POST /api/v1/auth/logout',
  'POST /api/v1/auth/logout-all',
  'POST /api/v1/admin/auth/refresh',
  'POST /api/v1/admin/auth/logout',
  'POST /api/v1/admin/auth/logout-all',
  'POST /api/v1/admin/documents/{ref}/link', // a signed link for the document in the path
  'POST /api/v1/admin/documents/{ref}/number',
  'POST /api/v1/seller/onboarding/documents/{id}/link',
  'POST /api/v1/rider/onboarding/documents/{id}/link',
  'POST /api/v1/webhooks/phonepe', // the raw body, checked against the provider's signature
];

describe.skipIf(h.skip)('API docs', () => {
  let app;
  let spec;
  beforeAll(async () => {
    app = createApp({ env: h.env, logger: pino({ level: 'silent' }), dbs: h.pools });
    spec = (await request(app).get('/api/v1/openapi.json').expect(200)).body;
  });
  const ops = () => Object.entries(spec.paths).flatMap(([p, o]) => Object.entries(o).map(([m, op]) => ({ key: `${m.toUpperCase()} ${p}`, method: m, op })));

  it('lists every route, with its checks, its schemas and the error envelope', () => {
    expect(spec.openapi).toBe('3.1.0');
    expect(ops().length).toBeGreaterThan(140);
    const fromCatalogue = spec.paths['/api/v1/seller/products/from-catalogue'].post;
    expect(fromCatalogue.security).toEqual([{ bearer: [] }]);
    expect(fromCatalogue.description).toMatch(/seller\.products\.write/);
    expect(fromCatalogue.description).toMatch(/Rate limit `seller\.products\.create`: 30 per 60 min per account/);
    expect(fromCatalogue.requestBody.content['application/json'].schema.required).toEqual(expect.arrayContaining(['catalogItemId', 'pricePaise', 'prepMinutes']));
    expect(fromCatalogue.responses).toMatchObject({ 400: {}, 401: {}, 403: {}, 429: {} });
    const paid = spec.paths['/api/v1/admin/payouts/{id}/paid'].post;
    expect(paid.description).toMatch(/Admin host only/);
    expect(paid.description).toMatch(/Step-up: a second factor from the last 5 minutes/);
    expect(paid.parameters).toEqual([expect.objectContaining({ name: 'id', in: 'path', required: true })]);
    expect(spec.paths['/api/v1/products'].get.parameters.map((p) => p.name)).toEqual(expect.arrayContaining(['lat', 'lng']));
    expect(spec.paths['/api/v1/catalogue/{id}/offers'].get.summary).toBeUndefined(); // only where a route list describes it
    expect(spec.paths['/api/v1/admin/payouts'].get.summary).toMatch(/shops with money due/);
  });

  it('has a body schema on every write route except the few that take none', () => {
    const missing = ops().filter(({ method, op, key }) => ['post', 'put', 'patch'].includes(method) && !op.requestBody && !NO_BODY.includes(key)).map((o) => o.key);
    expect(missing).toEqual([]);
    // and every route the app serves is in the document (but the three docs routes themselves)
    const served = collectRoutes([['', app._router]]).length;
    expect(ops().length).toBe(served - 3);
  });

  it('holds no secrets, and serves Swagger UI from this API', async () => {
    const text = JSON.stringify(spec);
    for (const key of ['JWT_SECRET', 'MFA_KEY', 'DB_PASSWORD', 'VAPID_PRIVATE_KEY', 'PHONEPE_CLIENT_SECRET']) {
      const value = h.env[key];
      if (typeof value === 'string' && value.length >= 8) expect(text).not.toContain(value);
    }
    await request(app).get('/api/docs').expect(301);
    const page = await request(app).get('/api/docs/').expect(200);
    expect(page.text).toContain('swagger-ui');
    expect((await request(app).get('/api/docs/swagger-initializer.js').expect(200)).text).toContain('/api/v1/openapi.json');
  });

  it('is off when API_DOCS is off', async () => {
    const off = createApp({ env: { ...h.env, API_DOCS: false }, logger: pino({ level: 'silent' }), dbs: h.pools });
    await request(off).get('/api/v1/openapi.json').expect(404);
    await request(off).get('/api/docs/').expect(404);
  });
});
