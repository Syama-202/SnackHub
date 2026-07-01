// Deadlock retry for every transaction (doc 10.8). When two transactions lock the same rows
// in opposite orders, MySQL rolls one of them back whole with ER_LOCK_DEADLOCK; running it
// again is safe because transactions here only touch the database (anything that reaches the
// outside world goes through the outbox after the commit). Only the callback form is retried:
// a transaction opened without a callback is managed by its caller.

const RETRYABLE = new Set(['ER_LOCK_DEADLOCK']);
export const DEADLOCK_TRIES = 3;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs fn again (up to `tries` times in all) while it fails with a deadlock. */
export async function retryOnDeadlock(fn, { tries = DEADLOCK_TRIES, onRetry, wait = pause } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (!RETRYABLE.has(err?.code) || attempt >= tries) throw err;
      onRetry?.(attempt, err);
      // a short random wait, so the two transactions do not collide again at once
      await wait(15 * attempt + Math.floor(Math.random() * 25));
    }
  }
}

/** Makes db.transaction(callback) retry on deadlock. Returns the same knex instance. */
export function withDeadlockRetry(db, options) {
  const original = db.transaction.bind(db);
  Object.defineProperty(db, 'transaction', {
    configurable: true,
    value(fn, config) {
      if (typeof fn !== 'function') return original(fn, config);
      return retryOnDeadlock(() => original(fn, config), options);
    },
  });
  return db;
}
