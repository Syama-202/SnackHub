// Connection pools: one per module, each logged in as that module's own database user,
// plus the migrator pool for migrations and the seed.
import knex from 'knex';
import { MODULES, MIGRATIONS_DIR, knexOptions } from '../config/database.js';

export function migratorDb(env) {
  return knex({
    ...knexOptions(env, { user: env.DB_MIGRATOR_USER, password: env.DB_MIGRATOR_PASSWORD, database: 'snackhub', max: 4 }),
    migrations: { directory: MIGRATIONS_DIR, tableName: 'knex_migrations', loadExtensions: ['.js'] },
  });
}

/** One module's pool, for example moduleDb(env, 'catalog'). */
export function moduleDb(env, name) {
  const m = MODULES[name];
  if (!m) throw new Error(`Unknown module "${name}"`);
  return knex(knexOptions(env, { user: m.user, password: env.DB_MODULE_PASSWORD, database: m.database, max: 8 }));
}

export function moduleDbs(env) {
  return Object.fromEntries(Object.keys(MODULES).map((name) => [name, moduleDb(env, name)]));
}

export async function closeAll(dbs) {
  await Promise.all(Object.values(dbs).map((db) => db.destroy()));
}
