// Admin sign-in with TOTP (doc 16.3): Google, then a half-session, then the code; lockout,
// recovery codes, sessions capped at 8 hours, step-up, enrolment links, and for every admin
// route 404 on the public host, 403 for other roles, 401 MFA_REQUIRED without a fresh code.
// Google is a fake verifier; everything runs in rolled-back transactions.
import { afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { connect } from './helpers/db.js';
import { moduleDb } from '../src/db/connection.js';
import { loadEnv } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { signAccessToken, verifyAccessToken, signHalfToken } from '../src/utils/tokens.js';
import { encryptSecret, newTotpSecret, totpNow } from '../src/utils/mfa.js';
import { issueEnrolmentLink } from '../src/controllers/adminAuth.js';

const { db: migrator, env: dbEnv, reason } = await connect();
if (!migrator) console.warn(`admin sign-in tests skipped: ${reason}`);
const MODULES = ['identity', 'catalog', 'dispatch'];
const pools = migrator ? Object.fromEntries(MODULES.map((m) => [m, moduleDb(dbEnv, m)])) : {};
afterAll(async () => {
  await Promise.all([migrator, ...Object.values(pools)].filter(Boolean).map((d) => d.destroy()));
});

const env = migrator
  ? loadEnv({
      ...dbEnv,
      DB_PORT: String(dbEnv.DB_PORT),
      CORS_ORIGINS: 'http://localhost:5173',
      JWT_SECRET: 'test-only-secret-that-is-at-least-32-characters',
      MFA_KEY: 'dGVzdC1vbmx5LW1mYS1rZXktMzItYnl0ZXMtbG9uZyE',
      GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
      COOKIE_SECURE: 'false',
    })
  : null;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const googleToken = (claims) => `eyJhbGciOiJSUzI1NiJ9.${b64(claims)}.${'s'.repeat(90)}`;
const fakeVerify = async (credential) => {
  const c = JSON.parse(Buffer.from(credential.split('.')[1], 'base64url').toString());
  return { sub: c.sub, email: c.email, emailVerified: c.email_verified !== false, name: 'Test (demo)' };
};
const ADMIN = { 'X-SnackHub-Host': 'admin', 'X-SnackHub-Client': 'web' };
const DEVICE = 'device-admin-0001';
const STEP = 30_000;
const cookieFrom = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith('sh_admin_refresh='));
const bearer = (t) => `Bearer ${t}`;

