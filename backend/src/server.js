import { loadEnv } from './config/env.js';
import { createLogger } from './utils/logger.js';
import { moduleDbs, closeAll } from './db/connection.js';
import { createApp } from './app.js';
import { createMailer } from './utils/mailer.js';
import { createSms } from './utils/sms.js';
import { createOutboxRelay } from './jobs/outboxRelay.js';
import { runDocumentExpiry } from './jobs/documentExpiry.js';

const env = loadEnv();
const logger = createLogger(env);
const dbs = moduleDbs(env);
const mailer = createMailer(env);
const sms = createSms(env, mailer);
const app = createApp({ env, logger, dbs, mailer, sms });

const server = app.listen(env.PORT, '127.0.0.1', () =>
  logger.info({ port: env.PORT, mail: mailer.kind, ...(mailer.kind === 'file' ? { mailDir: mailer.dir } : {}), sms: sms.enabled }, 'api listening'),
);

// background work in the same process: emails and texts every few seconds, document expiry
// every six hours (both are safe to run twice; `npm run jobs` runs them once from cron)
const relay = createOutboxRelay({ env, dbs, mailer, sms, logger });
let expiryTimer;
if (env.RUN_JOBS) {
  relay.start();
  const expiry = () => runDocumentExpiry({ env, dbs, logger }).catch((err) => logger.error({ reason: err.code ?? err.message }, 'document expiry failed'));
  setTimeout(expiry, 15_000).unref();
  expiryTimer = setInterval(expiry, 6 * 3600_000);
  expiryTimer.unref();
}

async function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  relay.stop();
  clearInterval(expiryTimer);
  server.close(async () => {
    await closeAll(dbs);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
