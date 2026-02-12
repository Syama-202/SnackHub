// Every setting the API reads, checked once at boot. A missing or malformed value stops
// the process with the key name only, never the value (doc 0.3).
import { z } from 'zod';

const csv = z.string().transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: csv.pipe(z.array(z.string().url()).min(1)),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive(),
  DB_MIGRATOR_USER: z.string().min(1),
  DB_MIGRATOR_PASSWORD: z.string().min(8),
  DB_MODULE_PASSWORD: z.string().min(8),
});

export function loadEnv(source = process.env) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const keys = [...new Set(parsed.error.issues.map((i) => i.path.join('.')))];
    throw new Error(`Invalid or missing settings: ${keys.join(', ')}. See backend/.env.example.`);
  }
  return Object.freeze(parsed.data);
}
