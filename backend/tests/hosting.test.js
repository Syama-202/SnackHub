// Hosting (doc 15.0): requests signed by the Netlify sites name their site and carry the
// visitor's address; nothing else is trusted; with REQUIRE_PROXY the API answers only through
// the sites (webhooks and health checks stay open). Settings read "false" as false. The bucket
// store keeps, returns and deletes files, here against a small fake S3 server.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import http from 'node:http';
import pino from 'pino';
import { openHarness, request } from './helpers/app.js';
import { createApp } from '../src/app.js';
import { loadEnv, loadDbEnv } from '../src/config/env.js';
import { netlifyProxy, siteOf } from '../src/middleware/proxy.js';
import { createStorage } from '../src/utils/storage.js';

const SECRET = 'test-proxy-signing-secret-0123456789abcdef';
const SITES = { APP_URL: 'https://snackhub.example.com', ADMIN_CONSOLE_URL: 'https://snackhub-admin.example.com/' };
const env0 = { PROXY_SIGNING_SECRET: SECRET, ...SITES };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function sign(claims, { secret = SECRET, alg = 'HS256' } = {}) {
  const h = b64({ alg, typ: 'JWT' });
  const p = b64({ iss: 'netlify', exp: Math.floor(Date.now() / 1000) + 60, deploy_context: 'production', netlify_id: 'test', ...claims });
  return `${h}.${p}.${createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`;
}

describe('Netlify signatures', () => {
  it('name the site only for a valid, current signature from one of the two sites', () => {
    expect(siteOf(sign({ site_url: 'https://snackhub.example.com' }), env0)).toBe('web');
    expect(siteOf(sign({ site_url: 'https://snackhub-admin.example.com' }), env0)).toBe('admin');
    expect(siteOf(sign({ site_url: 'https://snackhub.example.com' }, { secret: 'another-secret-another-secret-0000' }), env0)).toBeNull();
    expect(siteOf(sign({ site_url: 'https://snackhub.example.com', exp: Math.floor(Date.now() / 1000) - 120 }), env0)).toBeNull();
    expect(siteOf(sign({ site_url: 'https://snackhub.example.com', iss: 'someone' }), env0)).toBeNull();
    expect(siteOf(sign({ site_url: 'https://evil.example.com' }), env0)).toBeNull();
    expect(siteOf(sign({ site_url: 'https://snackhub.example.com' }, { alg: 'none' }), env0)).toBeNull();
    // the payload changed after signing: the web site's signature cannot become the admin's
    const [h, , s] = sign({ site_url: 'https://snackhub.example.com' }).split('.');
    expect(siteOf(`${h}.${b64({ iss: 'netlify', exp: 9999999999, site_url: 'https://snackhub-admin.example.com' })}.${s}`, env0)).toBeNull();
    expect(siteOf('not.a.token', env0)).toBeNull();
    expect(siteOf(sign({ site_url: 'https://snackhub.example.com' }), { ...env0, PROXY_SIGNING_SECRET: '' })).toBeNull();
  });

  it('give a signed request its site and visitor address, and an unsigned one nothing', () => {
    const run = (headers, env = env0) => {
      const req = { path: '/api/v1/cities', get: (k) => headers[k.toLowerCase()], ip: '10.0.0.1' };
      let err;
      netlifyProxy({ REQUIRE_PROXY: false, ...env })(req, {}, (e) => (err = e));
      return { req, err };
    };
    const signed = run({ 'x-nf-sign': sign({ site_url: 'https://snackhub.example.com' }), 'x-nf-client-connection-ip': '203.0.113.7' });
    expect(signed.req).toMatchObject({ viaSite: 'web', ip: '203.0.113.7' });
    // an address header without a signature is ignored
    const forged = run({ 'x-nf-client-connection-ip': '203.0.113.7' });
    expect(forged.req.ip).toBe('10.0.0.1');
    expect(forged.req.viaSite).toBeUndefined();
    expect(run({ 'x-nf-sign': sign({ site_url: 'https://snackhub.example.com' }), 'x-nf-client-connection-ip': 'not-an-ip' }).req.ip).toBe('10.0.0.1');
    expect(run({}, { ...env0, REQUIRE_PROXY: true }).err?.code).toBe('USE_THE_SITE');
  });
});

