import { loadEnv } from './config/env.js';
import { createLogger } from './utils/logger.js';
import { moduleDbs, closeAll } from './db/connection.js';
import { createApp } from './app.js';
import { createMailer } from './utils/mailer.js';
import { createSms } from './utils/sms.js';
import { createOutboxRelay } from './jobs/outboxRelay.js';
import { createPush } from './utils/push.js';
import { describeError, recordError } from './utils/errors.js';
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
const push = createPush(env, { logger });
// shared rate-limit counters and Socket.IO rooms; without REDIS_URL each process works alone
const redis = createRedis(env, logger);
const rateStore = redis ? redisCounter(redis, { logger }) : memoryCounter();
if (!redis) logger.warn('REDIS_URL is empty: rate limits and live updates are per process');
const app = createApp({ env, logger, dbs, mailer, sms, push, redis, rateStore });

// 127.0.0.1 on a laptop; a container sets HOST=0.0.0.0 so its platform can reach it
const server = app.listen(env.PORT, env.HOST, () =>
  logger.info({ port: env.PORT, mail: mailer.kind, ...(mailer.kind === 'file' ? { mailDir: mailer.dir } : {}), sms: sms.enabled, push: push.enabled, redis: Boolean(redis) }, 'api listening'),
);
// live updates on the same port, at /api/v1/socket
const sockets = createSocketServer(server, { env, dbs, logger, redis, rateStore });

// background work in the same process: emails, texts and inbox messages every few seconds,
// the order clocks (shop accept timeout, rider offers) every five, document expiry every six
// hours (all safe to run twice; `npm run jobs` runs them once from cron)
const relay = createOutboxRelay({ env, dbs, mailer, sms, push, logger });
const orderTimers = createOrderTimers({ dbs, logger });
let expiryTimer;
if (env.RUN_JOBS) {
  relay.start();
  orderTimers.start();
  const expiry = () =>
    runDocumentExpiry({ env, dbs, logger }).catch((err) => {
      logger.error({ reason: err.code ?? err.message }, 'document expiry failed');
      recordError(dbs, { source: 'job', ...describeError(err), where: 'document expiry', release: env.RELEASE }, { logger });
    });
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
// a promise nobody caught is recorded and the server keeps going; an uncaught exception
// leaves the process in an unknown state, so it is recorded and the process exits (the
// process manager starts a fresh one)
process.on('unhandledRejection', (err) => {
  logger.error({ reason: err?.code ?? err?.message }, 'unhandled rejection');
  recordError(dbs, { source: 'job', ...describeError(err), where: 'unhandled promise', release: env.RELEASE }, { logger });
});
process.on('uncaughtException', (err) => {
  logger.fatal({ reason: err?.code ?? err?.message }, 'uncaught exception');
  recordError(dbs, { source: 'job', ...describeError(err), where: 'uncaught exception', release: env.RELEASE }, { logger }).finally(() => process.exit(1));
  setTimeout(() => process.exit(1), 3000).unref();
});
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
