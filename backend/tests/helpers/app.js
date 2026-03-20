// The API under test: real MySQL (every test in transactions that are rolled back), with
// fakes for Google, the mail server, file storage (a temp folder) and the malware scanner.
// Emails go through the real outbox and relay, so a test reads the link a person would click.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pino from 'pino';
import request from 'supertest';
import { connect } from './db.js';
import { moduleDb } from '../../src/db/connection.js';
import { loadEnv } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';
import { createStorage } from '../../src/utils/storage.js';
import { createOutboxRelay } from '../../src/jobs/outboxRelay.js';
import { hashPassword } from '../../src/utils/passwords.js';
import { signAccessToken } from '../../src/utils/tokens.js';
import { encryptSecret, newTotpSecret, totpNow } from '../../src/utils/mfa.js';

export const MODULES = ['identity', 'catalog', 'dispatch'];
export const STEP = 30_000;
export const PASSWORD = 'mango pickle on a rainy tuesday';
export const WEB = { 'X-SnackHub-Client': 'web' };
export const ADMIN = { 'X-SnackHub-Host': 'admin', 'X-SnackHub-Client': 'web' };
export const bearer = (t) => ({ Authorization: `Bearer ${t}` });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export const googleToken = (claims) => `eyJhbGciOiJSUzI1NiJ9.${b64(claims)}.${'s'.repeat(90)}`;
const fakeVerify = async (credential) => {
  const c = JSON.parse(Buffer.from(credential.split('.')[1], 'base64url').toString());
  return { sub: c.sub, email: c.email, emailVerified: c.email_verified !== false, name: c.name ?? 'Test (demo)' };
};

/** Pools, settings and a temp storage folder for one test file; null when MySQL is not there. */
export async function openHarness(overrides = {}) {
  const { db: migrator, env: dbEnv, reason } = await connect();
  if (!migrator) return { skip: reason };
  const pools = Object.fromEntries(MODULES.map((m) => [m, moduleDb(dbEnv, m)]));
  const storageDir = await mkdtemp(path.join(os.tmpdir(), 'snackhub-test-'));
  const env = loadEnv({
    ...dbEnv,
    NODE_ENV: 'test',
    DB_PORT: String(dbEnv.DB_PORT),
    CORS_ORIGINS: 'http://localhost:5180',
    JWT_SECRET: 'test-only-secret-that-is-at-least-32-characters',
    MFA_KEY: 'dGVzdC1vbmx5LW1mYS1rZXktMzItYnl0ZXMtbG9uZyE',
    GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
    COOKIE_SECURE: 'false',
    APP_URL: 'http://localhost:5180',
    STORAGE_DIR: storageDir,
    ...overrides,
  });
  let n = 0;
  return {
    env,
    migrator,
    pools,
    uniq: () => `${Date.now()}-${++n}`,
    async close() {
      await Promise.all([migrator, ...Object.values(pools)].map((d) => d.destroy()));
      await rm(storageDir, { recursive: true, force: true });
    },
  };
}

/**
 * One test's world: module transactions, the app on them, a fake inbox, and helpers.
 * Call end() in afterEach.
 */
export async function beginTest(h, { scan = 'not_scanned', sms = false } = {}) {
  const trx = Object.fromEntries(await Promise.all(MODULES.map(async (m) => [m, await h.pools[m].transaction()])));
  const sent = [];
  const mailer = { enabled: true, send: async (m) => sent.push(m) };
  const smsFake = { enabled: sms, send: async (m) => sent.push({ ...m, sms: true }) };
  const scanner = { enabled: scan !== 'not_scanned', scan: async () => scan };
  const storage = createStorage(h.env);
  const app = createApp({ env: h.env, logger: pino({ level: 'silent' }), dbs: trx, verifyGoogle: fakeVerify, storage, scanner, mailer, sms: smsFake });
  const relay = createOutboxRelay({ env: h.env, dbs: trx, mailer, sms: smsFake });

  /** Sends what the outbox holds; returns the messages sent since the last call. */
  async function inbox() {
    const before = sent.length;
    while ((await relay.runOnce()) > 0);
    return sent.slice(before);
  }

  /** An account with the given roles; a password, a verified email and optionally an authenticator. */
  async function makeUser({ roles = ['customer'], password = PASSWORD, verified = true, mfa = false, status = 'active', name = 'Test person (demo)', email } = {}) {
    const address = email ?? `user-${h.uniq()}@example.test`;
    const [id] = await trx.identity('users').insert({ email: address, name, email_verified_at: verified ? new Date() : null, status, status_reason: status === 'active' ? null : 'Test suspension' });
    if (password) await trx.identity('credentials').insert({ user_id: id, password_hash: await hashPassword(password), changed_at: new Date() });
    for (const role of roles) await trx.identity('user_roles').insert({ user_id: id, role, granted_at: new Date() });
    let secret = null;
    if (mfa) {
      secret = newTotpSecret();
      await trx.identity('mfa_totp').insert({ user_id: id, secret_enc: encryptSecret(h.env, secret), enrolled_at: new Date() });
    }
    return { id, email: address, password, secret, name };
  }

  /** A signed access token for a role, as if that portal had signed the person in. */
  const tokenFor = (user, role, { mfa = true } = {}) => signAccessToken(h.env, { id: user.id }, { role, mfaAt: mfa ? Date.now() : null, amr: mfa ? ['pwd', 'totp'] : ['pwd'] });

  /** Signs in through a portal, passing the code step with the user's authenticator. */
  async function signIn(user, portal, { deviceId = `dev-${h.uniq()}`, at = Date.now() - STEP } = {}) {
    const first = await request(app).post('/api/v1/auth/signin').send({ portal, identifier: user.email, password: user.password, deviceId });
    if (first.body.mfa !== 'verify') return first;
    return request(app).post('/api/v1/auth/mfa/verify').send({ challenge: first.body.challenge, code: totpNow(user.secret, at), deviceId });
  }

  return {
    trx,
    app,
    sent,
    inbox,
    makeUser,
    tokenFor,
    signIn,
    storage,
    end: () => Promise.all(Object.values(trx).map((t) => t.rollback())),
  };
}

/** The link in an email, and the token in it. */
export const linkIn = (mail) => mail.text.match(/https?:\/\/\S+/)[0];
export const tokenIn = (mail) => new URL(linkIn(mail)).searchParams.get('token');
export const cookieFrom = (res, name = 'sh_refresh') => (res.headers['set-cookie'] || []).find((c) => c.startsWith(`${name}=`));
export { request, totpNow };
