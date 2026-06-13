// npm run jobs: one pass of the background work, for cron or a scheduler when the API runs
// with RUN_JOBS=false (several processes, or a separate worker):
//   - the document expiry job (reminders, hiding shops and taking riders offline on expiry)
//   - the order clocks (shop accept timeout, rider offers, stale stock holds, payment checks)
//   - the outbox relay (emails, texts and inbox messages), until nothing more is due
//   - the clear-out of expired sessions, old notifications and old rider GPS fixes
import { loadEnv } from '../src/config/env.js';
import { createLogger } from '../src/utils/logger.js';
import { moduleDbs, closeAll } from '../src/db/connection.js';
import { createMailer } from '../src/utils/mailer.js';
import { createSms } from '../src/utils/sms.js';
import { createOutboxRelay } from '../src/jobs/outboxRelay.js';
import { createPush } from '../src/utils/push.js';
import { runDocumentExpiry } from '../src/jobs/documentExpiry.js';
import { runOrderTimers } from '../src/jobs/orderTimers.js';
import { runPurge } from '../src/jobs/purge.js';
import { Emitter } from '@socket.io/redis-emitter';
import { createRedis, closeRedis, safePublisher } from '../src/utils/redis.js';
import { realtime } from '../src/utils/realtime.js';
import { createPhonePe } from '../src/utils/phonepe.js';
import { gateway } from '../src/utils/payments.js';

const env = loadEnv();
const logger = createLogger(env);
const dbs = moduleDbs(env);
// the payment checks ask the provider directly
gateway.use(createPhonePe(env, { logger }));
// live hints from this worker reach the apps through the API's Socket.IO servers (Redis)
const redis = createRedis(env, logger, { name: 'jobs', queue: true });
if (redis) {
  const emitter = new Emitter(safePublisher(redis, { queue: true }));
  realtime.use({ send: (rooms, event) => emitter.to(rooms).emit('change', event), kick: (room) => emitter.in(room).disconnectSockets(true) });
}
try {
  const expiry = await runDocumentExpiry({ env, dbs, logger });
  const timers = await runOrderTimers({ dbs, logger });
  const mailer = createMailer(env);
  const relay = createOutboxRelay({ env, dbs, mailer, sms: createSms(env, mailer), push: createPush(env, { logger }), logger });
  let sent = 0;
  for (let n = await relay.runOnce(); n > 0; n = await relay.runOnce()) sent += n;
  const purged = await runPurge({ dbs });
  console.log(`expiry: ${JSON.stringify(expiry)}; orders: ${JSON.stringify(timers)}; messages sent: ${sent}; purged: ${JSON.stringify(purged)}`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await closeAll(dbs);
  await closeRedis(redis);
}
