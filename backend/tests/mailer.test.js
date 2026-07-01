// Email transports: in development nodemailer saves each message as an .eml file (nothing is
// sent), production needs SMTP, and saved files never carry the address in their name.
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createMailer, parseSender } from '../src/utils/mailer.js';
import { createSms } from '../src/utils/sms.js';
import { loadEnv } from '../src/config/env.js';

const dirs = [];
afterAll(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

const BASE = {
  DB_HOST: '127.0.0.1',
  DB_PORT: '3306',
  DB_MIGRATOR_USER: 'sh_migrator',
  DB_MIGRATOR_PASSWORD: 'test-password',
  DB_MODULE_PASSWORD: 'test-password',
  CORS_ORIGINS: 'http://localhost:5180',
  JWT_SECRET: 'test-only-secret-that-is-at-least-32-characters',
  MFA_KEY: 'dGVzdC1vbmx5LW1mYS1rZXktMzItYnl0ZXMtbG9uZyE',
};

describe('mail settings', () => {
  it('development saves files unless SMTP is set; production never writes them', () => {
    expect(loadEnv({ ...BASE, NODE_ENV: 'development' })).toMatchObject({ MAIL_TRANSPORT: 'file', SMS_PROVIDER: 'dev-mail' });
    expect(loadEnv({ ...BASE, NODE_ENV: 'development', SMTP_HOST: 'smtp.example.test' }).MAIL_TRANSPORT).toBe('smtp');
    expect(loadEnv({ ...BASE, NODE_ENV: 'production', REDIS_URL: 'redis://redis.internal:6379' })).toMatchObject({ MAIL_TRANSPORT: 'off', SMS_PROVIDER: '' });
    expect(() => loadEnv({ ...BASE, NODE_ENV: 'production', REDIS_URL: 'redis://redis.internal:6379', MAIL_TRANSPORT: 'file' })).toThrow(/development only/);
    expect(() => loadEnv({ ...BASE, NODE_ENV: 'production', REDIS_URL: 'redis://redis.internal:6379', SMS_PROVIDER: 'dev-mail' })).toThrow(/development only/);
    expect(() => loadEnv({ ...BASE, NODE_ENV: 'production', REDIS_URL: 'redis://redis.internal:6379', MAIL_TRANSPORT: 'smtp' })).toThrow(/SMTP_HOST/);
    // a Brevo key wins over SMTP, because hosts that need it block the SMTP ports
    expect(loadEnv({ ...BASE, NODE_ENV: 'production', REDIS_URL: 'redis://redis.internal:6379', BREVO_API_KEY: 'test-key', SMTP_HOST: 'smtp.example.test' }).MAIL_TRANSPORT).toBe('brevo');
    expect(() => loadEnv({ ...BASE, MAIL_TRANSPORT: 'brevo' })).toThrow(/BREVO_API_KEY/);
  });
});

describe('redis settings', () => {
  it('defaults to the local container in development, is off in tests and required in production', () => {
    expect(loadEnv({ ...BASE, NODE_ENV: 'development' }).REDIS_URL).toBe('redis://127.0.0.1:6380');
    expect(loadEnv({ ...BASE, NODE_ENV: 'test' }).REDIS_URL).toBe('');
    expect(() => loadEnv({ ...BASE, NODE_ENV: 'production' })).toThrow(/REDIS_URL/);
    expect(() => loadEnv({ ...BASE, NODE_ENV: 'production', REDIS_URL: '' })).toThrow(/REDIS_URL/);
    expect(() => loadEnv({ ...BASE, REDIS_URL: 'http://not-redis' })).toThrow(/REDIS_URL/);
  });
});

describe('the file transport', () => {
  it('writes a complete .eml file per message, named without the address', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'snackhub-mail-'));
    dirs.push(dir);
    const mailer = createMailer({ MAIL_TRANSPORT: 'file', MAIL_DIR: dir, MAIL_FROM: 'SnackHub (demo) <no-reply@snackhub.test>' });
    expect(mailer).toMatchObject({ enabled: true, kind: 'file' });
    await mailer.send({ to: 'asha@example.test', subject: 'Confirm your email', text: 'Open http://localhost:5180/verify-email?token=abc', html: '<p>hi</p>', messageId: '<outbox-identity-7@snackhub.local>', name: 'verify_email-identity-7' });
    const sms = createSms({ SMS_PROVIDER: 'dev-mail', NODE_ENV: 'development' }, mailer);
    await sms.send({ to: '+919876543210', body: '123456 is your SnackHub code', name: 'mobile_code-identity-8' });
    const files = (await readdir(dir)).sort();
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.endsWith('.eml') && !f.includes('@') && !f.includes('example'))).toBe(true);
    const mail = await readFile(path.join(dir, files.find((f) => f.includes('verify_email'))), 'utf8');
    expect(mail).toMatch(/^Subject: Confirm your email/m);
    expect(mail).toMatch(/^To: asha@example\.test/m);
    expect(mail).toContain('outbox-identity-7@snackhub.local');
  });

  it('is off without a transport', async () => {
    const mailer = createMailer({ MAIL_TRANSPORT: 'off' });
    expect(mailer.enabled).toBe(false);
    expect(await mailer.send({ to: 'x@example.test', subject: 's', text: 't' })).toEqual({ skipped: true });
  });
});

describe('the Brevo transport', () => {
  const env = { MAIL_TRANSPORT: 'brevo', BREVO_API_KEY: 'test-key', MAIL_FROM: 'SnackHub <hello@snackhub.test>' };
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('reads the sender name and address', () => {
    expect(parseSender('SnackHub (demo) <no-reply@snackhub.test>')).toEqual({ name: 'SnackHub (demo)', email: 'no-reply@snackhub.test' });
    expect(parseSender(' plain@snackhub.test ')).toEqual({ email: 'plain@snackhub.test' });
  });

  it('posts the message to the web API with the key in a header', async () => {
    const calls = [];
    const mailer = createMailer(env, { fetch: async (url, init) => (calls.push([url, init]), reply(201, { messageId: '<abc@brevo>' })) });
    expect(mailer).toMatchObject({ enabled: true, kind: 'brevo' });
    expect(await mailer.send({ to: 'asha@example.test', subject: 'Confirm your email', text: 'Open the link', html: '<p>hi</p>', messageId: '<outbox-identity-7@snackhub.local>' })).toEqual({ messageId: '<abc@brevo>' });
    const [url, init] = calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers['api-key']).toBe('test-key');
    expect(JSON.parse(init.body)).toEqual({
      sender: { name: 'SnackHub', email: 'hello@snackhub.test' },
      to: [{ email: 'asha@example.test' }],
      subject: 'Confirm your email',
      textContent: 'Open the link',
      htmlContent: '<p>hi</p>',
      headers: { 'X-SnackHub-Message-Id': '<outbox-identity-7@snackhub.local>' },
    });
  });

  it('fails with the status and code, never the address, so the outbox tries again', async () => {
    const mailer = createMailer(env, { fetch: async () => reply(401, { code: 'unauthorized', message: 'Key not found' }) });
    const err = await mailer.send({ to: 'asha@example.test', subject: 's', text: 't' }).catch((e) => e);
    expect(err).toMatchObject({ status: 401, code: 'unauthorized' });
    expect(err.message).not.toContain('asha');
  });
});
