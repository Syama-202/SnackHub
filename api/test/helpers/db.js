// Test database access. Every test runs inside a transaction that is rolled back, so the
// seeded demo data is never changed. If MySQL is not running, the database suites skip.
import knex from 'knex';
import { loadEnv } from '../../src/config/env.js';
import { migratorDb } from '../../src/db/knex.js';

export async function connect() {
  let env;
  try {
    env = loadEnv();
  } catch {
    return { db: null, reason: 'api/.env missing or incomplete (run npm run setup)' };
  }
  const db = migratorDb(env);
  try {
    await db.raw('SELECT 1');
    const [, pending] = await db.migrate.list();
    if (pending.length) {
      await db.destroy();
      return { db: null, reason: `${pending.length} migrations pending (run npm run migrate)` };
    }
    return { db, env };
  } catch (err) {
    await db.destroy();
    return { db: null, reason: `MySQL not reachable (${err.code ?? err.message}); start it with npm run db:up` };
  }
}

// one module user, to prove a module cannot reach another module's schema
export function moduleDb(env, user, database) {
  return knex({ client: 'mysql2', connection: { host: env.DB_HOST, port: env.DB_PORT, user, password: env.DB_MODULE_PASSWORD, database }, pool: { min: 0, max: 1 } });
}

// MySQL error numbers the constraint tests expect
export const ER = {
  DUP_ENTRY: 1062,
  NO_REFERENCED_ROW: 1452,
  ROW_IS_REFERENCED: 1451,
  CHECK_VIOLATED: 3819,
  SIGNAL: 1644,
  TABLE_ACCESS_DENIED: 1142,
  BAD_NULL: 1048,
  TRUNCATED: 1265,
};

export async function expectError(promise, errno) {
  try {
    await promise;
  } catch (err) {
    if (err.errno === errno) return err;
    throw new Error(`expected MySQL error ${errno}, got ${err.errno}: ${err.message}`);
  }
  throw new Error(`expected MySQL error ${errno}, but the statement succeeded`);
}
