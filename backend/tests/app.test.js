// Platform behaviour that needs no database: env check, request id, error envelope,
// CORS, health and readiness.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { loadEnv } from '../src/config/env.js';
import { createApp } from '../src/app.js';

const VALID = {
  CORS_ORIGINS: 'http://localhost:5173',
  DB_HOST: '127.0.0.1',
  DB_PORT: '3307',
  DB_MIGRATOR_USER: 'sh_migrator',
  DB_MIGRATOR_PASSWORD: 'not-a-real-secret',
  DB_MODULE_PASSWORD: 'not-a-real-secret',
  JWT_SECRET: 'test-only-secret-that-is-at-least-32-characters',
};

const fakeDb = (ok = true) => ({ raw: async () => (ok ? [[{ 1: 1 }]] : Promise.reject(new Error('down'))) });
const appWith = (dbs = { catalog: fakeDb() }) => createApp({ env: loadEnv(VALID), logger: pino({ level: 'silent' }), dbs, verifyGoogle: async () => { throw new Error('not used'); } });

describe('env check', () => {
  it('fails at boot naming the bad keys, never their values', () => {
    const run = () => loadEnv({ ...VALID, DB_PORT: 'abc', DB_MODULE_PASSWORD: 'short' });
    expect(run).toThrow(/DB_PORT/);
    expect(run).toThrow(/DB_MODULE_PASSWORD/);
    expect(run).not.toThrow(/short/);
  });

  it('applies defaults and splits the origin list', () => {
    const env = loadEnv({ ...VALID, CORS_ORIGINS: 'http://localhost:5173, http://localhost:5174' });
    expect(env.PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173', 'http://localhost:5174']);
  });

  it('rejects a wildcard origin', () => {
    expect(() => loadEnv({ ...VALID, CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS/);
  });
});

describe('platform', () => {
  it('answers /health and sets security headers', async () => {
    const res = await request(appWith()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('keeps a well-formed request id and replaces a malformed one', async () => {
    const kept = await request(appWith()).get('/health').set('X-Request-Id', 'abc12345-test');
    expect(kept.headers['x-request-id']).toBe('abc12345-test');
    const replaced = await request(appWith()).get('/health').set('X-Request-Id', 'bad id; with spaces');
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns the error envelope for an unknown route', async () => {
    const res = await request(appWith()).get('/nope').set('X-Request-Id', 'req-00000001');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found', requestId: 'req-00000001' } });
  });

  it('returns BAD_JSON for a malformed body', async () => {
    const res = await request(appWith()).post('/anything').set('Content-Type', 'application/json').send('{"a":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_JSON');
  });

  it('allows only the configured origins', async () => {
    const ok = await request(appWith()).get('/health').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const other = await request(appWith()).get('/health').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('/ready is 503 when a module cannot reach its schema', async () => {
    const up = await request(appWith({ catalog: fakeDb(), payment: fakeDb() })).get('/ready');
    expect(up.status).toBe(200);
    const down = await request(appWith({ catalog: fakeDb(), payment: fakeDb(false) })).get('/ready');
    expect(down.status).toBe(503);
    expect(down.body.modules).toEqual({ catalog: 'ok', payment: 'down' });
  });
});
