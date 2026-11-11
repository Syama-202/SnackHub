// npm run db:local (from the repo root): prepares the PostgreSQL already installed on this
// machine (port 5432), so the backend runs without Docker: the snackhub database, one schema
// and one least-privilege role per module, and the migrator that owns them (db-roles.js).
//
// Asks for the password of the PostgreSQL superuser (postgres) once, with hidden input, and
// never stores or prints it. The role passwords come from infra/.env (created by
// `npm run setup`). Finally points backend/.env at this server. Safe to run again.
//
// For CI and other scripted runs, every input can come from the environment instead:
// PG_ADMIN_USER, PG_ADMIN_PASSWORD, LOCAL_PG_PORT, MIGRATOR_PASSWORD, MODULE_DB_PASSWORD,
// DB_NAME, and SKIP_ENV_UPDATE=1 to leave backend/.env alone.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { askHidden } from './askHidden.js';
import { adminClient, ensureRoles, ensureSchemas } from './db-roles.js';

// --docker: the PostgreSQL container from infra/docker-compose.yml (port 5433, its password in infra/.env)
const DOCKER = process.argv.includes('--docker');
const PORT = Number(process.env.LOCAL_PG_PORT ?? (DOCKER ? 5433 : 5432));
const HOST = process.env.LOCAL_PG_HOST ?? '127.0.0.1';
const ADMIN = process.env.PG_ADMIN_USER ?? 'postgres';
const DATABASE = process.env.DB_NAME ?? 'snackhub';
const MIGRATOR = 'sh_migrator';

const infraEnv = new URL('../../infra/.env', import.meta.url);
const apiEnv = new URL('../.env', import.meta.url);
const parse = (text) => Object.fromEntries(text.split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const fromInfra = existsSync(infraEnv) ? parse(readFileSync(infraEnv, 'utf8')) : {};
const migratorPassword = process.env.MIGRATOR_PASSWORD ?? fromInfra.MIGRATOR_PASSWORD;
const modulePassword = process.env.MODULE_DB_PASSWORD ?? fromInfra.MODULE_DB_PASSWORD;
if (!migratorPassword || !modulePassword) {
  console.error('Run `npm run setup` first: it creates infra/.env and backend/.env with local passwords.');
  process.exit(1);
}

const where = `${HOST}:${PORT}`;
const adminPassword = process.env.PG_ADMIN_PASSWORD ?? (DOCKER ? fromInfra.POSTGRES_PASSWORD : undefined) ?? (await askHidden(`PostgreSQL password for ${ADMIN} on ${where} (input hidden): `));
const connect = async (database) => {
  const c = adminClient({ host: HOST, port: PORT, user: ADMIN, password: adminPassword, database });
  await c.connect().catch((err) => {
    console.error(`Could not sign in as ${ADMIN} on ${where}: ${err.code ?? err.message}. Is PostgreSQL running, and is the password right?`);
    process.exit(1);
  });
  return c;
};

try {
  // roles and the database live at the server level, so this part uses the maintenance db
  const server = await connect('postgres');
  try {
    await ensureRoles(server, { migrator: MIGRATOR, migratorPassword, modulePassword });
    const { rowCount } = await server.query('SELECT 1 FROM pg_database WHERE datname = $1', [DATABASE]);
    if (!rowCount) await server.query(`CREATE DATABASE ${DATABASE} OWNER ${MIGRATOR} ENCODING 'UTF8' TEMPLATE template0`);
  } finally {
    await server.end();
  }
  const db = await connect(DATABASE);
  try {
    await ensureSchemas(db, { database: DATABASE, migrator: MIGRATOR });
  } finally {
    await db.end();
  }
  console.log(`Database ${DATABASE} ready on ${where}: schemas and roles for every module, owned by ${MIGRATOR}.`);
} catch (err) {
  console.error(`Setup failed: ${err.code ?? ''} ${err.message}`);
  process.exit(1);
}

if (process.env.SKIP_ENV_UPDATE !== '1' && existsSync(apiEnv)) {
  // point the API at this server; only the connection lines change
  let text = readFileSync(apiEnv, 'utf8');
  const set = (key, value) => {
    text = new RegExp(`^${key}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`) : `${text.replace(/\s*$/, '')}\n${key}=${value}\n`;
  };
  set('DB_HOST', HOST);
  set('DB_PORT', String(PORT));
  set('DB_NAME', DATABASE);
  writeFileSync(apiEnv, text);
  console.log(`${fileURLToPath(apiEnv)} now uses ${where}, database ${DATABASE}`);
}
