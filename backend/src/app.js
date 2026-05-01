// Express app: security and logging middleware, the routes, then the 404 and error
// handlers. Everything it needs (settings, logger, database pools, the Google token check,
// file storage, the malware scanner, email and SMS) is passed in, so the tests can build it
// with fakes.
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { requestLogger } from './middleware/requestLogger.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { routes } from './routes/index.js';
import { createGoogleVerifier } from './utils/google.js';
import { createStorage } from './utils/storage.js';
import { createScanner } from './utils/malwareScan.js';
import { createMailer } from './utils/mailer.js';
import { createSms } from './utils/sms.js';
import { memoryCounter, redisCounter } from './utils/rateLimit.js';
import { limit, byIp } from './middleware/rateLimit.js';

export function createApp({
  env,
  logger,
  dbs,
  verifyGoogle = createGoogleVerifier(env.GOOGLE_CLIENT_ID),
  storage = createStorage(env),
  scanner = createScanner(env),
  mailer = createMailer(env),
  sms = createSms(env, mailer),
  // rate-limit counters: Redis when the server passes a client, so every process shares them
  redis = null,
  rateStore = redis ? redisCounter(redis, { logger }) : memoryCounter(),
}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestLogger(logger));
  app.use(helmet());
  // exact origins only, never a wildcard with credentials (doc 16.2)
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true, exposedHeaders: ['X-Request-Id', 'Retry-After', 'RateLimit-Remaining'] }));
  // every API request from one address, before the body is even read (health checks are outside /api)
  const deps = { env, dbs, verifyGoogle, storage, scanner, mailer, sms, rateStore };
  app.use('/api/v1', limit(deps, 'api.ip', { minutes: 1, max: env.RATE_LIMIT_IP_PER_MIN }, byIp, 'Too many requests from your network. Wait a minute and try again.'));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use(routes(deps));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
