// Database settings (doc 12): one PostgreSQL database (DB_NAME) with one schema per module,
// and one role per module that can only reach its own schema. The migrator role owns the
// schemas and their tables and is used only by the migrations and the seed.
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// `schema` is the PostgreSQL schema the module's tables live in (MySQL called it a database)
export const MODULES = {
  identity: { user: 'sh_identity', schema: 'identity' },
  catalog: { user: 'sh_catalog', schema: 'catalog' },
  ordering: { user: 'sh_order', schema: 'ordering' },
  dispatch: { user: 'sh_dispatch', schema: 'dispatch' },
  payment: { user: 'sh_payment', schema: 'payment' },
  notify: { user: 'sh_notify', schema: 'notify' },
};
// where knex keeps its list of applied migrations
export const META_SCHEMA = 'meta';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../db/migrations', import.meta.url));

// Values come back in the shapes the code was written for:
// - BIGINT (ids, COUNT(*)) as numbers, not strings; every id and count stays far below 2^53
// - NUMERIC (latitude, longitude, scores, SUM of paise) as numbers
// - DATE as a Date at midnight UTC, the calendar day itself whatever the server's time zone
// and Dates sent as parameters are written in UTC.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => new Date(`${v}T00:00:00.000Z`));
pg.defaults.parseInputDatesAsUTC = true;

/** Knex options for one connection pool. schema sets the search path (a module's own schema). */
export function knexOptions(env, { user, password, schema, max }) {
  return {
    client: 'pg',
    connection: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      user,
      password,
      database: env.DB_NAME,
      // a hosted PostgreSQL over TLS, the server's certificate always checked
      ...(env.DB_SSL && { ssl: { rejectUnauthorized: true, ...(env.DB_SSL_CA && { ca: env.DB_SSL_CA.replace(/\\n/g, '\n') }) } }),
      // a statement that runs this long has gone wrong; it is stopped instead of holding a pool slot
      statement_timeout: 30_000,
      application_name: `snackhub-${user}`,
    },
    ...(schema && { searchPath: [schema] }),
    // every session in UTC so now() and the timestamps agree with the app
    pool: { min: 0, max, afterCreate: (conn, done) => conn.query("SET TIME ZONE 'UTC'", (err) => done(err, conn)) },
  };
}
