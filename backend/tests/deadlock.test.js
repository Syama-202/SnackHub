// Deadlock retry (src/db/retry.js): a transaction MySQL picks as the deadlock victim runs again
// and the caller never sees the error. The database test makes a real deadlock: two
// transactions lock the same two products in opposite orders. It only locks rows (SELECT ...
// FOR UPDATE) and changes nothing.
import { afterAll, describe, expect, it } from 'vitest';
import { retryOnDeadlock } from '../src/db/retry.js';
import { moduleDb } from '../src/db/connection.js';
import { connect } from './helpers/db.js';

const deadlock = () => Object.assign(new Error('Deadlock found when trying to get lock'), { code: 'ER_LOCK_DEADLOCK', errno: 1213 });
const noWait = () => Promise.resolve();

describe('retryOnDeadlock', () => {
  it('runs the work again after a deadlock', async () => {
    let calls = 0;
    const out = await retryOnDeadlock(async () => {
      calls += 1;
      if (calls < 3) throw deadlock();
      return 'done';
    }, { wait: noWait });
    expect(out).toBe('done');
    expect(calls).toBe(3);
  });

  it('gives up after three tries and passes the deadlock on', async () => {
    let calls = 0;
    await expect(retryOnDeadlock(async () => {
      calls += 1;
      throw deadlock();
    }, { wait: noWait })).rejects.toMatchObject({ code: 'ER_LOCK_DEADLOCK' });
    expect(calls).toBe(3);
  });

  it('does not retry any other error', async () => {
    let calls = 0;
    await expect(retryOnDeadlock(async () => {
      calls += 1;
      throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
    }, { wait: noWait })).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    expect(calls).toBe(1);
  });
});

const conn = await connect();
const db = conn.db ? moduleDb(conn.env, 'catalog') : null;
afterAll(async () => {
  await db?.destroy();
  await conn.db?.destroy();
});

describe.skipIf(!conn.db)('a real deadlock', () => {
  it('both transactions finish: the victim is run again', async () => {
    const [a, b] = await db('products').orderBy('id').limit(2).pluck('id');
    expect(b).toBeDefined();

    // each side takes its first lock, waits for the other to take its first, then asks for
    // the other's row: MySQL sees the cycle and rolls one back
    let tookA;
    let tookB;
    const aLocked = new Promise((r) => { tookA = r; });
    const bLocked = new Promise((r) => { tookB = r; });
    const runs = { first: 0, second: 0 };
    const lock = (trx, id) => trx('products').where({ id }).forUpdate().first('id');

    const first = db.transaction(async (trx) => {
      runs.first += 1;
      await lock(trx, a);
      tookA();
      await bLocked;
      await lock(trx, b);
      return 'first';
    });
    const second = db.transaction(async (trx) => {
      runs.second += 1;
      await lock(trx, b);
      tookB();
      await aLocked;
      await lock(trx, a);
      return 'second';
    });

    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    // exactly one side lost the deadlock and ran twice
    expect(runs.first + runs.second).toBe(3);
  }, 20_000);
});
