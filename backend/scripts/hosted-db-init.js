// npm run db:hosted (from backend/): prepares a hosted PostgreSQL (Neon, doc 15.0) once, the
// same way local-db-init.js prepares the local one: one schema and one least-privilege role
// per module, the migrator that owns them, and the meta schema for the migration records.
//
// Reads backend/.env.production (never committed): DB_HOST, DB_PORT, DB_NAME, DB_SSL,
// DB_SSL_CA, DB_MIGRATOR_USER, DB_MIGRATOR_PASSWORD, DB_MODULE_PASSWORD, and DB_ADMIN_USER
// (the provider's owner role, neondb_owner on Neon). Asks for the owner's password once,
// hidden, and never stores or prints it or any other password. Safe to run again.
//
// The database itself (DB_NAME) must exist already: Neon makes `neondb` with every project,
// and more can be added in its console.
import { askHidden } from './askHidden.js';
import { adminClient, ensureRoles, ensureSchemas } from './db-roles.js';
import { loadDbEnv } from '../src/config/env.js';

const env = loadDbEnv();
const ADMIN = process.env.DB_ADMIN_USER || 'neondb_owner';
const where = `${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`;
if (!env.DB_SSL) console.warn('DB_SSL is off: a hosted database should be reached over TLS (DB_SSL=true).');
if (/-pooler\./.test(env.DB_HOST)) {
  console.error('DB_HOST is a pooled ("-pooler") address. Use the direct one (without -pooler): the API sets its time zone and search path per connection.');
  process.exit(1);
}

const password = await askHidden(`Password for ${ADMIN} on ${where} (input hidden): `);
const admin = adminClient({ host: env.DB_HOST, port: env.DB_PORT, user: ADMIN, password, database: env.DB_NAME, ssl: env.DB_SSL, ca: env.DB_SSL_CA });
await admin.connect().catch((err) => {
  console.error(`Could not sign in as ${ADMIN} on ${where}: ${err.code ?? err.message}`);
  process.exit(1);
});

try {
  await ensureRoles(admin, { migrator: env.DB_MIGRATOR_USER, migratorPassword: env.DB_MIGRATOR_PASSWORD, modulePassword: env.DB_MODULE_PASSWORD });
  await ensureSchemas(admin, { database: env.DB_NAME, migrator: env.DB_MIGRATOR_USER });
  console.log(`Schemas and roles ready on ${where}. Next: npm run migrate:hosted, then npm run seed:hosted (or copy your data, see copy-from-mysql.js).`);
} catch (err) {
  console.error(`Setup failed: ${err.code ?? ''} ${err.message}`);
  if (err.code === '42501') console.error(`${ADMIN} is not allowed to do this. Use the project's owner role (DB_ADMIN_USER).`);
  process.exitCode = 1;
} finally {
  await admin.end();
}
