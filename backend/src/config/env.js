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
  return Object.freeze({ ...env, COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production' });
}
