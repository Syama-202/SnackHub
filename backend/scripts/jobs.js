// npm run jobs: one pass of the background work, for cron or a scheduler when the API runs
// with RUN_JOBS=false (several processes, or a separate worker):
//   - the document expiry job (reminders, hiding shops and taking riders offline on expiry)
//   - the outbox relay (emails and texts), until nothing more is due
import { loadEnv } from '../src/config/env.js';
import { createLogger } from '../src/utils/logger.js';
import { moduleDbs, closeAll } from '../src/db/connection.js';
import { createMailer } from '../src/utils/mailer.js';
import { createSms } from '../src/utils/sms.js';
import { createOutboxRelay } from '../src/jobs/outboxRelay.js';
import { runDocumentExpiry } from '../src/jobs/documentExpiry.js';

const env = loadEnv();
const logger = createLogger(env);
const dbs = moduleDbs(env);
try {
  const expiry = await runDocumentExpiry({ env, dbs, logger });
  const mailer = createMailer(env);
  const relay = createOutboxRelay({ env, dbs, mailer, sms: createSms(env, mailer), logger });
  let sent = 0;
  for (let n = await relay.runOnce(); n > 0; n = await relay.runOnce()) sent += n;
  console.log(`expiry: ${JSON.stringify(expiry)}; messages sent: ${sent}`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await closeAll(dbs);
}
