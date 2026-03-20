// Staff sign-in with TOTP (doc 16.3): Google, then a short single-use challenge, then the
// code; lockout, recovery codes, sessions capped at 8 hours, step-up, enrolment links, and
// for admin routes 404 on the public host, 403 for other roles, 401 MFA_REQUIRED without a
// fresh code. Google is a fake verifier; everything runs in rolled-back transactions.
import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHarness, beginTest, request, ADMIN, STEP, cookieFrom, googleToken, totpNow } from './helpers/app.js';
import { signAccessToken, verifyAccessToken } from '../src/utils/tokens.js';
import { encryptSecret, newTotpSecret } from '../src/utils/mfa.js';
import { issueEnrolmentLink } from '../src/controllers/adminAuth.js';

const h = await openHarness();
if (h.skip) console.warn(`admin sign-in tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

const DEVICE = 'device-admin-0001';
const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe.skipIf(h.skip)('staff sign-in', () => {
  let t;
  beforeEach(async () => {
    t = await beginTest(h);
  });
  afterEach(() => t.end());

  /** Staff with Google linked and an authenticator secret. */
  async function makeStaff({ enrolled = true, role = 'admin' } = {}) {
    const u = await t.makeUser({ roles: [role], password: null, mfa: enrolled, name: `Test ${role} (demo)` });
    const sub = `staff-sub-${h.uniq()}`;
    await t.trx.identity('users').where({ id: u.id }).update({ google_sub: sub });
    return { ...u, sub, google: googleToken({ sub, email: u.email }) };
  }
  const challenge = async (a, deviceId = DEVICE) => (await request(t.app).post('/api/v1/admin/auth/google').set(ADMIN).send({ credential: a.google, deviceId }).expect(200)).body.challenge;
  const signIn = async (a, at = Date.now() - STEP, deviceId = DEVICE) => request(t.app).post('/api/v1/admin/auth/mfa').set(ADMIN).send({ challenge: await challenge(a, deviceId), code: totpNow(a.secret, at) });

  describe('the Google step', () => {
    it('gives enrolled staff only a challenge that no admin route accepts', async () => {
      const a = await makeStaff();
      const res = await request(t.app).post('/api/v1/admin/auth/google').set(ADMIN).send({ credential: a.google, deviceId: DEVICE }).expect(200);
      expect(res.body).toMatchObject({ mfaPending: true, challenge: expect.any(String), user: { role: 'admin' } });
      expect(res.body).not.toHaveProperty('accessToken');
      expect(cookieFrom(res, 'sh_admin_refresh')).toBeUndefined();
      await request(t.app).get('/api/v1/admin/verification/seller').set(ADMIN).set(auth(res.body.challenge)).expect(401);
    });

    it('refuses a Google account that is not staff, and staff without an authenticator', async () => {
      const notStaff = googleToken({ sub: `cust-${h.uniq()}`, email: `cust-${h.uniq()}@example.test` });
      expect((await request(t.app).post('/api/v1/admin/auth/google').set(ADMIN).send({ credential: notStaff, deviceId: DEVICE }).expect(403)).body.error.code).toBe('NOT_AN_ADMIN');
      const customer = await t.makeUser({ roles: ['customer', 'seller'] });
      const asCustomer = googleToken({ sub: `c-${h.uniq()}`, email: customer.email });
      expect((await request(t.app).post('/api/v1/admin/auth/google').set(ADMIN).send({ credential: asCustomer, deviceId: DEVICE }).expect(403)).body.error.code).toBe('NOT_AN_ADMIN');
      const a = await makeStaff({ enrolled: false });
      expect((await request(t.app).post('/api/v1/admin/auth/google').set(ADMIN).send({ credential: a.google, deviceId: DEVICE }).expect(403)).body.error.code).toBe('MFA_NOT_ENROLLED');
    });

    it('links Google to staff made by create-admin through the verified email', async () => {
      const u = await t.makeUser({ roles: ['admin'], password: null, mfa: true });
      await request(t.app).post('/api/v1/admin/auth/google').set(ADMIN).send({ credential: googleToken({ sub: 'fresh-sub', email: u.email }), deviceId: DEVICE }).expect(200);
      expect((await t.trx.identity('users').where({ id: u.id }).first()).google_sub).toBe('fresh-sub');
    });

    it('does not exist on the public host', async () => {
      const a = await makeStaff();
      await request(t.app).post('/api/v1/admin/auth/google').send({ credential: a.google, deviceId: DEVICE }).expect(404);
    });

    it('a reviewer signs in as a reviewer', async () => {
      const r = await makeStaff({ role: 'reviewer' });
      const res = await signIn(r);
      expect(res.status).toBe(200);
      expect(verifyAccessToken(h.env, res.body.accessToken).role).toBe('reviewer');
    });
  });

  describe('the code step', () => {
    it('a right code gives a 10 minute staff token with amr and mfa_at, and an 8 hour httpOnly cookie', async () => {
      const a = await makeStaff();
      const res = await signIn(a);
      expect(res.status).toBe(200);
      const claims = verifyAccessToken(h.env, res.body.accessToken);
      expect(claims).toMatchObject({ userId: a.id, role: 'admin', amr: ['google', 'totp'] });
      expect(Date.now() - claims.mfaAt).toBeLessThan(5000);
      const cookie = cookieFrom(res, 'sh_admin_refresh');
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\/api\/v1\/admin\/auth/);
      expect(Number(/Max-Age=(\d+)/.exec(cookie)[1])).toBeLessThanOrEqual(8 * 3600);
      const exp = JSON.parse(Buffer.from(res.body.accessToken.split('.')[1], 'base64url').toString()).exp;
      expect(exp - Date.now() / 1000).toBeLessThanOrEqual(10 * 60);
      await request(t.app).get('/api/v1/admin/verification/rider').set(ADMIN).set(auth(res.body.accessToken)).expect(200);
    });

    it('a code works only once, and a challenge only once', async () => {
      const a = await makeStaff();
      const at = Date.now() - STEP;
      expect((await signIn(a, at)).status).toBe(200);
      const again = await signIn(a, at);
      expect(again.status).toBe(401);
      expect(again.body.error.code).toBe('MFA_INVALID');
      const c = await challenge(a);
      await request(t.app).post('/api/v1/admin/auth/mfa').set(ADMIN).send({ challenge: c, code: totpNow(a.secret, Date.now() + STEP) }).expect(200);
      await request(t.app).post('/api/v1/admin/auth/mfa').set(ADMIN).send({ challenge: c, code: totpNow(a.secret, Date.now() + STEP) }).expect(401);
    });

    it('five wrong codes lock the account for 15 minutes, even against the right code, and raise an alert', async () => {
      const a = await makeStaff();
      for (let i = 1; i <= 4; i++) {
        const res = await request(t.app).post('/api/v1/admin/auth/mfa').set(ADMIN).send({ challenge: await challenge(a), code: '000000' }).expect(401);
        expect(res.body.error.message).toContain(`${5 - i} tr`);
      }
      const fifth = await request(t.app).post('/api/v1/admin/auth/mfa').set(ADMIN).send({ challenge: await challenge(a), code: '000000' }).expect(423);
      expect(fifth.body.error.code).toBe('MFA_LOCKED');
      const right = await request(t.app).post('/api/v1/admin/auth/mfa').set(ADMIN).send({ challenge: await challenge(a), code: totpNow(a.secret) }).expect(423);
      expect(right.body.error.message).toMatch(/1[45] minutes/);
      expect(await t.trx.identity('audit_log').where({ actor_id: a.id, action: 'admin.mfa.locked' }).first()).toBeTruthy();
      expect(await t.trx.identity('outbox').where({ type: 'admin.alert' }).orderBy('id', 'desc').first()).toBeTruthy();
    });

    it('a recovery code works once and alerts the other admins', async () => {
      const a = await makeStaff();
      await t.trx.identity('recovery_codes').insert({ user_id: a.id, code_hash: createHash('sha256').update('k7qm-2xpd').digest('hex'), created_at: new Date() });
      const ok = await request(t.app).post('/api/v1/admin/auth/mfa').set(ADMIN).send({ challenge: await challenge(a), code: 'K7QM-2XPD' }).expect(200);
      expect(ok.body.amr).toEqual(['google', 'recovery']);
      await request(t.app).post('/api/v1/admin/auth/mfa').set(ADMIN).send({ challenge: await challenge(a), code: 'k7qm-2xpd' }).expect(401);
      const alert = await t.trx.identity('outbox').where({ type: 'admin.alert' }).orderBy('id', 'desc').first();
      expect(typeof alert.payload === 'string' ? JSON.parse(alert.payload) : alert.payload).toMatchObject({ type: 'recovery_code_used', userId: a.id, left: 0 });
    });

    it('refuses a forged challenge, an access token as a challenge, and a public-portal challenge', async () => {
      const a = await makeStaff();
      await request(t.app).post('/api/v1/admin/auth/mfa').set(ADMIN).send({ challenge: 'x'.repeat(43), code: totpNow(a.secret) }).expect(401);
      const access = signAccessToken(h.env, { id: a.id }, { role: 'admin' });
      await request(t.app).post('/api/v1/admin/auth/mfa').set(ADMIN).send({ challenge: access, code: totpNow(a.secret) }).expect(400);
      // a customer's sign-in challenge never opens the admin console
      const c = await t.makeUser({ roles: ['customer'], mfa: true });
      const first = await request(t.app).post('/api/v1/auth/signin').send({ portal: 'customer', identifier: c.email, password: c.password, deviceId: DEVICE }).expect(200);
      await request(t.app).post('/api/v1/admin/auth/mfa').set(ADMIN).send({ challenge: first.body.challenge, code: totpNow(c.secret) }).expect(401);
    });
  });

  describe('sessions', () => {
    it('refresh keeps the original second-factor time and the 8 hour end', async () => {
      const a = await makeStaff();
      const first = await signIn(a);
      const mfaAt = verifyAccessToken(h.env, first.body.accessToken).mfaAt;
      await t.trx.identity('refresh_tokens').where({ user_id: a.id, kind: 'admin' }).update({ mfa_at: new Date(mfaAt - 20 * 60_000) });
      const res = await request(t.app).post('/api/v1/admin/auth/refresh').set(ADMIN).set('Cookie', cookieFrom(first, 'sh_admin_refresh').split(';')[0]).expect(200);
      expect(verifyAccessToken(h.env, res.body.accessToken).mfaAt).toBe(Math.floor((mfaAt - 20 * 60_000) / 1000) * 1000);
      // the older second factor no longer passes the 5 minute rule for a decision
      const late = await request(t.app).post('/api/v1/admin/verification/item/rider-1/request-changes').set(ADMIN).set(auth(res.body.accessToken)).send({ reason: 'Need a clearer licence photo (demo)' }).expect(401);
      expect(late.body.error.code).toBe('MFA_REQUIRED');
    });

    it('step-up with a fresh code allows the decision', async () => {
      const a = await makeStaff();
      const first = await signIn(a, Date.now() - STEP);
      await t.trx.identity('refresh_tokens').where({ user_id: a.id, kind: 'admin' }).update({ mfa_at: new Date(Date.now() - 20 * 60_000) });
      const stale = signAccessToken(h.env, { id: a.id }, { role: 'admin', mfaAt: Date.now() - 20 * 60_000 });
      const up = await request(t.app).post('/api/v1/admin/auth/step-up').set(ADMIN).set(auth(stale)).set('Cookie', cookieFrom(first, 'sh_admin_refresh').split(';')[0]).send({ code: totpNow(a.secret) }).expect(200);
      await request(t.app).post('/api/v1/admin/verification/item/rider-1/request-changes').set(ADMIN).set(auth(up.body.accessToken)).send({ reason: 'Need a clearer licence photo (demo)' }).expect(200);
      const live = await t.trx.identity('refresh_tokens').where({ user_id: a.id, kind: 'admin' }).whereNull('used_at').first();
      expect(Date.now() - new Date(live.mfa_at).getTime()).toBeLessThan(5000);
    });

    it('admin and public cookies never work for each other', async () => {
      const a = await makeStaff();
      const signed = await signIn(a);
      const adminCookie = cookieFrom(signed, 'sh_admin_refresh').split(';')[0].replace('sh_admin_refresh=', '');
      await request(t.app).post('/api/v1/auth/refresh').set('X-SnackHub-Client', 'web').set('Cookie', `sh_refresh=${adminCookie}`).expect(401);
    });

    it('sign out everywhere ends every admin session', async () => {
      const a = await makeStaff();
      const one = await signIn(a, Date.now() - STEP);
      const two = await signIn(a, Date.now(), 'device-admin-0002');
      await request(t.app).post('/api/v1/admin/auth/logout-all').set(ADMIN).set(auth(two.body.accessToken)).expect(204);
      await request(t.app).post('/api/v1/admin/auth/refresh').set(ADMIN).set('Cookie', cookieFrom(one, 'sh_admin_refresh').split(';')[0]).expect(401);
      await request(t.app).post('/api/v1/admin/auth/refresh').set(ADMIN).set('Cookie', cookieFrom(two, 'sh_admin_refresh').split(';')[0]).expect(401);
    });

    it('staff whose role is removed or suspended cannot refresh', async () => {
      const a = await makeStaff();
      const signed = await signIn(a);
      await t.trx.identity('user_roles').where({ user_id: a.id, role: 'admin' }).update({ status: 'suspended', status_reason: 'Left the team (demo)' });
      await request(t.app).post('/api/v1/admin/auth/refresh').set(ADMIN).set('Cookie', cookieFrom(signed, 'sh_admin_refresh').split(';')[0]).expect(403);
    });
  });

  describe('enrolment', () => {
    it('shows the QR once per link, activates on the first right code and returns ten recovery codes', async () => {
      const a = await makeStaff({ enrolled: false });
      const token = new URL(await issueEnrolmentLink(h.env, t.trx.identity, a.id)).searchParams.get('token');
      const info = await request(t.app).post('/api/v1/admin/auth/enrol/info').set(ADMIN).send({ token }).expect(200);
      expect(info.body.qr).toMatch(/^data:image\/png;base64,/);
      expect(info.body.otpauthUrl).toContain('otpauth://totp/SnackHub%20admin');
      await request(t.app).post('/api/v1/admin/auth/enrol').set(ADMIN).send({ token, code: '123456' }).expect(422);
      const done = await request(t.app).post('/api/v1/admin/auth/enrol').set(ADMIN).send({ token, code: totpNow(info.body.secret) }).expect(201);
      expect(done.body.recoveryCodes).toHaveLength(10);
      expect(new Set(done.body.recoveryCodes).size).toBe(10);
      const stored = await t.trx.identity('recovery_codes').where({ user_id: a.id }).pluck('code_hash');
      expect(stored).toHaveLength(10);
      expect(stored).not.toContain(done.body.recoveryCodes[0]);
      await request(t.app).post('/api/v1/admin/auth/enrol/info').set(ADMIN).send({ token }).expect(410);
      await request(t.app).post('/api/v1/admin/auth/mfa').set(ADMIN).send({ challenge: await challenge(a), code: totpNow(info.body.secret, Date.now() + STEP) }).expect(200);
    });

    it('an expired link stops working', async () => {
      const a = await makeStaff({ enrolled: false });
      const token = new URL(await issueEnrolmentLink(h.env, t.trx.identity, a.id)).searchParams.get('token');
      await t.trx.identity('admin_enrolments').where({ user_id: a.id }).update({ created_at: new Date(Date.now() - 20 * 60_000), expires_at: new Date(Date.now() - 1000) });
      await request(t.app).post('/api/v1/admin/auth/enrol/info').set(ADMIN).send({ token }).expect(410);
    });
  });

  // doc 16.3 "Test it": for every admin route, 404 on the public host, 403 for customer,
  // seller and rider, 401 MFA_REQUIRED without a fresh second factor, and success with one
  const ROUTES = [
    ['get', '/api/v1/admin/verification/rider', null, 8 * 60],
    ['get', '/api/v1/admin/verification/item/rider-1', null, 8 * 60],
    ['post', '/api/v1/admin/verification/item/rider-1/check', { check: 'background', value: true }, 8 * 60],
    ['post', '/api/v1/admin/verification/item/rider-1/request-changes', { reason: 'Need a clearer photo (demo)' }, 5],
    ['get', '/api/v1/admin/expiring', null, 8 * 60],
    ['get', '/api/v1/admin/requirements/rider', null, 8 * 60],
    ['get', '/api/v1/admin/users', null, 8 * 60],
    ['get', '/api/v1/admin/audit', null, 8 * 60],
  ];
  describe('every admin route', () => {
    it.each(ROUTES)('%s %s', async (method, path, body, freshMin) => {
      const a = await makeStaff();
      const send = (headers, token) => {
        let r = request(t.app)[method](path).set(headers);
        if (token) r = r.set(auth(token));
        return body ? r.send(body) : r;
      };
      const good = signAccessToken(h.env, { id: a.id }, { role: 'admin', mfaAt: Date.now() - 60_000 });
      await send({}, good).expect(404);
      for (const [id, role] of [[1, 'customer'], [1001, 'seller'], [2001, 'rider']]) {
        await send(ADMIN, signAccessToken(h.env, { id }, { role, mfaAt: Date.now() })).expect(403);
      }
      const noMfa = await send(ADMIN, signAccessToken(h.env, { id: a.id }, { role: 'admin' }));
      expect(noMfa.status).toBe(401);
      expect(noMfa.body.error.code).toBe('MFA_REQUIRED');
      const stale = await send(ADMIN, signAccessToken(h.env, { id: a.id }, { role: 'admin', mfaAt: Date.now() - (freshMin + 1) * 60_000 }));
      expect(stale.body.error?.code).toBe('MFA_REQUIRED');
      await send(ADMIN, good).expect(200);
    });
  });

  it('an enrolment secret is stored encrypted', async () => {
    const secret = newTotpSecret();
    expect(encryptSecret(h.env, secret)).not.toContain(secret);
  });
});