describe('settings', () => {
  it('read an unset "false" switch as false, not as the text "false"', () => {
    const base = { DB_HOST: 'h', DB_PORT: '3306', DB_MIGRATOR_USER: 'm', DB_MIGRATOR_PASSWORD: 'password1', DB_MODULE_PASSWORD: 'password2' };
    expect(loadDbEnv(base).DB_SSL).toBe(false);
    expect(loadDbEnv({ ...base, DB_SSL: 'true' }).DB_SSL).toBe(true);
    const full = { ...base, CORS_ORIGINS: 'http://localhost:5180', JWT_SECRET: 'x'.repeat(40), MFA_KEY: 'a'.repeat(43) };
    const e = loadEnv(full);
    expect(e).toMatchObject({ PASSWORD_BREACH_CHECK: false, SMTP_SECURE: false, DB_SSL: false, HOST: '127.0.0.1', REQUIRE_PROXY: false, STORAGE_DRIVER: 'disk' });
    // production with the secret: only the sites get in, unless switched off
    expect(loadEnv({ ...full, NODE_ENV: 'production', REDIS_URL: 'rediss://x', PROXY_SIGNING_SECRET: SECRET }).REQUIRE_PROXY).toBe(true);
    expect(() => loadEnv({ ...full, REQUIRE_PROXY: 'true' })).toThrow(/PROXY_SIGNING_SECRET/);
    expect(() => loadEnv({ ...full, STORAGE_DRIVER: 's3' })).toThrow(/S3_ENDPOINT/);
  });
});

const h = await openHarness();
afterAll(() => h.close?.());

describe.skipIf(h.skip)('through the sites only', () => {
  let app;
  beforeAll(() => {
    app = createApp({ env: Object.freeze({ ...h.env, ...env0, REQUIRE_PROXY: true }), logger: pino({ level: 'silent' }), dbs: h.pools });
  });
  const web = () => ({ 'x-nf-sign': sign({ site_url: 'https://snackhub.example.com' }) });
  const adminSite = () => ({ 'x-nf-sign': sign({ site_url: 'https://snackhub-admin.example.com' }) });

  it('refuses API calls around the sites, keeps health and webhooks open, and opens admin routes to the admin site only', async () => {
    expect((await request(app).get('/api/v1/cities').expect(403)).body.error.code).toBe('USE_THE_SITE');
    await request(app).get('/api/v1/cities').set(web()).expect(200);
    await request(app).get('/health').expect(200);
    const hook = await request(app).post('/api/v1/webhooks/phonepe').send({});
    expect(hook.body.error?.code).not.toBe('USE_THE_SITE');
    // admin routes: the public site gets the same 404 as an unknown path; the admin site reaches sign-in
    await request(app).get('/api/v1/admin/payouts').set(web()).expect(404);
    expect((await request(app).get('/api/v1/admin/payouts').set(adminSite()).expect(401)).body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('bucket storage', () => {
  let server;
  let endpoint;
  const objects = new Map();
  beforeAll(async () => {
    // just enough of the S3 API: PUT, GET and DELETE of one object by path
    server = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const key = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (req.method === 'PUT') {
          objects.set(key, Buffer.concat(chunks));
          res.writeHead(200, { ETag: '"1"' }).end();
        } else if (req.method === 'GET' && objects.has(key)) {
          res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': objects.get(key).length }).end(objects.get(key));
        } else if (req.method === 'DELETE') {
          objects.delete(key);
          res.writeHead(204).end();
        } else {
          res.writeHead(404, { 'Content-Type': 'application/xml' }).end('<?xml version="1.0"?><Error><Code>NoSuchKey</Code><Message>missing</Message></Error>');
        }
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    endpoint = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => new Promise((r) => server.close(r)));

  it('keeps, returns and deletes files under random keys in a private bucket', async () => {
    const s = createStorage({ STORAGE_DRIVER: 's3', S3_ENDPOINT: endpoint, S3_REGION: 'auto', S3_BUCKET: 'docs', S3_ACCESS_KEY_ID: 'test', S3_SECRET_ACCESS_KEY: 'test-secret' });
    expect(s.kind).toBe('s3');
    const key = await s.put(Buffer.from('%PDF-1.4 test document (demo)'));
    expect(key).toMatch(/^[a-f0-9]{32}$/);
    expect([...objects.keys()]).toEqual([`/docs/${key}`]);
    expect((await s.read(key)).toString()).toBe('%PDF-1.4 test document (demo)');
    await s.write('de5e' + '0'.repeat(27) + '1', Buffer.from('placeholder (demo)'));
    expect((await s.read('de5e' + '0'.repeat(27) + '1')).toString()).toBe('placeholder (demo)');
    await s.remove(key);
    await expect(s.read(key)).rejects.toThrow();
    await expect(s.read('../../etc/passwd')).rejects.toThrow(/Bad storage key/);
  });
});
