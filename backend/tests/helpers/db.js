// Test database access. Every test runs inside a transaction that is rolled back, so the
// seeded demo data is never changed. If PostgreSQL is not running, the database suites skip.
import knex from 'knex';
import { loadDbEnv as loadEnv } from '../../src/config/env.js';
import { knexOptions } from '../../src/config/database.js';
import { migratorDb } from '../../src/db/connection.js';
import { PG } from '../../src/db/errors.js';

export async function connect() {
  let env;
  try {
    env = loadEnv();
  } catch {
    return { db: null, reason: 'backend/.env missing or incomplete (run npm run setup)' };
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
    return { db: null, reason: `PostgreSQL not reachable (${err.code ?? err.message}); install it and run npm run db:local` };
  }
}

// one module role, to prove a module cannot reach another module's schema
export function moduleDb(env, user, schema) {
  return knex({ ...knexOptions(env, { user, password: env.DB_MODULE_PASSWORD, schema, max: 1 }) });
}

// PostgreSQL error codes (SQLSTATE) the constraint tests expect, under the names they use
export const ER = {
  DUP_ENTRY: PG.UNIQUE,
  NO_REFERENCED_ROW: PG.FOREIGN_KEY,
  ROW_IS_REFERENCED: PG.FOREIGN_KEY,
  CHECK_VIOLATED: PG.CHECK,
  SIGNAL: PG.RAISED,
  TABLE_ACCESS_DENIED: PG.NO_PERMISSION,
  BAD_NULL: PG.NOT_NULL,
  // a value outside an allowed list: a CHECK in PostgreSQL (MySQL truncated ENUMs)
  TRUNCATED: PG.CHECK,
};

export async function expectError(promise, code) {
  try {
    await promise;
  } catch (err) {
    if (err.code === code) return err;
    throw new Error(`expected database error ${code}, got ${err.code}: ${err.message}`);
  }
  throw new Error(`expected database error ${code}, but the statement succeeded`);
}

/**
 * In PostgreSQL a failed statement spoils the rest of its transaction. A test runs the whole
 * app inside one transaction per module and often provokes errors on purpose (a duplicate, a
 * refused check), then carries on. So every statement sent straight on the test transaction
 * first sets a savepoint, and a failing one is rolled back to it: the error still reaches the
 * code that caused it, and the transaction stays usable. Statements are sent one at a time so
 * a rollback undoes only the statement that failed. In production each request has its own
 * connection and short transactions, so this only exists in the tests.
 */
export function survivable(trx) {
  const client = trx.client;
  const run = client._query.bind(client);
  let n = 0;
  let queue = Promise.resolve();
  client._query = (conn, obj) => {
    const sql = typeof obj === 'string' ? obj : obj.sql;
    if (/^\s*(SAVEPOINT|RELEASE|ROLLBACK|BEGIN|COMMIT)\b/i.test(sql)) return run(conn, obj);
    const name = `harness_${++n}`;
    const task = queue.then(async () => {
      await run(conn, { sql: `SAVEPOINT ${name}`, bindings: [] });
      try {
        return await run(conn, obj);
      } catch (err) {
        await run(conn, { sql: `ROLLBACK TO SAVEPOINT ${name}`, bindings: [] }).catch(() => {});
        throw err;
      }
    });
    queue = task.catch(() => {});
    return task;
  };
  return trx;
}
