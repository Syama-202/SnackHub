// One Knex pool per module, each logged in as that module's own database user, so a
// module can only reach its own schema (doc 12). The migrator pool is for migrations
// and the seed only.
import { fileURLToPath } from 'node:url';
import knex from 'knex';

export const MODULES = {
  identity: { user: 'sh_identity', database: 'identity' },
  catalog: { user: 'sh_catalog', database: 'catalog' },
  ordering: { user: 'sh_order', database: 'ordering' },
  dispatch: { user: 'sh_dispatch', database: 'dispatch' },
  payment: { user: 'sh_payment', database: 'payment' },
  notify: { user: 'sh_notify', database: 'notify' },
};

const base = (env, user, password, database, pool) => ({
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
  },
  // every session in UTC so NOW() and DATETIME columns agree with the app
  pool: { ...pool, afterCreate: (conn, done) => conn.query("SET time_zone = '+00:00'", (err) => done(err, conn)) },
});

export function migratorDb(env) {
  return knex({
    ...base(env, env.DB_MIGRATOR_USER, env.DB_MIGRATOR_PASSWORD, 'snackhub', { min: 0, max: 4 }),
    migrations: { directory: fileURLToPath(new URL('../../migrations', import.meta.url)), tableName: 'knex_migrations', loadExtensions: ['.js'] },
  });
}

export function moduleDbs(env) {
  return Object.fromEntries(
    Object.entries(MODULES).map(([name, m]) => [name, knex(base(env, m.user, env.DB_MODULE_PASSWORD, m.database, { min: 0, max: 8 }))]),
  );
}

export async function closeAll(dbs) {
  await Promise.all(Object.values(dbs).map((db) => db.destroy()));
}
