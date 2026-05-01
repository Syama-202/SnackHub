import { loadEnv } from './config/env.js';
import { createLogger } from './utils/logger.js';
import { moduleDbs, closeAll } from './db/connection.js';
import { createApp } from './app.js';
import { createMailer } from './utils/mailer.js';
import { createSms } from './utils/sms.js';
import { createOutboxRelay } from './jobs/outboxRelay.js';
import { runDocumentExpiry } from './jobs/documentExpiry.js';
import { createOrderTimers } from './jobs/orderTimers.js';
import { createRedis, closeRedis } from './utils/redis.js';
import { redisCounter, memoryCounter } from './utils/rateLimit.js';
import { createSocketServer } from './socket.js';

const env = loadEnv();
const logger = createLogger(env);
const dbs = moduleDbs(env);
const mailer = createMailer(env);
const sms = createSms(env, mailer);
// shared rate-limit counters and Socket.IO rooms; without REDIS_URL each process works alone
const redis = createRedis(env, logger);
const rateStore = redis ? redisCounter(redis, { logger }) : memoryCounter();
if (!redis) logger.warn('REDIS_URL is empty: rate limits and live updates are per process');
const app = createApp({ env, logger, dbs, mailer, sms, redis, rateStore });

const server = app.listen(env.PORT, '127.0.0.1', () =>
  logger.info({ port: env.PORT, mail: mailer.kind, ...(mailer.kind === 'file' ? { mailDir: mailer.dir } : {}), sms: sms.enabled, redis: Boolean(redis) }, 'api listening'),
);
// live updates on the same port, at /api/v1/socket
const sockets = createSocketServer(server, { env, dbs, logger, redis, rateStore });

// background work in the same process: emails, texts and inbox messages every few seconds,
// the order clocks (shop accept timeout, rider offers) every five, document expiry every six
// hours (all safe to run twice; `npm run jobs` runs them once from cron)
const relay = createOutboxRelay({ env, dbs, mailer, sms, logger });
const orderTimers = createOrderTimers({ dbs, logger });
let expiryTimer;
if (env.RUN_JOBS) {
  relay.start();
  orderTimers.start();
  const expiry = () => runDocumentExpiry({ env, dbs, logger }).catch((err) => logger.error({ reason: err.code ?? err.message }, 'document expiry failed'));
  setTimeout(expiry, 15_000).unref();
  expiryTimer = setInterval(expiry, 6 * 3600_000);
  expiryTimer.unref();
}

async function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  relay.stop();
  orderTimers.stop();
  clearInterval(expiryTimer);
  setTimeout(() => process.exit(1), 10_000).unref();
  // closing Socket.IO closes the HTTP server as well
  await sockets.close();
  await closeAll(dbs);
  await closeRedis(redis);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
