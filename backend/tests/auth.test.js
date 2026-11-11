// Prompt 2.3: Google sign-in, sessions and privilege escalation. Google is replaced by a
// fake verifier, so no request leaves the machine. The identity schema is used through its
// own module user inside one transaction that is rolled back, so nothing is left behind.
import { afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import jwt from 'jsonwebtoken';
import { connect } from './helpers/db.js';
import { moduleDb } from '../src/db/connection.js';
import { loadEnv } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { verifyAccessToken } from '../src/utils/tokens.js';

const { db: migrator, env: dbEnv, reason } = await connect();
if (!migrator) console.warn(`auth tests skipped: ${reason}`);
const identity = migrator ? moduleDb(dbEnv, 'identity') : null;
afterAll(async () => {
  await Promise.all([migrator, identity].filter(Boolean).map((d) => d.destroy()));
});

const env = migrator
  ? loadEnv({
      ...dbEnv,
      DB_PORT: String(dbEnv.DB_PORT),
      CORS_ORIGINS: 'http://localhost:5175',
      JWT_SECRET: 'test-only-secret-that-is-at-least-32-characters',
      MFA_KEY: 'dGVzdC1vbmx5LW1mYS1rZXktMzItYnl0ZXMtbG9uZyE',
      GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
      COOKIE_SECURE: 'false',
    })
  : null;

// A fake Google ID token: header.payload.signature, the payload is what "Google" says
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const googleToken = (claims) => `eyJhbGciOiJSUzI1NiJ9.${b64(claims)}.${'s'.repeat(90)}`;
const fakeVerify = async (credential) => {
  const claims = JSON.parse(Buffer.from(credential.split('.')[1], 'base64url').toString());
  if (claims.forged) throw new Error('bad signature');
  return { sub: claims.sub, email: claims.email, emailVerified: claims.email_verified !== false, name: claims.name ?? 'Test person (demo)' };
};

let n = 0;
const person = (over = {}) => {
  n++;
  return { sub: `test-sub-${Date.now()}-${n}`, email: `google-${Date.now()}-${n}@example.test`, ...over };
};
const DEVICE = 'device-test-0001';
const CLIENT = { 'X-SnackHub-Client': 'web' };
const cookieFrom = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith('sh_refresh='));
const cookieValue = (c) => c.split(';')[0];

