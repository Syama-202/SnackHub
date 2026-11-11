// Connection pools: one per module, each logged in as that module's own database role,
// plus the migrator pool for migrations and the seed.
import knex from 'knex';
import { MODULES, MIGRATIONS_DIR, META_SCHEMA, knexOptions } from '../config/database.js';
import { withDeadlockRetry } from './retry.js';

export function migratorDb(env) {
  return knex({
    ...knexOptions(env, { user: env.DB_MIGRATOR_USER, password: env.DB_MIGRATOR_PASSWORD, schema: META_SCHEMA, max: 4 }),
    migrations: { directory: MIGRATIONS_DIR, schemaName: META_SCHEMA, tableName: 'knex_migrations', loadExtensions: ['.js'] },
  });
}

/** One module's pool, for example moduleDb(env, 'catalog'). */
export function moduleDb(env, name) {
  const m = MODULES[name];
  if (!m) throw new Error(`Unknown module "${name}"`);
  // a transaction that loses a deadlock is run again (db/retry.js)
  return withDeadlockRetry(knex(knexOptions(env, { user: m.user, password: env.DB_MODULE_PASSWORD, schema: m.schema, max: env.DB_POOL_MAX ?? 8 })));
}

export function moduleDbs(env) {
  return Object.fromEntries(Object.keys(MODULES).map((name) => [name, moduleDb(env, name)]));
}

export async function closeAll(dbs) {
  await Promise.all(Object.values(dbs).map((db) => db.destroy()));
}
