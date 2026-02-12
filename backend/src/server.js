import { loadEnv } from './config/env.js';
import { createLogger } from './utils/logger.js';
import { moduleDbs, closeAll } from './db/connection.js';
import { createApp } from './app.js';

const env = loadEnv();
const logger = createLogger(env);
const dbs = moduleDbs(env);
const app = createApp({ env, logger, dbs });

const server = app.listen(env.PORT, '127.0.0.1', () => logger.info({ port: env.PORT }, 'api listening'));

async function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    await closeAll(dbs);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
