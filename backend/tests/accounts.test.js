// Sign-up and sign-in for customers, sellers and riders: registration, duplicates, email
// verification, generic errors, lockout and rate limits, portals and roles, password reset,
// mobile verification and session management. Real PostgreSQL in rolled-back transactions; the
// verification and reset links are read from the emails the outbox relay sends.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHarness, beginTest, request, PASSWORD, WEB, bearer, tokenIn, cookieFrom } from './helpers/app.js';

const h = await openHarness();
if (h.skip) console.warn(`account tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

const device = () => `dev-${h.uniq()}`;
const register = (app, over = {}) =>
  request(app)
    .post('/api/v1/auth/register')
    .send({ portal: 'customer', name: 'Asha Rao', email: `asha-${h.uniq()}@example.test`, password: PASSWORD, acceptTerms: true, ...over });

describe.skipIf(h.skip)('accounts', () => {
  let t;
  beforeEach(async () => {
    t = await beginTest(h);
  });
  afterEach(() => t.end());

  describe('registration', () => {
    it('makes an unverified account with only the portal role, and emails a single-use link', async () => {
      const email = `new-${h.uniq()}@example.test`;
      const res = await register(t.app, { portal: 'seller', email, countryCode: '+91', mobile: '9876543210' }).expect(202);
      expect(res.body.status).toBe('CHECK_EMAIL');
      expect(res.body).not.toHaveProperty('accessToken');
      expect(cookieFrom(res)).toBeUndefined();

      const user = await t.trx.identity('users').where({ email }).first();
      expect(user.email_verified_at).toBeNull();
      expect(user.mobile).toBe('+919876543210');
      expect(user.mobile_verified_at).toBeNull();
      expect(user.terms_version).toBe(h.env.TERMS_VERSION);
      expect((await t.trx.identity('user_roles').where({ user_id: user.id })).map((r) => r.role)).toEqual(['seller']);
      const cred = await t.trx.identity('credentials').where({ user_id: user.id }).first();
      expect(cred.password_hash).toMatch(/^\$argon2id\$/);
      expect(cred.password_hash).not.toContain(PASSWORD);

      const [mail] = await t.inbox();
      expect(mail.to).toBe(email);
      expect(mail.subject).toMatch(/confirm your email/i);
      // the link is sealed while it waits in the outbox
      const row = await t.trx.identity('outbox').where({ type: 'email.send' }).orderBy('id', 'desc').first();
      expect(JSON.stringify(row.payload)).not.toContain(tokenIn(mail));

      // signing in waits for the email to be confirmed
      const early = await request(t.app).post('/api/v1/auth/signin').send({ portal: 'seller', identifier: email, password: PASSWORD, deviceId: device() }).expect(403);
      expect(early.body.error.code).toBe('EMAIL_NOT_VERIFIED');

      const ok = await request(t.app).post('/api/v1/auth/verify-email').send({ token: tokenIn(mail) }).expect(200);
      expect(ok.body).toEqual({ verified: true, portal: 'seller' });
      // a link works once
      expect((await request(t.app).post('/api/v1/auth/verify-email').send({ token: tokenIn(mail) }).expect(400)).body.error.code).toBe('LINK_INVALID');
      expect((await t.trx.identity('users').where({ email }).first()).email_verified_at).not.toBeNull();
    });

    it('answers a duplicate email exactly like a new one, makes nothing, and tells the owner', async () => {
      const existing = await t.makeUser({ roles: ['customer'] });
      const fresh = await register(t.app).expect(202);
      const dup = await register(t.app, { email: existing.email.toUpperCase(), portal: 'rider' }).expect(202);
      expect(dup.body).toEqual(fresh.body);
      expect(await t.trx.identity('users').where({ email: existing.email }).count('* as n').first()).toEqual({ n: 1 });
      expect((await t.trx.identity('user_roles').where({ user_id: existing.id })).map((r) => r.role)).toEqual(['customer']);
      const mails = await t.inbox();
      const notice = mails.find((m) => m.to === existing.email);
      expect(notice.subject).toMatch(/already have/i);
      expect(notice.text).toContain('/rider/signin');
    });

    it('refuses weak passwords, a missing terms tick, and any field that is not an answer', async () => {
      expect((await register(t.app, { password: 'short' }).expect(422)).body.error.code).toBe('WEAK_PASSWORD');
      expect((await register(t.app, { password: 'password1234' }).expect(422)).body.error.code).toBe('WEAK_PASSWORD');
      const email = `sameword-${h.uniq()}@example.test`;
      expect((await register(t.app, { email, password: `${email.split('@')[0]}-2026!` }).expect(422)).body.error.message).toMatch(/email/i);
      await register(t.app, { acceptTerms: false }).expect(400);
      for (const extra of [{ role: 'admin' }, { status: 'active' }, { emailVerified: true }, { portal: 'admin' }, { portal: 'reviewer' }]) {
        await register(t.app, extra).expect(400);
      }
      expect((await register(t.app, { countryCode: '+91', mobile: '12' }).expect(400)).body.error.code).toBe('VALIDATION');
    });

    it('resends the link without saying whether the email has an account', async () => {
      const unverified = await t.makeUser({ verified: false });
      const a = await request(t.app).post('/api/v1/auth/resend-verification').send({ email: unverified.email }).expect(202);
      const b = await request(t.app).post('/api/v1/auth/resend-verification').send({ email: `nobody-${h.uniq()}@example.test` }).expect(202);
      expect(a.body).toEqual(b.body);
      const mails = await t.inbox();
      expect(mails.map((m) => m.to)).toEqual([unverified.email]);
    });

    it('a link stops working once it expires, and verifies only the address it was sent to', async () => {
      await register(t.app, { email: `exp-${h.uniq()}@example.test` }).expect(202);
      const [mail] = await t.inbox();
      await t.trx.identity('account_tokens').where({ target: mail.to }).update({ created_at: new Date(Date.now() - 2 * 86_400_000), expires_at: new Date(Date.now() - 1000) });
      await request(t.app).post('/api/v1/auth/verify-email').send({ token: tokenIn(mail) }).expect(400);

      await register(t.app, { email: `moved-${h.uniq()}@example.test` }).expect(202);
      const [mail2] = await t.inbox();
      await t.trx.identity('users').where({ email: mail2.to }).update({ email: `changed-${h.uniq()}@example.test` });
      await request(t.app).post('/api/v1/auth/verify-email').send({ token: tokenIn(mail2) }).expect(400);
    });
  });

  describe('sign-in', () => {
    it('a customer signs in with a password and gets a customer token and a safe cookie', async () => {
      const u = await t.makeUser();
      const res = await t.signIn(u, 'customer');
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ id: u.id, role: 'customer', roles: ['customer'], mfaEnrolled: false });
      expect(res.body.home).toBe('/shop');
      const cookie = cookieFrom(res);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
      await request(t.app).get('/api/v1/me').set(bearer(res.body.accessToken)).expect(200);
    });

    it('says the same thing for an unknown email and a wrong password', async () => {
      const u = await t.makeUser();
      const wrong = await request(t.app).post('/api/v1/auth/signin').send({ portal: 'customer', identifier: u.email, password: 'not the password at all', deviceId: device() }).expect(401);
      const unknown = await request(t.app).post('/api/v1/auth/signin').send({ portal: 'customer', identifier: `ghost-${h.uniq()}@example.test`, password: 'not the password at all', deviceId: device() }).expect(401);
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(unknown.body.error).toMatchObject({ code: wrong.body.error.code, message: wrong.body.error.message });
    });

    it('locks the account for 15 minutes after five wrong passwords, even against the right one', async () => {
      const u = await t.makeUser();
      const tryWith = (password) => request(t.app).post('/api/v1/auth/signin').send({ portal: 'customer', identifier: u.email, password, deviceId: device() });
      for (let i = 0; i < 4; i++) expect((await tryWith('wrong password here')).status).toBe(401);
      expect((await tryWith('wrong password here')).status).toBe(423);
      const locked = await tryWith(PASSWORD);
      expect(locked.status).toBe(423);
      expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
      const audit = await t.trx.identity('audit_log').where({ actor_id: u.id }).pluck('action');
      expect(audit).toEqual(expect.arrayContaining(['auth.signin.failed', 'auth.signin.locked']));
    });

    it('rate-limits sign-in per address: the eleventh try in 15 minutes is refused', async () => {
      const email = `brute-${h.uniq()}@example.test`;
      const statuses = [];
      for (let i = 0; i < 11; i++) statuses.push((await request(t.app).post('/api/v1/auth/signin').send({ portal: 'customer', identifier: email, password: `guess number ${i}`, deviceId: device() })).status);
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses[10]).toBe(429);
    });

    it('each portal needs its role: a customer cannot sign in to the seller portal, but can join it', async () => {
      const u = await t.makeUser({ roles: ['customer'] });
      const res = await request(t.app).post('/api/v1/auth/signin').send({ portal: 'seller', identifier: u.email, password: PASSWORD, deviceId: device() }).expect(403);
      expect(res.body.error).toMatchObject({ code: 'ROLE_NOT_HELD', details: { canJoin: true, portal: 'seller' } });
      expect(res.body).not.toHaveProperty('accessToken');

      // joining adds the role; sellers must then set up an authenticator before any session
      const joined = await request(t.app).post('/api/v1/auth/join').send({ portal: 'seller', identifier: u.email, password: PASSWORD, deviceId: device() }).expect(200);
      expect(joined.body).toMatchObject({ mfa: 'enrol', portal: 'seller' });
      expect(joined.body).not.toHaveProperty('accessToken');
      expect((await t.trx.identity('user_roles').where({ user_id: u.id })).map((r) => r.role).sort()).toEqual(['customer', 'seller']);

      // joining still needs the right password
      await request(t.app).post('/api/v1/auth/join').send({ portal: 'rider', identifier: u.email, password: 'not the password at all', deviceId: device() }).expect(401);
      expect((await t.trx.identity('user_roles').where({ user_id: u.id, role: 'rider' })).length).toBe(0);
    });

    it('refuses suspended accounts and roles, and staff accounts on the public portals', async () => {
      const suspended = await t.makeUser({ status: 'suspended' });
      expect((await t.signIn(suspended, 'customer')).body.error.code).toBe('ACCOUNT_SUSPENDED');
      const role = await t.makeUser({ roles: ['rider'] });
      await t.trx.identity('user_roles').where({ user_id: role.id }).update({ status: 'suspended', status_reason: 'Test' });
      expect((await t.signIn(role, 'rider')).body.error.code).toBe('ROLE_SUSPENDED');
      const staff = await t.makeUser({ roles: ['customer', 'admin'] });
      expect((await t.signIn(staff, 'customer')).body.error.code).toBe('STAFF_ACCOUNT');
    });
  });

  describe('password reset', () => {
    it('resets with a single-use link, signs every device out and emails the owner', async () => {
      const u = await t.makeUser();
      const session = await t.signIn(u, 'customer');
      const cookie = cookieFrom(session).split(';')[0];

      await request(t.app).post('/api/v1/auth/password/forgot').send({ email: u.email }).expect(202);
      const [mail] = await t.inbox();
      expect(mail.subject).toMatch(/reset/i);
      const next = 'a brand new monsoon password';
      await request(t.app).post('/api/v1/auth/password/reset').send({ token: tokenIn(mail), password: next }).expect(200);
      await request(t.app).post('/api/v1/auth/password/reset').send({ token: tokenIn(mail), password: 'another new password ok' }).expect(400);

      // the old session is over, the old password fails, the new one works
      await request(t.app).post('/api/v1/auth/refresh').set(WEB).set('Cookie', cookie).expect(401);
      expect((await t.signIn(u, 'customer')).status).toBe(401);
      expect((await t.signIn({ ...u, password: next }, 'customer')).status).toBe(200);
      expect((await t.inbox()).some((m) => m.to === u.email && /password was changed/i.test(m.subject))).toBe(true);
    });

    it('answers the same for unknown emails, and refuses an expired link', async () => {
      const u = await t.makeUser();
      const a = await request(t.app).post('/api/v1/auth/password/forgot').send({ email: `nobody-${h.uniq()}@example.test` }).expect(202);
      const b = await request(t.app).post('/api/v1/auth/password/forgot').send({ email: u.email }).expect(202);
      expect(a.body).toEqual(b.body);
      const mails = await t.inbox();
      expect(mails.map((m) => m.to)).toEqual([u.email]);
      await t.trx.identity('account_tokens').where({ user_id: u.id, purpose: 'password_reset' }).update({ created_at: new Date(Date.now() - 3_600_000), expires_at: new Date(Date.now() - 1000) });
      expect((await request(t.app).post('/api/v1/auth/password/reset').send({ token: tokenIn(mails[0]), password: 'a brand new monsoon password' }).expect(400)).body.error.code).toBe('LINK_INVALID');
    });
  });

  describe('security page', () => {
    it('lists sessions, ends one, and signs out everywhere', async () => {
      const u = await t.makeUser();
      const one = await t.signIn(u, 'customer');
      const two = await t.signIn(u, 'customer');
      const token = two.body.accessToken;
      const cookieTwo = cookieFrom(two).split(';')[0];
      const page = await request(t.app).get('/api/v1/auth/security').set(bearer(token)).set('Cookie', cookieTwo).expect(200);
      expect(page.body.sessions).toHaveLength(2);
      expect(page.body.sessions.filter((s) => s.current)).toHaveLength(1);
      expect(JSON.stringify(page.body)).not.toMatch(/token_hash|password/);

      const other = page.body.sessions.find((s) => !s.current);
      await request(t.app).delete(`/api/v1/auth/sessions/${other.id}`).set(bearer(token)).expect(204);
      await request(t.app).post('/api/v1/auth/refresh').set(WEB).set('Cookie', cookieFrom(one).split(';')[0]).expect(401);

      await request(t.app).post('/api/v1/auth/logout-all').set(bearer(token)).expect(204);
      await request(t.app).post('/api/v1/auth/refresh').set(WEB).set('Cookie', cookieTwo).expect(401);
    });

    it("cannot end someone else's session", async () => {
      const a = await t.makeUser();
      const b = await t.makeUser();
      await t.signIn(b, 'customer');
      const [bFamily] = await t.trx.identity('refresh_tokens').where({ user_id: b.id }).pluck('family_id');
      await request(t.app).delete(`/api/v1/auth/sessions/${bFamily}`).set(bearer(t.tokenFor(a, 'customer'))).expect(404);
    });

    it('changing the password needs the current one and keeps only this device signed in', async () => {
      const u = await t.makeUser();
      const other = await t.signIn(u, 'customer');
      const here = await t.signIn(u, 'customer');
      const cookie = cookieFrom(here).split(';')[0];
      await request(t.app).post('/api/v1/auth/password/change').set(bearer(here.body.accessToken)).set('Cookie', cookie).send({ current: 'not the password at all', next: 'fresh new password for me' }).expect(403);
      await request(t.app).post('/api/v1/auth/password/change').set(bearer(here.body.accessToken)).set('Cookie', cookie).send({ current: PASSWORD, next: 'fresh new password for me' }).expect(200);
      await request(t.app).post('/api/v1/auth/refresh').set(WEB).set('Cookie', cookieFrom(other).split(';')[0]).expect(401);
      await request(t.app).post('/api/v1/auth/refresh').set(WEB).set('Cookie', cookie).expect(200);
    });

    it('mobile verification is off without an SMS provider', async () => {
      const u = await t.makeUser();
      const res = await request(t.app).post('/api/v1/auth/mobile/start').set(bearer(t.tokenFor(u, 'customer'))).send({ countryCode: '+91', mobile: '9876500000' }).expect(503);
      expect(res.body.error.code).toBe('SMS_NOT_CONFIGURED');
    });
  });
});

describe.skipIf(h.skip)('mobile verification with an SMS provider', () => {
  let t;
  beforeEach(async () => {
    t = await beginTest(h, { sms: true });
  });
  afterEach(() => t.end());

  it('texts a code, verifies the number, and then the number signs in', async () => {
    const u = await t.makeUser();
    const token = t.tokenFor(u, 'customer');
    const number = `98${String(Date.now()).slice(-8)}`;
    await request(t.app).post('/api/v1/auth/mobile/start').set(bearer(token)).send({ countryCode: '+91', mobile: number }).expect(202);
    const [text] = await t.inbox();
    expect(text.sms).toBe(true);
    const code = text.body.match(/\d{6}/)[0];
    const wrong = code === '000000' ? '111111' : '000000';
    expect((await request(t.app).post('/api/v1/auth/mobile/verify').set(bearer(token)).send({ code: wrong }).expect(422)).body.error.code).toBe('CODE_INVALID');
    await request(t.app).post('/api/v1/auth/mobile/verify').set(bearer(token)).send({ code }).expect(200);
    // used once
    await request(t.app).post('/api/v1/auth/mobile/verify').set(bearer(token)).send({ code }).expect(400);
    const res = await request(t.app).post('/api/v1/auth/signin').send({ portal: 'customer', identifier: `+91${number}`, password: PASSWORD, deviceId: device() }).expect(200);
    expect(res.body.user.mobileVerified).toBe(true);
  });

  it('an unverified number never signs anyone in', async () => {
    const number = `97${String(Date.now()).slice(-8)}`;
    const u = await t.makeUser();
    await t.trx.identity('users').where({ id: u.id }).update({ mobile: `+91${number}` });
    await request(t.app).post('/api/v1/auth/signin').send({ portal: 'customer', identifier: `+91${number}`, password: PASSWORD, deviceId: device() }).expect(401);
  });
});
