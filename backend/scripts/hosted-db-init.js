// npm run db:hosted (from backend/): prepares a hosted MySQL 8 (Aiven, doc 15.0) once, the same
// way local-db-init.js prepares the local one: the snackhub schema for the migration records,
// one schema per module, one least-privilege user per module and the migrator. Then it checks
// that the migrator may create triggers (the order address, the payment ledger and the cash
// deposits are guarded by them), and says what to change if not.
//
// Reads backend/.env.production (never committed): DB_HOST, DB_PORT, DB_SSL, DB_SSL_CA,
// DB_MIGRATOR_USER, DB_MIGRATOR_PASSWORD, DB_MODULE_PASSWORD, and DB_ADMIN_USER (the
// provider's admin account, avnadmin on Aiven). Asks for the admin password once, hidden, and
// never stores or prints it or any other password. Safe to run again.
import mysql from 'mysql2/promise';
import { askHidden } from './askHidden.js';
import { loadDbEnv } from '../src/config/env.js';
import { MODULES } from '../src/config/database.js';

const env = loadDbEnv();
const ADMIN = process.env.DB_ADMIN_USER || 'avnadmin';
const ssl = env.DB_SSL ? { rejectUnauthorized: true, ...(env.DB_SSL_CA && { ca: env.DB_SSL_CA.replace(/\\n/g, '\n') }) } : undefined;
const where = `${env.DB_HOST}:${env.DB_PORT}`;
if (!ssl) console.warn('DB_SSL is off: a hosted database should be reached over TLS (DB_SSL=true).');

const password = await askHidden(`Password for ${ADMIN} on ${where} (input hidden): `);
const admin = await mysql.createConnection({ host: env.DB_HOST, port: env.DB_PORT, user: ADMIN, password, ssl }).catch((err) => {
  console.error(`Could not sign in as ${ADMIN} on ${where}: ${err.code ?? err.message}`);
  process.exit(1);
});

const SCHEMAS = Object.values(MODULES).map((m) => m.database);
const migrator = env.DB_MIGRATOR_USER;
// the API connects from the host's servers, whose addresses change: any host, TLS required
const account = (user) => `'${user}'@'%'`;
const requireTls = ssl ? ' REQUIRE SSL' : '';

/** Creates a throwaway trigger as the migrator; null when allowed, else the refusal. */
async function triggerProbe() {
  const m = await mysql.createConnection({ host: env.DB_HOST, port: env.DB_PORT, user: migrator, password: env.DB_MIGRATOR_PASSWORD, database: 'snackhub', ssl });
  try {
    await m.query('CREATE TABLE IF NOT EXISTS setup_trigger_probe (id INT PRIMARY KEY)');
    await m.query('DROP TRIGGER IF EXISTS setup_trigger_probe_bi');
    await m.query('CREATE TRIGGER setup_trigger_probe_bi BEFORE INSERT ON setup_trigger_probe FOR EACH ROW SET NEW.id = NEW.id');
    return null;
  } catch (err) {
    return err;
  } finally {
    await m.query('DROP TRIGGER IF EXISTS setup_trigger_probe_bi').catch(() => {});
    await m.query('DROP TABLE IF EXISTS setup_trigger_probe').catch(() => {});
    await m.end();
  }
}

try {
  const run = (sql, params = []) => admin.query(sql, params);
  await run('CREATE DATABASE IF NOT EXISTS snackhub CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
  for (const s of SCHEMAS) await run(`CREATE DATABASE IF NOT EXISTS \`${s}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);

  await run(`CREATE USER IF NOT EXISTS ${account(migrator)} IDENTIFIED BY ?${requireTls}`, [env.DB_MIGRATOR_PASSWORD]);
  await run(`ALTER USER ${account(migrator)} IDENTIFIED BY ?${requireTls}`, [env.DB_MIGRATOR_PASSWORD]);
  for (const s of ['snackhub', ...SCHEMAS]) await run(`GRANT ALL PRIVILEGES ON \`${s}\`.* TO ${account(migrator)}`);

  for (const { user, database } of Object.values(MODULES)) {
    await run(`CREATE USER IF NOT EXISTS ${account(user)} IDENTIFIED BY ?${requireTls}`, [env.DB_MODULE_PASSWORD]);
    await run(`ALTER USER ${account(user)} IDENTIFIED BY ?${requireTls}`, [env.DB_MODULE_PASSWORD]);
    await run(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${database}\`.* TO ${account(user)}`);
  }
  await run('FLUSH PRIVILEGES').catch(() => {}); // not every provider allows it; grants apply at once anyway
  console.log(`Schemas and users ready on ${where}: snackhub, ${SCHEMAS.join(', ')}`);

  // triggers: with binary logging on, MySQL refuses them unless log_bin_trust_function_creators is on
  let refused = await triggerProbe();
  if (refused) {
    await run('SET GLOBAL log_bin_trust_function_creators = 1').catch(() => {});
    refused = await triggerProbe();
  }
  if (refused) {
    console.error(`The migrator may not create triggers here (${refused.code ?? refused.message}).`);
    console.error('Turn on log_bin_trust_function_creators for this MySQL (on Aiven: the service > Advanced configuration), then run this again.');
    process.exitCode = 1;
  } else {
    console.log('Triggers: allowed. Next: npm run migrate:hosted, then npm run seed:hosted.');
  }
} catch (err) {
  console.error(`Setup failed: ${err.code ?? ''} ${err.message}`);
  process.exitCode = 1;
} finally {
  await admin.end();
}
