// Every setting the backend reads, checked once at boot. A missing or malformed value stops
// the process with the key name only, never the value (doc 0.3).
import { z } from 'zod';

const csv = z.string().transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean));
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

// What migrations, the seed and the database tests need
const database = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive(),
  DB_MIGRATOR_USER: z.string().min(1),
  DB_MIGRATOR_PASSWORD: z.string().min(8),
  DB_MODULE_PASSWORD: z.string().min(8),
});

// What the running server needs on top of that
const server = database.extend({
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: csv.pipe(z.array(z.string().url()).min(1)),
  // Google sign-in (doc 16.1): only the OAuth client ID, no client secret. Empty until set up;
  // POST /auth/google then answers 503 GOOGLE_NOT_CONFIGURED.
  GOOGLE_CLIENT_ID: z.string().regex(/\.apps\.googleusercontent\.com$/).or(z.literal('')).default(''),
  // signs our own access tokens; random, at least 32 characters
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  // Secure cookies need HTTPS; local http://localhost development turns it off
  COOKIE_SECURE: bool.optional(),
  // Admin console (doc 16.3, 15.0). Host names (host:port) that may reach /api/v1/admin; every
  // other host gets 404. Outside production the dev header X-SnackHub-Host: admin also counts,
  // because the local console shares the public dev server.
  ADMIN_HOSTS: csv.default(''),
  // where enrolment links point, e.g. http://localhost:5180/admin.html
  ADMIN_CONSOLE_URL: z.string().url().default('http://localhost:5180/admin.html'),
  ADMIN_ACCESS_MINUTES: z.coerce.number().int().min(1).max(15).default(10),
  ADMIN_SESSION_HOURS: z.coerce.number().int().min(1).max(8).default(8),
  // 32 random bytes, base64url (43 characters). Encrypts TOTP secrets; HKDF derives separate
  // keys from it for document numbers, one-time codes and signed file links (utils/keys.js).
  MFA_KEY: z.string().regex(/^[A-Za-z0-9_-]{43}$/),

  // Sign-up and sign-in for every role. Links in emails point at APP_URL.
  APP_URL: z.string().url().default('http://localhost:5180'),
  // roles that must enrol an authenticator app; admin and reviewer are always included
  MFA_REQUIRED_ROLES: csv.pipe(z.array(z.enum(['customer', 'seller', 'rider', 'reviewer', 'admin']))).default('admin,reviewer,seller'),
  // the terms and privacy version a new account accepts
  TERMS_VERSION: z.string().regex(/^[\w.-]{1,20}$/).default('2026-03'),
  // check new passwords against Have I Been Pwned (only a 5-character hash prefix is sent)
  PASSWORD_BREACH_CHECK: bool.default('false'),

  // Email with nodemailer: smtp (your provider), file (each message saved as an .eml file in
  // MAIL_DIR, development only) or off. Unset: smtp when SMTP_HOST is set, otherwise file in
  // development and off elsewhere, where the outbox keeps the messages until it is set.
  MAIL_TRANSPORT: z.enum(['smtp', 'file', 'off']).optional(),
  MAIL_DIR: z.string().min(1).default('storage/mail'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: bool.default('false'),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().min(3).default('SnackHub (demo) <no-reply@snackhub.test>'),
  // Text messages: '' (off), dev-mail (development only: each text is saved with the emails)
  // or twilio. Unset means dev-mail in development and off everywhere else.
  SMS_PROVIDER: z.enum(['', 'dev-mail', 'twilio']).optional(),
  TWILIO_ACCOUNT_SID: z.string().default(''),
  TWILIO_AUTH_TOKEN: z.string().default(''),
  TWILIO_FROM: z.string().default(''),

  // Private document storage, outside every public folder; relative paths are from backend/
  STORAGE_DIR: z.string().min(1).default('storage/private'),
  // ClamAV daemon for upload scanning; empty stores uploads as not scanned
  CLAMAV_HOST: z.string().default(''),
  CLAMAV_PORT: z.coerce.number().int().positive().default(3310),
  // the outbox relay and the daily document-expiry job run inside the API process
  RUN_JOBS: bool.optional(),
});

function parse(schema, source) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const keys = [...new Set(parsed.error.issues.map((i) => i.path.join('.')))];
    throw new Error(`Invalid or missing settings: ${keys.join(', ')}. See backend/.env.example.`);
  }
  return parsed.data;
}

/** Settings for the database only (migrations, seed, tests). */
export const loadDbEnv = (source = process.env) => Object.freeze(parse(database, source));

/** Every setting the server needs. */
export function loadEnv(source = process.env) {
  const env = parse(server, source);
  if (env.SMS_PROVIDER === 'dev-mail' && env.NODE_ENV === 'production') throw new Error('Invalid settings: SMS_PROVIDER=dev-mail is for development only.');
  // saved emails hold sign-in links, so production never writes them to disk
  if (env.MAIL_TRANSPORT === 'file' && env.NODE_ENV === 'production') throw new Error('Invalid settings: MAIL_TRANSPORT=file is for development only.');
  if (env.MAIL_TRANSPORT === 'smtp' && !env.SMTP_HOST) throw new Error('Invalid or missing settings: SMTP_HOST. See backend/.env.example.');
  if (env.SMS_PROVIDER === 'twilio' && !(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM)) {
    throw new Error('Invalid or missing settings: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM. See backend/.env.example.');
  }
  const dev = env.NODE_ENV === 'development';
  return Object.freeze({
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
    RUN_JOBS: env.RUN_JOBS ?? env.NODE_ENV !== 'test',
    SMTP_HOST: env.SMTP_HOST ?? '',
    MAIL_TRANSPORT: env.MAIL_TRANSPORT ?? (env.SMTP_HOST ? 'smtp' : dev ? 'file' : 'off'),
    SMS_PROVIDER: env.SMS_PROVIDER ?? (dev ? 'dev-mail' : ''),
  });
}
