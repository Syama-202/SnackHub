// Every setting the backend reads, checked once at boot. A missing or malformed value stops
// the process with the key name only, never the value (doc 0.3).
import { z } from 'zod';

const csv = z.string().transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean));
// 'true' or 'false' from the environment; an already-read true or false passes as it is, so
// settings read once can be checked again (the tests do)
const bool = z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]);

// What migrations, the seed and the database tests need
const database = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive(),
  DB_MIGRATOR_USER: z.string().min(1),
  DB_MIGRATOR_PASSWORD: z.string().min(8),
  DB_MODULE_PASSWORD: z.string().min(8),
  // TLS to a hosted MySQL (Aiven requires it). DB_SSL_CA is the provider's CA certificate,
  // the PEM text itself (newlines may be written as \n); without it the system's CAs are used.
  DB_SSL: bool.prefault('false'),
  DB_SSL_CA: z.string().default(''),
});

// What the running server needs on top of that
const server = database.extend({
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // the build or version running, shown on each recorded error (for example a git commit)
  RELEASE: z.string().regex(/^[\w.+-]{1,40}$/).default('dev'),
  // the API docs (/api/docs and /api/v1/openapi.json). Unset: on outside production
  API_DOCS: bool.optional(),
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
  PASSWORD_BREACH_CHECK: bool.prefault('false'),

  // Email with nodemailer: smtp (your provider), file (each message saved as an .eml file in
  // MAIL_DIR, development only) or off. Unset: smtp when SMTP_HOST is set, otherwise file in
  // development and off elsewhere, where the outbox keeps the messages until it is set.
  MAIL_TRANSPORT: z.enum(['smtp', 'file', 'off']).optional(),
  MAIL_DIR: z.string().min(1).default('storage/mail'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: bool.prefault('false'),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().min(3).default('SnackHub (demo) <no-reply@snackhub.test>'),
  // Text messages: '' (off), dev-mail (development only: each text is saved with the emails)
  // or twilio. Unset means dev-mail in development and off everywhere else.
  SMS_PROVIDER: z.enum(['', 'dev-mail', 'twilio']).optional(),
  TWILIO_ACCOUNT_SID: z.string().default(''),
  TWILIO_AUTH_TOKEN: z.string().default(''),
  TWILIO_FROM: z.string().default(''),

  // Private document storage (utils/storage.js): 'disk' (STORAGE_DIR, outside every public
  // folder; relative paths are from backend/) or 's3', a private bucket at any S3-compatible
  // service (Cloudflare R2, Backblaze B2, AWS S3). Hosts whose disk is wiped on restart, such
  // as Render's free plan, need 's3'.
  STORAGE_DRIVER: z.enum(['disk', 's3']).default('disk'),
  STORAGE_DIR: z.string().min(1).default('storage/private'),
  // R2: https://<account id>.r2.cloudflarestorage.com with region auto
  S3_ENDPOINT: z.string().url().or(z.literal('')).default(''),
  S3_REGION: z.string().max(40).default('auto'),
  S3_BUCKET: z.string().max(63).default(''),
  S3_ACCESS_KEY_ID: z.string().max(200).default(''),
  S3_SECRET_ACCESS_KEY: z.string().max(200).default(''),
  // ClamAV daemon for upload scanning; empty stores uploads as not scanned
  CLAMAV_HOST: z.string().default(''),
  CLAMAV_PORT: z.coerce.number().int().positive().default(3310),
  // the outbox relay and the daily document-expiry job run inside the API process
  RUN_JOBS: bool.optional(),

  // Redis (doc 13): shared rate-limit counters and the Socket.IO adapter, so several API
  // processes count and broadcast together. Unset: redis://127.0.0.1:6380 in development
  // (npm run redis:up), off in tests; production must set it. While Redis is unreachable each
  // process counts on its own and live events reach only its own sockets.
  REDIS_URL: z.string().regex(/^rediss?:\/\/\S+$/).or(z.literal('')).optional(),
  // every /api/v1 request from one IP address, per minute, on top of the per-route limits
  RATE_LIMIT_IP_PER_MIN: z.coerce.number().int().min(60).max(100_000).default(600),

  // Hosting (doc 15.0): the address to listen on (0.0.0.0 in a container), and the secret the
  // Netlify sites sign their proxied requests with (middleware/proxy.js). With the secret set,
  // a signed request names its site (APP_URL or ADMIN_CONSOLE_URL), so the admin routes know
  // the admin site and the rate limits see each visitor's own address. REQUIRE_PROXY then turns
  // away API requests that did not come through a site (webhooks and health checks excepted).
  HOST: z.string().min(1).default('127.0.0.1'),
  PROXY_SIGNING_SECRET: z.string().min(32).or(z.literal('')).default(''),
  REQUIRE_PROXY: bool.optional(),

  // Place search for the address pin (utils/geocoder.js): a Nominatim-compatible server.
  // Unset: the public OpenStreetMap Nominatim in development, off in tests and production
  // (its policy allows light use only; production should name its own server). The contact,
  // an email or URL, goes in the User-Agent as that policy asks.
  GEOCODER_URL: z.string().url().or(z.literal('')).optional(),
  GEOCODER_CONTACT: z.string().max(120).default(''),

  // Online payment through PhonePe Standard Checkout (utils/phonepe.js), sandbox only: the
  // code knows no production address, so live payments cannot happen from this app. Leave
  // the client id empty to offer pay on delivery only. The webhook username and password are
  // the ones set on the PhonePe dashboard; the webhook is refused when they are not set.
  PHONEPE_CLIENT_ID: z.string().max(100).default(''),
  PHONEPE_CLIENT_SECRET: z.string().max(200).default(''),
  PHONEPE_CLIENT_VERSION: z.coerce.number().int().positive().default(1),
  PHONEPE_WEBHOOK_USERNAME: z.string().max(100).default(''),
  PHONEPE_WEBHOOK_PASSWORD: z.string().max(200).default(''),
  // how long the customer has to finish paying (PhonePe allows 5 to 60 minutes)
  PAYMENT_WINDOW_MIN: z.coerce.number().int().min(5).max(60).default(15),

  // Push notifications (utils/push.js): a VAPID key pair from `npx web-push generate-vapid-keys`.
  // Leave both empty to keep push off; the in-app inbox works either way. The subject is how a
  // push service can reach whoever runs this server (mailto: or https:).
  VAPID_PUBLIC_KEY: z.string().regex(/^[A-Za-z0-9_-]{87}$/, 'A VAPID public key is 87 base64url characters').or(z.literal('')).default(''),
  VAPID_PRIVATE_KEY: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'A VAPID private key is 43 base64url characters').or(z.literal('')).default(''),
  VAPID_SUBJECT: z.string().regex(/^(mailto:\S+@\S+|https:\/\/\S+)$/).default('mailto:no-reply@snackhub.test'),
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

const REDIS_DEFAULT = { development: 'redis://127.0.0.1:6380', test: '' };

/** Every setting the server needs. */
export function loadEnv(source = process.env) {
  const parsed = parse(server, source);
  if (!parsed.REDIS_URL && parsed.NODE_ENV === 'production') throw new Error('Invalid or missing settings: REDIS_URL. See backend/.env.example.');
  const env = { ...parsed, REDIS_URL: parsed.REDIS_URL ?? REDIS_DEFAULT[parsed.NODE_ENV] };
  if (env.SMS_PROVIDER === 'dev-mail' && env.NODE_ENV === 'production') throw new Error('Invalid settings: SMS_PROVIDER=dev-mail is for development only.');
  // saved emails hold sign-in links, so production never writes them to disk
  if (env.MAIL_TRANSPORT === 'file' && env.NODE_ENV === 'production') throw new Error('Invalid settings: MAIL_TRANSPORT=file is for development only.');
  if (env.MAIL_TRANSPORT === 'smtp' && !env.SMTP_HOST) throw new Error('Invalid or missing settings: SMTP_HOST. See backend/.env.example.');
  if (env.PHONEPE_CLIENT_ID && !env.PHONEPE_CLIENT_SECRET) throw new Error('Invalid or missing settings: PHONEPE_CLIENT_SECRET. See backend/.env.example.');
  if (env.STORAGE_DRIVER === 's3' && !(env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY)) {
    throw new Error('Invalid or missing settings: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY. See backend/.env.example.');
  }
  if (env.REQUIRE_PROXY && !env.PROXY_SIGNING_SECRET) throw new Error('Invalid or missing settings: PROXY_SIGNING_SECRET. See backend/.env.example.');
  if (env.SMS_PROVIDER === 'twilio' && !(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM)) {
    throw new Error('Invalid or missing settings: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM. See backend/.env.example.');
  }
  const dev = env.NODE_ENV === 'development';
  return Object.freeze({
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
    RUN_JOBS: env.RUN_JOBS ?? env.NODE_ENV !== 'test',
    API_DOCS: env.API_DOCS ?? env.NODE_ENV !== 'production',
    REQUIRE_PROXY: env.REQUIRE_PROXY ?? Boolean(env.PROXY_SIGNING_SECRET && env.NODE_ENV === 'production'),
    SMTP_HOST: env.SMTP_HOST ?? '',
    MAIL_TRANSPORT: env.MAIL_TRANSPORT ?? (env.SMTP_HOST ? 'smtp' : dev ? 'file' : 'off'),
    SMS_PROVIDER: env.SMS_PROVIDER ?? (dev ? 'dev-mail' : ''),
    GEOCODER_URL: env.GEOCODER_URL ?? (dev ? 'https://nominatim.openstreetmap.org' : ''),
  });
}
