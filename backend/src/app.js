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
import { netlifyProxy } from './middleware/proxy.js';
import { routes } from './routes/index.js';
import { createGoogleVerifier } from './utils/google.js';
import { createStorage } from './utils/storage.js';
import { createScanner } from './utils/malwareScan.js';
import { createMailer } from './utils/mailer.js';
import { createSms } from './utils/sms.js';
import { memoryCounter, redisCounter } from './utils/rateLimit.js';
import { createGeocoder } from './utils/geocoder.js';
import { createPhonePe } from './utils/phonepe.js';
import { gateway } from './utils/payments.js';
import { createPush } from './utils/push.js';
import { webhookRoutes } from './routes/webhooks.js';
import { limit, byIp } from './middleware/rateLimit.js';
import { markActive } from './utils/activity.js';

export function createApp({
  env,
  logger,
  dbs,
  verifyGoogle = createGoogleVerifier(env.GOOGLE_CLIENT_ID),
  storage = createStorage(env),
  scanner = createScanner(env),
  mailer = createMailer(env),
  sms = createSms(env, mailer),
  // push notifications (off without VAPID keys); tests pass a fake sender
  push = createPush(env, { logger }),
  // rate-limit counters: Redis when the server passes a client, so every process shares them
  redis = null,
  rateStore = redis ? redisCounter(redis, { logger }) : memoryCounter(),
  geocoder = createGeocoder(env, { logger }),
  // online payments (sandbox only); tests pass a fake with the same shape
  paymentProvider = createPhonePe(env, { logger }),
}) {
  gateway.use(paymentProvider);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestLogger(logger));
  // any API call (not the health checks, which uptime monitors make) counts as someone using the
  // site, so the background jobs run at full speed (utils/activity.js)
  app.use('/api', (req, res, next) => {
    markActive();
    next();
  });
  app.use(helmet());
  // exact origins only, never a wildcard with credentials (doc 16.2)
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true, exposedHeaders: ['X-Request-Id', 'Retry-After', 'RateLimit-Remaining'] }));
  // which Netlify site a request came through, and the visitor's own address (doc 15.0)
  app.use(netlifyProxy(env));
  // every API request from one address, before the body is even read (health checks are outside /api)
  const deps = { env, dbs, logger, verifyGoogle, storage, scanner, mailer, sms, push, rateStore, geocoder };
  app.use('/api/v1', limit(deps, 'api.ip', { minutes: 1, max: env.RATE_LIMIT_IP_PER_MIN }, byIp, 'Too many requests from your network. Wait a minute and try again.'));
  // webhooks read their raw body, so they come before the JSON parser
  const webhooks = webhookRoutes(deps);
  app.use(webhooks);
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use(routes(deps, { extra: [['', webhooks]] }));

  app.use(notFound);
  app.use(errorHandler(deps));
  return app;
}
