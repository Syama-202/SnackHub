// Two-step sign-in for the public portals: sellers must enrol before any session; customers
// and riders may. Challenges are short, single-use and bound to a device; a code works once;
// five wrong codes lock; recovery codes work once; a client flag can never skip the step.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHarness, beginTest, request, PASSWORD, STEP, bearer, cookieFrom, totpNow } from './helpers/app.js';
import { verifyAccessToken } from '../src/utils/tokens.js';

const h = await openHarness();
if (h.skip) console.warn(`MFA tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

const device = () => `dev-${h.uniq()}`;

describe.skipIf(h.skip)('two-step sign-in', () => {
  let t;
  beforeEach(async () => {
    t = await beginTest(h);
  });
  afterEach(() => t.end());

  const start = (u, portal, deviceId = device()) => request(t.app).post('/api/v1/auth/signin').send({ portal, identifier: u.email, password: u.password, deviceId });

  describe('enrolment', () => {
    it('a seller without an authenticator gets only an enrolment step, then a session with recovery codes', async () => {
      const u = await t.makeUser({ roles: ['seller'] });
      const deviceId = device();
      const first = await start(u, 'seller', deviceId).expect(200);
      expect(first.body).toMatchObject({ mfa: 'enrol', challenge: expect.any(String) });
      expect(first.body).not.toHaveProperty('accessToken');
      expect(cookieFrom(first)).toBeUndefined();
      // the challenge is not a session
      await request(t.app).get('/api/v1/seller/onboarding').set(bearer(first.body.challenge)).expect(401);

      const setup = await request(t.app).post('/api/v1/auth/mfa/enrol/start').send({ challenge: first.body.challenge, deviceId }).expect(200);
      expect(setup.body).toMatchObject({ secret: expect.stringMatching(/^[A-Z2-7]+$/), otpauthUrl: expect.stringContaining('otpauth://totp/'), qr: expect.stringMatching(/^data:image\/png;base64,/) });
      expect(setup.headers['cache-control']).toBe('no-store');
      // nothing changes until the first code from the app matches
      expect(await t.trx.identity('mfa_totp').where({ user_id: u.id }).first()).toBeUndefined();
      expect((await request(t.app).post('/api/v1/auth/mfa/enrol/confirm').send({ challenge: first.body.challenge, deviceId, code: '000000' }).expect(422)).body.error.code).toBe('MFA_INVALID');

      const done = await request(t.app).post('/api/v1/auth/mfa/enrol/confirm').send({ challenge: first.body.challenge, deviceId, code: totpNow(setup.body.secret) }).expect(201);
      expect(done.body.recoveryCodes).toHaveLength(10);
      expect(done.body.user).toMatchObject({ role: 'seller', mfaEnrolled: true });
      const claims = verifyAccessToken(h.env, done.body.accessToken);
      expect(claims.amr).toEqual(['pwd', 'totp']);
      expect(claims.mfaAt).toBeGreaterThan(Date.now() - 60_000);
      expect(cookieFrom(done)).toBeDefined();
      // stored encrypted, codes hashed
      const row = await t.trx.identity('mfa_totp').where({ user_id: u.id }).first();
      expect(row.secret_enc).not.toContain(setup.body.secret);
      const codes = await t.trx.identity('recovery_codes').where({ user_id: u.id }).pluck('code_hash');
      expect(codes.some((c) => done.body.recoveryCodes.includes(c))).toBe(false);
      expect((await t.inbox()).some((m) => /two-step sign-in is on/i.test(m.subject))).toBe(true);
    });

    it('a challenge is bound to its device and works once', async () => {
      const u = await t.makeUser({ roles: ['seller'] });
      const deviceId = device();
      const { body } = await start(u, 'seller', deviceId);
      await request(t.app).post('/api/v1/auth/mfa/enrol/start').send({ challenge: body.challenge, deviceId: device() }).expect(401);
      const setup = await request(t.app).post('/api/v1/auth/mfa/enrol/start').send({ challenge: body.challenge, deviceId }).expect(200);
      await request(t.app).post('/api/v1/auth/mfa/enrol/confirm').send({ challenge: body.challenge, deviceId, code: totpNow(setup.body.secret) }).expect(201);
      await request(t.app).post('/api/v1/auth/mfa/enrol/confirm').send({ challenge: body.challenge, deviceId, code: totpNow(setup.body.secret) }).expect(401);
    });

    it('a customer may sign in without one, and enrol later from the security page', async () => {
      const u = await t.makeUser({ roles: ['customer'] });
      const first = await start(u, 'customer').expect(200);
      expect(first.body.accessToken).toBeDefined();
      const token = first.body.accessToken;
      const setup = await request(t.app).post('/api/v1/auth/security/mfa/start').set(bearer(token)).send({}).expect(200);
      const done = await request(t.app).post('/api/v1/auth/security/mfa/confirm').set(bearer(token)).send({ code: totpNow(setup.body.secret, Date.now() - STEP) }).expect(201);
      expect(done.body.recoveryCodes).toHaveLength(10);
      // now the next sign-in asks for a code
      expect((await start(u, 'customer').expect(200)).body).toMatchObject({ mfa: 'verify', methods: ['totp', 'recovery'] });
    });

    it('a challenge expires after five minutes', async () => {
      const u = await t.makeUser({ roles: ['customer'], mfa: true });
      const deviceId = device();
      const { body } = await start(u, 'customer', deviceId);
      await t.trx.identity('mfa_challenges').where({ user_id: u.id }).update({ created_at: new Date(Date.now() - 10 * 60_000), expires_at: new Date(Date.now() - 60_000) });
      expect((await request(t.app).post('/api/v1/auth/mfa/verify').send({ challenge: body.challenge, deviceId, code: totpNow(u.secret) }).expect(401)).body.error.code).toBe('MFA_SESSION_EXPIRED');
    });
  });

  describe('codes', () => {
    it('a right code gives the session; the same code never works twice', async () => {
      const u = await t.makeUser({ roles: ['rider'], mfa: true });
      const at = Date.now() - STEP;
      const ok = await t.signIn(u, 'rider', { at });
      expect(ok.status).toBe(200);
      expect(verifyAccessToken(h.env, ok.body.accessToken)).toMatchObject({ role: 'rider', amr: ['pwd', 'totp'] });
      const replay = await t.signIn(u, 'rider', { at });
      expect(replay.status).toBe(401);
      expect(replay.body.error.code).toBe('MFA_INVALID');
    });

    it('five wrong codes lock the factor for 15 minutes, even against the right code', async () => {
      const u = await t.makeUser({ roles: ['customer'], mfa: true });
      let last;
      for (let i = 0; i < 5; i++) {
        const deviceId = device();
        const { body } = await start(u, 'customer', deviceId);
        last = await request(t.app).post('/api/v1/auth/mfa/verify').send({ challenge: body.challenge, deviceId, code: '000001' });
      }
      expect(last.status).toBe(423);
      const deviceId = device();
      const { body } = await start(u, 'customer', deviceId);
      expect((await request(t.app).post('/api/v1/auth/mfa/verify').send({ challenge: body.challenge, deviceId, code: totpNow(u.secret) })).status).toBe(423);
    });

    it('a challenge dies after five wrong codes', async () => {
      const u = await t.makeUser({ roles: ['customer'], mfa: true });
      const deviceId = device();
      const { body } = await start(u, 'customer', deviceId);
      for (let i = 0; i < 4; i++) await request(t.app).post('/api/v1/auth/mfa/verify').send({ challenge: body.challenge, deviceId, code: '000002' }).expect(401);
      await t.trx.identity('mfa_totp').where({ user_id: u.id }).update({ failed_count: 0 });
      await request(t.app).post('/api/v1/auth/mfa/verify').send({ challenge: body.challenge, deviceId, code: '000002' }).expect(401);
      await request(t.app).post('/api/v1/auth/mfa/verify').send({ challenge: body.challenge, deviceId, code: totpNow(u.secret) }).expect(401);
    });

    it('a recovery code works once, and the owner is told', async () => {
      const u = await t.makeUser({ roles: ['customer'] });
      const token = (await start(u, 'customer')).body.accessToken;
      const setup = await request(t.app).post('/api/v1/auth/security/mfa/start').set(bearer(token)).send({});
      const { body } = await request(t.app).post('/api/v1/auth/security/mfa/confirm').set(bearer(token)).send({ code: totpNow(setup.body.secret, Date.now() - STEP) });
      const code = body.recoveryCodes[0];
      const use = async () => {
        const deviceId = device();
        const first = await start(u, 'customer', deviceId);
        return request(t.app).post('/api/v1/auth/mfa/verify').send({ challenge: first.body.challenge, deviceId, code });
      };
      const ok = await use();
      expect(ok.status).toBe(200);
      expect(verifyAccessToken(h.env, ok.body.accessToken).amr).toEqual(['pwd', 'recovery']);
      expect((await use()).status).toBe(401);
      expect((await t.inbox()).some((m) => /recovery code was used/i.test(m.subject))).toBe(true);
    });

    it('new recovery codes need a current code, and the old ones stop working', async () => {
      const u = await t.makeUser({ roles: ['customer'], mfa: true });
      const res = await t.signIn(u, 'customer');
      const token = res.body.accessToken;
      await request(t.app).post('/api/v1/auth/mfa/recovery-codes').set(bearer(token)).send({ code: '123456' }).expect(401);
      const fresh = await request(t.app).post('/api/v1/auth/mfa/recovery-codes').set(bearer(token)).send({ code: totpNow(u.secret) }).expect(200);
      expect(fresh.body.recoveryCodes).toHaveLength(10);
      expect(await t.trx.identity('recovery_codes').where({ user_id: u.id }).count('* as n').first()).toEqual({ n: 10 });
    });
  });

  describe('policy', () => {
    it('a seller cannot turn the authenticator off; a customer can, with a current code', async () => {
      const seller = await t.makeUser({ roles: ['seller'], mfa: true });
      const s = await t.signIn(seller, 'seller');
      expect((await request(t.app).post('/api/v1/auth/mfa/disable').set(bearer(s.body.accessToken)).send({ code: totpNow(seller.secret) }).expect(409)).body.error.code).toBe('MFA_REQUIRED_BY_POLICY');

      const customer = await t.makeUser({ roles: ['customer'], mfa: true });
      const c = await t.signIn(customer, 'customer');
      await request(t.app).post('/api/v1/auth/mfa/disable').set(bearer(c.body.accessToken)).send({ code: '000000' }).expect(401);
      await request(t.app).post('/api/v1/auth/mfa/disable').set(bearer(c.body.accessToken)).send({ code: totpNow(customer.secret) }).expect(200);
      expect(await t.trx.identity('mfa_totp').where({ user_id: customer.id }).first()).toBeUndefined();
    });

    it('a seller token without a second factor is refused, whatever the client says', async () => {
      const u = await t.makeUser({ roles: ['seller'], mfa: true });
      const res = await request(t.app).get('/api/v1/seller/onboarding').set(bearer(t.tokenFor(u, 'seller', { mfa: false }))).expect(401);
      expect(res.body.error.code).toBe('MFA_REQUIRED');
      // the body cannot claim the factor was passed
      await request(t.app).post('/api/v1/auth/signin').send({ portal: 'seller', identifier: u.email, password: PASSWORD, deviceId: device(), mfa: true }).expect(400);
    });

    it('a refreshed token keeps the role and the time of the second factor, never "now"', async () => {
      const u = await t.makeUser({ roles: ['seller'], mfa: true });
      const res = await t.signIn(u, 'seller');
      const at = verifyAccessToken(h.env, res.body.accessToken).mfaAt;
      await new Promise((r) => setTimeout(r, 1100));
      const again = await request(t.app).post('/api/v1/auth/refresh').set('X-SnackHub-Client', 'web').set('Cookie', cookieFrom(res).split(';')[0]).expect(200);
      const claims = verifyAccessToken(h.env, again.body.accessToken);
      expect(claims).toMatchObject({ role: 'seller', amr: ['pwd', 'totp'] });
      expect(claims.mfaAt).toBe(at);
    });
  });
});
