// Catalog API on the seeded demo data (doc 11.2): the same shapes the frontend mock serves,
// read from MySQL through the catalog and ordering module users. Read only.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { connect } from './helpers/db.js';
import { moduleDb } from '../src/db/connection.js';
import { loadEnv } from '../src/config/env.js';
import { createApp } from '../src/app.js';

const { db: migrator, env: dbEnv, reason } = await connect();
if (!migrator) console.warn(`catalog tests skipped: ${reason}`);
const dbs = migrator ? { catalog: moduleDb(dbEnv, 'catalog'), ordering: moduleDb(dbEnv, 'ordering') } : {};
afterAll(async () => {
  await Promise.all([migrator, ...Object.values(dbs)].filter(Boolean).map((d) => d.destroy()));
});

const env = migrator
  ? loadEnv({ ...dbEnv, DB_PORT: String(dbEnv.DB_PORT), CORS_ORIGINS: 'http://localhost:5173', JWT_SECRET: 'test-only-secret-that-is-at-least-32-characters',
      MFA_KEY: 'dGVzdC1vbmx5LW1mYS1rZXktMzItYnl0ZXMtbG9uZyE', GOOGLE_CLIENT_ID: '' })
  : null;
const app = migrator ? createApp({ env, logger: pino({ level: 'silent' }), dbs, verifyGoogle: async () => { throw new Error('unused'); } }) : null;

// the demo shops keep real hours (most 8 am to 10 pm, India time): read them at Monday noon
beforeAll(() => vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 10, 2, 6, 30) }));
afterAll(() => vi.useRealTimers());

const BRODIPET = 'lat=16.3152&lng=80.4301'; // demo home address in Guntur
const NOWHERE = 'lat=21.1458&lng=79.0882'; // Nagpur: no demo shops

describe.skipIf(!migrator)('catalog API', () => {
  it('lists the demo cities', async () => {
    const res = await request(app).get('/api/v1/cities').expect(200);
    expect(res.body.map((c) => c.id)).toContain('guntur');
  });

  it('lists the Guntur shops that can deliver to Brodipet, nearest first, with a promise', async () => {
    const res = await request(app).get(`/api/v1/sellers?${BRODIPET}`).expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((s) => s.city === 'Guntur')).toBe(true);
    const km = res.body.map((s) => s.distanceKm);
    expect(km).toEqual([...km].sort((a, b) => a - b));
    const [first] = res.body;
    expect(first.promise.AMBIENT.window[1]).toBeLessThanOrEqual(30);
    expect(first).not.toHaveProperty('licenceNo');
    expect(first).not.toHaveProperty('user_id');
  });

  it('says whether a seller is a shop, a street stall or a home kitchen', async () => {
    const shops = (await request(app).get(`/api/v1/sellers?${BRODIPET}`).expect(200)).body;
    expect(shops.find((s) => s.id === 1)).toMatchObject({ shopName: 'Brodipet Mirchi Corner', kind: 'stall' });
    expect(shops.map((s) => s.kind)).toEqual(expect.arrayContaining(['shop', 'stall', 'home']));
    const products = (await request(app).get(`/api/v1/products?${BRODIPET}`).expect(200)).body;
    expect(products.find((p) => p.sellerId === 1).shopKind).toBe('stall');
  });

  it('returns nothing where no shop delivers', async () => {
    const res = await request(app).get(`/api/v1/products?${NOWHERE}`).expect(200);
    expect(res.body).toEqual([]);
  });

  it('lists serviceable products near a point with stock and shop name', async () => {
    const res = await request(app).get(`/api/v1/products?${BRODIPET}`).expect(200);
    const mirchi = res.body.find((p) => p.title === 'Mirchi Bajji' && p.sellerId === 1);
    expect(mirchi).toMatchObject({ servingTemp: 'HOT', serviceable: true, stock: 3, shopName: expect.any(String) });
    expect(typeof mirchi.spice).toBe('number');
    expect(res.body.every((p) => p.serviceable && Number.isInteger(p.pricePaise))).toBe(true);
  });

  it('shows a shop with its menu, and hides shops customers may not see', async () => {
    const res = await request(app).get(`/api/v1/sellers/1?${BRODIPET}`).expect(200);
    expect(res.body.products.length).toBeGreaterThan(0);
    expect(res.body.promise.HOT).toHaveProperty('serviceable');
    const [hidden] = await dbs.catalog('sellers').whereIn('status', ['suspended', 'pending']).pluck('id');
    await request(app).get(`/api/v1/sellers/${hidden}`).expect(404);
  });

  it('finds snacks by name, synonym and near spelling', async () => {
    const byName = await request(app).get(`/api/v1/search?q=bajji&${BRODIPET}`).expect(200);
    expect(byName.body.results[0].title).toBe('Mirchi Bajji');
    const typo = await request(app).get(`/api/v1/search?q=punugul&${BRODIPET}`).expect(200);
    expect(typo.body.results.map((r) => r.title)).toContain('Punugulu');
  });

  it('rejects a missing or out-of-range point and unknown fields', async () => {
    await request(app).get('/api/v1/products').expect(400);
    await request(app).get('/api/v1/products?lat=51.5&lng=-0.12').expect(400);
    await request(app).get(`/api/v1/products?${BRODIPET}&sellerId=2`).expect(400);
    await request(app).get(`/api/v1/search?q=&${BRODIPET}`).expect(400);
    await request(app).get('/api/v1/sellers/abc').expect(400);
  });
});
