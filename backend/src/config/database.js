// Database settings (doc 12): one schema per module, and one MySQL user per module that
// can only reach its own schema. The migrator user owns the DDL and is used only by the
// migrations and the seed.
import { fileURLToPath } from 'node:url';

export const MODULES = {
  identity: { user: 'sh_identity', database: 'identity' },
  catalog: { user: 'sh_catalog', database: 'catalog' },
  ordering: { user: 'sh_order', database: 'ordering' },
  dispatch: { user: 'sh_dispatch', database: 'dispatch' },
  payment: { user: 'sh_payment', database: 'payment' },
  notify: { user: 'sh_notify', database: 'notify' },
};

export const MIGRATIONS_DIR = fileURLToPath(new URL('../db/migrations', import.meta.url));

/** Knex options for one connection pool. */
export function knexOptions(env, { user, password, database, max }) {
  return {
    client: 'mysql2',
    connection: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      user,
      password,
      database,
      charset: 'utf8mb4',
      timezone: 'Z',
      // DECIMAL lat/lng come back as numbers; money is INT paise so no precision is lost
      decimalNumbers: true,
      supportBigNumbers: true,
      // a hosted MySQL over TLS, the server's certificate always checked
      ...(env.DB_SSL && { ssl: { rejectUnauthorized: true, ...(env.DB_SSL_CA && { ca: env.DB_SSL_CA.replace(/\\n/g, '\n') }) } }),
    },
    // every session in UTC so NOW() and DATETIME columns agree with the app
    pool: { min: 0, max, afterCreate: (conn, done) => conn.query("SET time_zone = '+00:00'", (err) => done(err, conn)) },
  };
}