describe.skipIf(!migrator)('admin sign-in', () => {
  let trx;
  let app;
  let n = 0;

  beforeEach(async () => {
    trx = Object.fromEntries(await Promise.all(MODULES.map(async (m) => [m, await pools[m].transaction()])));
    app = createApp({ env, logger: pino({ level: 'silent' }), dbs: trx, verifyGoogle: fakeVerify });
  });
  afterEach(async () => {
    await Promise.all(Object.values(trx).map((t) => t.rollback()));
  });

  /** An admin with Google linked and an authenticator secret; returns what the tests need. */
  async function makeAdmin({ enrolled = true } = {}) {
    n++;
    const email = `admin-${Date.now()}-${n}@example.test`;
    const sub = `admin-sub-${Date.now()}-${n}`;
    const [id] = await trx.identity('users').insert({ email, name: 'Test admin (demo)', role: 'admin', google_sub: sub });
    const secret = newTotpSecret();
    if (enrolled) await trx.identity('admin_mfa').insert({ user_id: id, secret_enc: encryptSecret(env, secret), enrolled_at: new Date() });
    return { id, email, sub, secret, google: googleToken({ sub, email }) };
  }
  const half = async (a) => (await request(app).post('/api/v1/admin/auth/google').set(ADMIN).send({ credential: a.google, deviceId: DEVICE }).expect(200)).body.halfToken;
  const signIn = async (a, at = Date.now() - STEP) => request(app).post('/api/v1/admin/auth/mfa').set(ADMIN).send({ halfToken: await half(a), code: totpNow(a.secret, at) });

  describe('the Google step', () => {
    it('gives an enrolled admin only a half-session that no admin route accepts', async () => {
      const a = await makeAdmin();
      const res = await request(app).post('/api/v1/admin/auth/google').set(ADMIN).send({ credential: a.google, deviceId: DEVICE }).expect(200);
      expect(res.body).toMatchObject({ mfaPending: true, halfToken: expect.any(String) });
      expect(res.body).not.toHaveProperty('accessToken');
      expect(cookieFrom(res)).toBeUndefined();
      await request(app).get('/api/v1/admin/applications').set(ADMIN).set('Authorization', bearer(res.body.halfToken)).expect(401);
    });

    it('refuses a Google account that is not an admin, and an admin without an authenticator', async () => {
      const notAdmin = googleToken({ sub: `cust-${Date.now()}`, email: `cust-${Date.now()}@example.test` });
      const res = await request(app).post('/api/v1/admin/auth/google').set(ADMIN).send({ credential: notAdmin, deviceId: DEVICE }).expect(403);
      expect(res.body.error.code).toBe('NOT_AN_ADMIN');
      const a = await makeAdmin({ enrolled: false });
      const res2 = await request(app).post('/api/v1/admin/auth/google').set(ADMIN).send({ credential: a.google, deviceId: DEVICE }).expect(403);
      expect(res2.body.error.code).toBe('MFA_NOT_ENROLLED');
    });

    it('links Google to an admin made by create-admin through the verified email', async () => {
      const email = `fresh-admin-${Date.now()}@example.test`;
      const [id] = await trx.identity('users').insert({ email, name: 'Fresh admin (demo)', role: 'admin' });
      await trx.identity('admin_mfa').insert({ user_id: id, secret_enc: encryptSecret(env, newTotpSecret()), enrolled_at: new Date() });
      await request(app).post('/api/v1/admin/auth/google').set(ADMIN).send({ credential: googleToken({ sub: 'fresh-sub', email }), deviceId: DEVICE }).expect(200);
      expect((await trx.identity('users').where({ id }).first()).google_sub).toBe('fresh-sub');
    });

    it('does not exist on the public host', async () => {
      const a = await makeAdmin();
      await request(app).post('/api/v1/admin/auth/google').send({ credential: a.google, deviceId: DEVICE }).expect(404);
    });
  });

  describe('the code step', () => {
    it('a right code gives a 10 minute admin token with amr and mfa_at, and an 8 hour httpOnly cookie', async () => {
      const a = await makeAdmin();
      const res = await signIn(a);
      expect(res.status).toBe(200);
      const claims = verifyAccessToken(env, res.body.accessToken);
      expect(claims).toMatchObject({ userId: a.id, role: 'admin' });
      expect(Date.now() - claims.mfaAt).toBeLessThan(5000);
      expect(res.body.amr).toEqual(['google', 'totp']);
      const cookie = cookieFrom(res);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\/api\/v1\/admin\/auth/);
      expect(Number(/Max-Age=(\d+)/.exec(cookie)[1])).toBeLessThanOrEqual(8 * 3600);
      const exp = JSON.parse(Buffer.from(res.body.accessToken.split('.')[1], 'base64url').toString()).exp;
      expect(exp - Date.now() / 1000).toBeLessThanOrEqual(10 * 60);
      await request(app).get('/api/v1/admin/applications').set(ADMIN).set('Authorization', bearer(res.body.accessToken)).expect(200);
    });

    it('a code works only once', async () => {
      const a = await makeAdmin();
      const at = Date.now() - STEP;
      expect((await signIn(a, at)).status).toBe(200);
      const again = await signIn(a, at);
      expect(again.status).toBe(401);
      expect(again.body.error.code).toBe('MFA_INVALID');
    });

    it('five wrong codes lock the account for 15 minutes, even against the right code, and raise an alert', async () => {
      const a = await makeAdmin();
      const token = await half(a);
      for (let i = 1; i <= 4; i++) {
        const res = await request(app).post('/api/v1/admin/auth/mfa').set(ADMIN).send({ halfToken: token, code: '000000' }).expect(401);
        expect(res.body.error.message).toContain(`${5 - i} tr`);
      }
      const fifth = await request(app).post('/api/v1/admin/auth/mfa').set(ADMIN).send({ halfToken: token, code: '000000' }).expect(423);
      expect(fifth.body.error.code).toBe('MFA_LOCKED');
      const right = await request(app).post('/api/v1/admin/auth/mfa').set(ADMIN).send({ halfToken: token, code: totpNow(a.secret) }).expect(423);
      expect(right.body.error.message).toMatch(/1[45] minutes/);
      expect(await trx.identity('audit_log').where({ actor_id: a.id, action: 'admin.mfa.locked' }).first()).toBeTruthy();
      expect(await trx.identity('outbox').where({ type: 'admin.alert' }).orderBy('id', 'desc').first()).toBeTruthy();
    });

    it('a recovery code works once and alerts the other admins', async () => {
      const a = await makeAdmin();
      const { createHash } = await import('node:crypto');
      await trx.identity('admin_recovery_codes').insert({ user_id: a.id, code_hash: createHash('sha256').update('k7qm-2xpd').digest('hex'), created_at: new Date() });
      const ok = await request(app).post('/api/v1/admin/auth/mfa').set(ADMIN).send({ halfToken: await half(a), code: 'K7QM-2XPD' }).expect(200);
      expect(ok.body.amr).toEqual(['google', 'recovery']);
      await request(app).post('/api/v1/admin/auth/mfa').set(ADMIN).send({ halfToken: await half(a), code: 'k7qm-2xpd' }).expect(401);
      const alert = await trx.identity('outbox').where({ type: 'admin.alert' }).orderBy('id', 'desc').first();
      expect(typeof alert.payload === 'string' ? JSON.parse(alert.payload) : alert.payload).toMatchObject({ type: 'recovery_code_used', userId: a.id, left: 0 });
    });

    it('refuses an expired or forged half-session', async () => {
      const a = await makeAdmin();
      const forged = signHalfToken({ ...env, JWT_SECRET: 'another-secret-that-is-at-least-32-characters' }, a.id, DEVICE);
      await request(app).post('/api/v1/admin/auth/mfa').set(ADMIN).send({ halfToken: forged, code: totpNow(a.secret) }).expect(401);
      // a normal access token is not a half-session either
      const access = signAccessToken(env, { id: a.id, role: 'admin' });
      await request(app).post('/api/v1/admin/auth/mfa').set(ADMIN).send({ halfToken: access, code: totpNow(a.secret) }).expect(401);
    });
  });

  describe('sessions', () => {
    it('refresh keeps the original second-factor time and the 8 hour end', async () => {
      const a = await makeAdmin();
      const first = await signIn(a);
      const mfaAt = verifyAccessToken(env, first.body.accessToken).mfaAt;
      await trx.identity('refresh_tokens').where({ user_id: a.id, kind: 'admin' }).update({ mfa_at: new Date(mfaAt - 20 * 60_000) });
      const res = await request(app).post('/api/v1/admin/auth/refresh').set(ADMIN).set('Cookie', cookieFrom(first).split(';')[0]).expect(200);
      expect(verifyAccessToken(env, res.body.accessToken).mfaAt).toBe(Math.floor((mfaAt - 20 * 60_000) / 1000) * 1000);
      // the older second factor no longer passes the 5 minute rule for a decision
      const list = await request(app).get('/api/v1/admin/applications').set(ADMIN).set('Authorization', bearer(res.body.accessToken)).expect(200);
      const late = await request(app).post(`/api/v1/admin/applications/${list.body[0].id}/needs-info`).set(ADMIN).set('Authorization', bearer(res.body.accessToken)).send({ reason: 'Need a clearer licence photo (demo)' }).expect(401);
      expect(late.body.error.code).toBe('MFA_REQUIRED');
    });

    it('step-up with a fresh code allows the decision', async () => {
      const a = await makeAdmin();
      const first = await signIn(a, Date.now() - STEP);
      await trx.identity('refresh_tokens').where({ user_id: a.id, kind: 'admin' }).update({ mfa_at: new Date(Date.now() - 20 * 60_000) });
      const stale = signAccessToken(env, { id: a.id, role: 'admin' }, { mfaAt: Date.now() - 20 * 60_000 });
      const up = await request(app).post('/api/v1/admin/auth/step-up').set(ADMIN).set('Authorization', bearer(stale)).set('Cookie', cookieFrom(first).split(';')[0]).send({ code: totpNow(a.secret) }).expect(200);
      const list = await request(app).get('/api/v1/admin/applications').set(ADMIN).set('Authorization', bearer(up.body.accessToken)).expect(200);
      await request(app).post(`/api/v1/admin/applications/${list.body[0].id}/needs-info`).set(ADMIN).set('Authorization', bearer(up.body.accessToken)).send({ reason: 'Need a clearer licence photo (demo)' }).expect(200);
      // the stored session got the fresh time too
      const live = await trx.identity('refresh_tokens').where({ user_id: a.id, kind: 'admin' }).whereNull('used_at').first();
      expect(Date.now() - new Date(live.mfa_at).getTime()).toBeLessThan(5000);
    });

    it('admin and customer cookies never work for each other', async () => {
      const a = await makeAdmin();
      const signed = await signIn(a);
      const adminCookie = cookieFrom(signed).split(';')[0].replace('sh_admin_refresh=', '');
      await request(app).post('/api/v1/auth/refresh').set('X-SnackHub-Client', 'web').set('Cookie', `sh_refresh=${adminCookie}`).expect(401);
    });

    it('sign out everywhere ends every admin session', async () => {
      const a = await makeAdmin();
      const one = await signIn(a, Date.now() - STEP);
      const two = await request(app).post('/api/v1/admin/auth/mfa').set(ADMIN).send({ halfToken: signHalfToken(env, a.id, 'device-admin-0002'), code: totpNow(a.secret) }).expect(200);
      await request(app).post('/api/v1/admin/auth/logout-all').set(ADMIN).set('Authorization', bearer(two.body.accessToken)).expect(204);
      await request(app).post('/api/v1/admin/auth/refresh').set(ADMIN).set('Cookie', cookieFrom(one).split(';')[0]).expect(401);
      await request(app).post('/api/v1/admin/auth/refresh').set(ADMIN).set('Cookie', cookieFrom(two).split(';')[0]).expect(401);
    });

    it('a demoted admin cannot refresh', async () => {
      const a = await makeAdmin();
      const signed = await signIn(a);
      await trx.identity('users').where({ id: a.id }).update({ role: 'customer' });
      await request(app).post('/api/v1/admin/auth/refresh').set(ADMIN).set('Cookie', cookieFrom(signed).split(';')[0]).expect(403);
    });
  });

  describe('enrolment', () => {
    it('shows the QR once per link, activates on the first right code and returns ten recovery codes', async () => {
      const a = await makeAdmin({ enrolled: false });
      const link = await issueEnrolmentLink(env, trx.identity, a.id);
      const token = new URL(link).searchParams.get('token');
      const info = await request(app).post('/api/v1/admin/auth/enrol/info').set(ADMIN).send({ token }).expect(200);
      expect(info.body.qr).toMatch(/^data:image\/png;base64,/);
      expect(info.body.otpauthUrl).toContain('otpauth://totp/');
      await request(app).post('/api/v1/admin/auth/enrol').set(ADMIN).send({ token, code: '123456' }).expect(422);
      const done = await request(app).post('/api/v1/admin/auth/enrol').set(ADMIN).send({ token, code: totpNow(info.body.secret) }).expect(201);
      expect(done.body.recoveryCodes).toHaveLength(10);
      expect(new Set(done.body.recoveryCodes).size).toBe(10);
      const stored = await trx.identity('admin_recovery_codes').where({ user_id: a.id }).pluck('code_hash');
      expect(stored).toHaveLength(10);
      expect(stored).not.toContain(done.body.recoveryCodes[0]);
      await request(app).post('/api/v1/admin/auth/enrol/info').set(ADMIN).send({ token }).expect(410);
      // and now the admin can sign in with the app
      await request(app).post('/api/v1/admin/auth/mfa').set(ADMIN).send({ halfToken: await half(a), code: totpNow(info.body.secret, Date.now() + STEP) }).expect(200);
    });

    it('an expired link stops working', async () => {
      const a = await makeAdmin({ enrolled: false });
      const token = new URL(await issueEnrolmentLink(env, trx.identity, a.id)).searchParams.get('token');
      await trx.identity('admin_enrolments').where({ user_id: a.id }).update({ created_at: new Date(Date.now() - 20 * 60_000), expires_at: new Date(Date.now() - 1000) });
      await request(app).post('/api/v1/admin/auth/enrol/info').set(ADMIN).send({ token }).expect(410);
    });
  });

  // doc 16.3 "Test it": for every /admin route, 404 on the public host, 403 for customer,
  // seller and rider, 401 MFA_REQUIRED without a fresh second factor, and success with one
  const ROUTES = [
    ['get', '/api/v1/admin/applications', null, 8 * 60],
    ['post', '/api/v1/admin/applications/rider-1/check', { check: 'identity', value: true }, 8 * 60],
    ['post', '/api/v1/admin/applications/rider-1/needs-info', { reason: 'Need a clearer photo (demo)' }, 5],
  ];
  describe('every admin route', () => {
    it.each(ROUTES)('%s %s', async (method, path, body, freshMin) => {
      const a = await makeAdmin();
      const send = (headers, auth) => {
        let r = request(app)[method](path).set(headers);
        if (auth) r = r.set('Authorization', auth);
        return body ? r.send(body) : r;
      };
      const good = bearer(signAccessToken(env, { id: a.id, role: 'admin' }, { mfaAt: Date.now() - 60_000 }));
      await send({}, good).expect(404);
      for (const [id, role] of [[1, 'customer'], [1001, 'seller'], [2001, 'rider']]) {
        await send(ADMIN, bearer(signAccessToken(env, { id, role }, { mfaAt: Date.now() }))).expect(403);
      }
      const noMfa = await send(ADMIN, bearer(signAccessToken(env, { id: a.id, role: 'admin' })));
      expect(noMfa.status).toBe(401);
      expect(noMfa.body.error.code).toBe('MFA_REQUIRED');
      const stale = await send(ADMIN, bearer(signAccessToken(env, { id: a.id, role: 'admin' }, { mfaAt: Date.now() - (freshMin + 1) * 60_000 })));
      expect(stale.body.error?.code).toBe('MFA_REQUIRED');
      await send(ADMIN, good).expect(200);
    });
  });
});