describe.skipIf(!migrator)('Google sign-in', () => {
  let trx;
  let app;
  beforeEach(async () => {
    trx = await identity.transaction();
    app = createApp({ env, logger: pino({ level: 'silent' }), dbs: { identity: trx }, verifyGoogle: fakeVerify });
  });
  afterEach(async () => {
    await trx.rollback();
  });

  const signIn = (claims, body = {}) => request(app).post('/api/v1/auth/google').send({ credential: googleToken(claims), deviceId: DEVICE, ...body });

  it('creates a customer for a new verified Google account and sets a safe refresh cookie', async () => {
    const p = person();
    const res = await signIn(p);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: p.email, role: 'customer' });
    const claims = verifyAccessToken(env, res.body.accessToken);
    expect(claims).toEqual({ userId: res.body.user.id, role: 'customer', mfaAt: null, amr: ['google'], exp: expect.any(Number) });
    expect(claims.exp - Date.now()).toBeGreaterThan(14 * 60_000);
    const cookie = cookieFrom(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    // the database keeps only the hash, never the cookie value
    const raw = cookieValue(cookie).split('=')[1];
    expect(await trx('refresh_tokens').where({ token_hash: raw }).first()).toBeUndefined();
  });

  it('signs the same Google account in again without making a second user', async () => {
    const p = person();
    const first = await signIn(p);
    const again = await signIn({ ...p, email: p.email });
    expect(again.body.user.id).toBe(first.body.user.id);
    expect(await trx('users').where({ google_sub: p.sub }).count({ c: '*' }).first()).toEqual({ c: 1 });
  });

  it('refuses an unverified Google email and a token Google did not sign', async () => {
    expect((await signIn(person({ email_verified: false }))).body.error.code).toBe('EMAIL_NOT_VERIFIED');
    const forged = await signIn(person({ forged: true }));
    expect(forged.status).toBe(401);
    expect(forged.body.error.code).toBe('GOOGLE_TOKEN_INVALID');
  });

  it('validates the request body and ignores nothing silently', async () => {
    const res = await request(app).post('/api/v1/auth/google').send({ credential: 'short', deviceId: DEVICE });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('never lets the body choose a role (privilege escalation)', async () => {
    const res = await signIn(person(), { role: 'admin' });
    expect(res.status).toBe(400); // unknown fields are refused outright
    const ok = await signIn(person());
    expect(ok.body.user.role).toBe('customer');
  });

  it('links an existing account by verified email; Google signs in to the customer portal only', async () => {
    const seller = await trx('users').where({ email: 'seller1@example.test' }).first();
    const res = await signIn({ sub: `seller-sub-${Date.now()}`, email: 'seller1@example.test' });
    expect(res.status).toBe(200);
    // the seller keeps the seller role, and gets a customer token, never a seller one
    expect(res.body.user).toMatchObject({ id: seller.id, role: 'customer' });
    expect(res.body.user.roles).toEqual(expect.arrayContaining(['seller', 'customer']));
    expect(verifyAccessToken(env, res.body.accessToken).role).toBe('customer');
    // a second Google account cannot take over the same email
    const takeover = await signIn({ sub: `other-sub-${Date.now()}`, email: 'seller1@example.test' });
    expect(takeover.body.error.code).toBe('ACCOUNT_LINKED_ELSEWHERE');
  });

  it('gives staff no token here: they sign in on the admin console with a second factor', async () => {
    const res = await signIn({ sub: `admin-sub-${Date.now()}`, email: 'admin@example.test' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('STAFF_ACCOUNT');
    expect(cookieFrom(res)).toBeUndefined();
  });

  it('refuses a suspended account', async () => {
    const p = person();
    const first = await signIn(p);
    await trx('users').where({ id: first.body.user.id }).update({ status: 'suspended', status_reason: 'Test (demo)' });
    expect((await signIn(p)).body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('answers 503 until a Google client ID is configured', async () => {
    const bare = createApp({ env: { ...env, GOOGLE_CLIENT_ID: '' }, logger: pino({ level: 'silent' }), dbs: { identity: trx }, verifyGoogle: fakeVerify });
    const res = await request(bare).post('/api/v1/auth/google').send({ credential: googleToken(person()), deviceId: DEVICE });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('GOOGLE_NOT_CONFIGURED');
  });
});

describe.skipIf(!migrator)('sessions', () => {
  let trx;
  let app;
  beforeEach(async () => {
    trx = await identity.transaction();
    app = createApp({ env, logger: pino({ level: 'silent' }), dbs: { identity: trx }, verifyGoogle: fakeVerify });
  });
  afterEach(async () => {
    await trx.rollback();
  });

  async function session() {
    const res = await request(app).post('/api/v1/auth/google').send({ credential: googleToken(person()), deviceId: DEVICE });
    return { user: res.body.user, access: res.body.accessToken, cookie: cookieValue(cookieFrom(res)) };
  }
  const refresh = (cookie, headers = CLIENT) => request(app).post('/api/v1/auth/refresh').set(headers).set('Cookie', cookie);

  it('rotates the refresh cookie on every use', async () => {
    const s = await session();
    const r = await refresh(s.cookie);
    expect(r.status).toBe(200);
    expect(verifyAccessToken(env, r.body.accessToken).userId).toBe(s.user.id);
    const next = cookieValue(cookieFrom(r));
    expect(next).not.toBe(s.cookie);
    expect((await refresh(next)).status).toBe(200);
  });

  it('a reused refresh token ends every session in its family (reuse detection)', async () => {
    const s = await session();
    const r = await refresh(s.cookie);
    const next = cookieValue(cookieFrom(r));
    // move the first use outside the two-tab grace window, as if an attacker replays it later
    await trx('refresh_tokens').whereNotNull('used_at').update({ used_at: new Date(Date.now() - 60_000) });
    const replay = await refresh(s.cookie);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('TOKEN_REUSED');
    // the honest user's newer token is gone too, and the event is in the audit log
    expect((await refresh(next)).body.error.code).toBe('SESSION_ENDED');
    expect(await trx('audit_log').where({ actor_id: s.user.id, action: 'auth.refresh.reuse_detected' }).first()).toBeTruthy();
  });

  it('two tabs refreshing at once both stay signed in', async () => {
    const s = await session();
    const [a, b] = [await refresh(s.cookie), await refresh(s.cookie)];
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(cookieFrom(b)).toBeUndefined(); // the browser already holds the cookie from the first answer
  });

  it('refuses refresh and logout without the client header (cross-site requests)', async () => {
    const s = await session();
    expect((await refresh(s.cookie, {})).body.error.code).toBe('CLIENT_HEADER_MISSING');
    expect((await request(app).post('/api/v1/auth/logout').set('Cookie', s.cookie)).status).toBe(403);
  });

  it('logout ends the session and clears the cookie', async () => {
    const s = await session();
    const out = await request(app).post('/api/v1/auth/logout').set(CLIENT).set('Cookie', s.cookie);
    expect(out.status).toBe(204);
    expect(cookieFrom(out)).toMatch(/sh_refresh=;/);
    expect((await refresh(s.cookie)).body.error.code).toBe('SESSION_ENDED');
  });

  it('a new sign-in on the same device ends that device’s old session only', async () => {
    const s = await session();
    const p = await trx('users').where({ id: s.user.id }).first();
    const again = await request(app).post('/api/v1/auth/google').send({ credential: googleToken({ sub: p.google_sub, email: p.email }), deviceId: DEVICE });
    const laptop = await request(app).post('/api/v1/auth/google').send({ credential: googleToken({ sub: p.google_sub, email: p.email }), deviceId: 'device-test-laptop' });
    expect((await refresh(s.cookie)).body.error.code).toBe('SESSION_ENDED');
    expect((await refresh(cookieValue(cookieFrom(again)))).status).toBe(200);
    expect((await refresh(cookieValue(cookieFrom(laptop)))).status).toBe(200);
  });

  it('/me needs a valid access token and reads the account fresh', async () => {
    const s = await session();
    expect((await request(app).get('/api/v1/me')).status).toBe(401);
    const forged = jwt.sign({ role: 'admin' }, 'wrong-secret-wrong-secret-wrong-secret', { subject: String(s.user.id), issuer: 'snackhub', audience: 'snackhub-web' });
    expect((await request(app).get('/api/v1/me').set('Authorization', `Bearer ${forged}`)).status).toBe(401);
    const me = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${s.access}`);
    expect(me.body).toMatchObject({ id: s.user.id, role: 'customer' });
    await trx('users').where({ id: s.user.id }).update({ status: 'suspended', status_reason: 'Test (demo)' });
    expect((await request(app).get('/api/v1/me').set('Authorization', `Bearer ${s.access}`)).status).toBe(403);
    expect((await refresh(s.cookie)).body.error.code).toBe('ACCOUNT_SUSPENDED');
  });
});

describe.skipIf(!migrator)('role checks', () => {
  it('requireRole re-reads the role from the database, so a removed role stops working at once', async () => {
    const { requireRole } = await import('../src/middleware/auth.js');
    const trx = await identity.transaction();
    try {
      const seller = await trx('user_roles').where({ role: 'seller', status: 'active' }).first();
      const check = (user) =>
        new Promise((resolve) => requireRole({ identity: trx }, 'seller')({ user }, {}, (err) => resolve(err?.status ?? 200)));
      expect(await check({ userId: seller.user_id, role: 'seller' })).toBe(200);
      expect(await check({ userId: seller.user_id, role: 'customer' })).toBe(403); // token role must match
      await trx('user_roles').where({ user_id: seller.user_id, role: 'seller' }).update({ status: 'suspended', status_reason: 'Test (demo)' });
      expect(await check({ userId: seller.user_id, role: 'seller' })).toBe(403); // old token, role suspended
      await trx('user_roles').where({ user_id: seller.user_id, role: 'seller' }).del();
      expect(await check({ userId: seller.user_id, role: 'seller' })).toBe(403); // and removed
    } finally {
      await trx.rollback();
    }
  });
});
