// PostgreSQL error codes the code reacts to (SQLSTATE, in err.code), in one place.
export const PG = {
  UNIQUE: '23505',
  FOREIGN_KEY: '23503',
  CHECK: '23514',
  NOT_NULL: '23502',
  DEADLOCK: '40P01',
  SERIALIZATION: '40001',
  // RAISE EXCEPTION in a trigger (the append-only tables, an order's frozen address)
  RAISED: 'P0001',
  NO_PERMISSION: '42501',
};

/** A row with the same unique key exists (MySQL called it ER_DUP_ENTRY). */
export const isUniqueViolation = (err) => err?.code === PG.UNIQUE;

/**
 * Runs fn(db) so that a failing statement can be caught and the work carried on. In
 * PostgreSQL an error inside a transaction spoils the rest of it, so when db is a transaction
 * the statement runs in its own savepoint and only that part is undone. Outside a transaction
 * every statement is its own anyway.
 */
export const attempt = (db, fn) => (db.isTransaction ? db.transaction((sp) => fn(sp)) : fn(db));
