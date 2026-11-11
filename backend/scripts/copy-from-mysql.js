// One-off: copies every row from the old MySQL database into the new PostgreSQL one, so
// accounts (and their authenticator secrets), shops, orders and history move across as they are.
//
//   node --env-file=.env.production --env-file=.env.mysql scripts/copy-from-mysql.js --yes
//
// Target: the PostgreSQL in DB_* (backend/.env.production), already set up with db:hosted and
// migrate:hosted, and NOT seeded. Its module tables are emptied first, so run it only on the new
// database. Source: the MySQL in .env.mysql (never committed) with MYSQL_HOST, MYSQL_PORT,
// MYSQL_USER, MYSQL_PASSWORD, MYSQL_SSL=true and MYSQL_SSL_CA (the CA certificate, as for the
// old DB_SSL_CA). The MySQL migrator user can read every module schema.
//
// Only reads from MySQL. Prints table names and row counts, never a value or a password.
// MFA_KEY must stay the same on the new server, or the copied secrets cannot be read.
import mysql from 'mysql2/promise';
import knex from 'knex';
import { loadDbEnv } from '../src/config/env.js';
import { MODULES, knexOptions } from '../src/config/database.js';
import { migratorDb } from '../src/db/connection.js';

if (!process.argv.includes('--yes')) {
  console.error('This empties the module tables of the PostgreSQL in DB_* and fills them from MySQL. Add --yes to go ahead.');
  process.exit(1);
}
const need = ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD'].filter((k) => !process.env[k]);
if (need.length) {
  console.error(`Missing in .env.mysql: ${need.join(', ')}`);
  process.exit(1);
}

const env = loadDbEnv();
const target = knex(knexOptions(env, { user: env.DB_MIGRATOR_USER, password: env.DB_MIGRATOR_PASSWORD, max: 2 }));
const sslOn = process.env.MYSQL_SSL === 'true';
const source = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  timezone: 'Z',
  decimalNumbers: true,
  supportBigNumbers: true,
  ...(sslOn && { ssl: { rejectUnauthorized: true, ...(process.env.MYSQL_SSL_CA && { ca: process.env.MYSQL_SSL_CA.replace(/\\n/g, '\n') }) } }),
});

const BATCH = 500;
const schemas = Object.values(MODULES).map((m) => m.schema);

/** The tables of a schema with parents before children, so foreign keys are met on insert. */
async function tablesInOrder(schema) {
  const { rows: tables } = await target.raw("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'", [schema]);
  const { rows: refs } = await target.raw(
    `SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
       FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'f' AND n.nspname = ?`,
    [schema],
  );
  const bare = (q) => q.split('.').pop();
  const deps = new Map(tables.map((t) => [t.name, new Set()]));
  for (const r of refs) if (bare(r.child) !== bare(r.parent)) deps.get(bare(r.child))?.add(bare(r.parent));
  const order = [];
  const seen = new Set();
  const visit = (t) => {
    if (seen.has(t)) return;
    seen.add(t);
    for (const p of deps.get(t) ?? []) visit(p);
    order.push(t);
  };
  for (const t of [...deps.keys()].sort()) visit(t);
  return order;
}

try {
  const migrator = migratorDb(env);
  const [, pending] = await migrator.migrate.list();
  await migrator.destroy();
  if (pending.length) throw new Error(`${pending.length} migrations are not applied on the target yet. Run npm run migrate:hosted first.`);

  console.log(`Copying into ${env.DB_HOST}/${env.DB_NAME} from ${process.env.MYSQL_HOST}.`);
  const plan = [];
  for (const schema of schemas) for (const table of await tablesInOrder(schema)) plan.push([schema, table]);
  await target.raw(`TRUNCATE ${plan.map(([s, t]) => `${s}.${t}`).join(', ')} RESTART IDENTITY CASCADE`);

  let total = 0;
  for (const [schema, table] of plan) {
    const { rows: cols } = await target.raw(
      `SELECT column_name AS name, data_type AS type, is_identity = 'YES' AS identity
         FROM information_schema.columns
        WHERE table_schema = ? AND table_name = ? AND is_generated = 'NEVER'
        ORDER BY ordinal_position`,
      [schema, table],
    );
    // only the columns the old database has: one that never got a later migration (an order's
    // note, say) leaves the new column at its default, and a table it never had is skipped
    const [have] = await source.query('SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [schema, table]);
    const inSource = new Set(have.map((c) => c.name));
    if (!inSource.size) {
      console.log(`${`${schema}.${table}`.padEnd(34)} not in MySQL, left empty`);
      continue;
    }
    const names = cols.map((c) => c.name).filter((c) => inSource.has(c));
    const json = new Set(cols.filter((c) => c.type === 'jsonb').map((c) => c.name));
    const [pk] = await source.query("SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY ORDINAL_POSITION) AS cols FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'", [schema, table]);
    const orderBy = (pk[0]?.cols ?? names[0]).split(',').map((c) => `\`${c}\``).join(', ');
    let copied = 0;
    for (let offset = 0; ; offset += BATCH) {
      const [rows] = await source.query(`SELECT ${names.map((c) => `\`${c}\``).join(', ')} FROM \`${schema}\`.\`${table}\` ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [BATCH, offset]);
      if (!rows.length) break;
      const out = rows.map((r) => Object.fromEntries(names.map((c) => [c, json.has(c) && r[c] !== null && typeof r[c] !== 'string' ? JSON.stringify(r[c]) : r[c]])));
      await target(`${schema}.${table}`).insert(out);
      copied += rows.length;
      if (rows.length < BATCH) break;
    }
    // new rows continue after the copied ids
    if (cols.some((c) => c.name === 'id' && c.identity) && copied) {
      await target.raw(`SELECT setval(pg_get_serial_sequence(?, 'id'), (SELECT MAX(id) FROM ${schema}.${table}))`, [`${schema}.${table}`]);
    }
    const [[{ n }]] = await source.query(`SELECT COUNT(*) AS n FROM \`${schema}\`.\`${table}\``);
    const [{ m }] = await target(`${schema}.${table}`).count({ m: '*' });
    if (Number(n) !== Number(m)) throw new Error(`${schema}.${table}: MySQL has ${n} rows, PostgreSQL ${m} after the copy`);
    console.log(`${`${schema}.${table}`.padEnd(34)} ${copied}`);
    total += copied;
  }
  console.log(`Done: ${total} rows in ${plan.length} tables, every count checked.`);
} catch (err) {
  console.error(`Copy failed: ${err.code ?? ''} ${err.message}`);
  process.exitCode = 1;
} finally {
  await source.end();
  await target.destroy();
}
