// The clear-out job (src/jobs/purge.js): expired sessions, notifications older than 30 days
// and rider GPS fixes older than 2 days go; everything newer stays.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { openHarness, beginTest } from './helpers/app.js';
import { runPurge } from '../src/jobs/purge.js';

const h = await openHarness();
afterAll(() => h.close?.());
const DAY = 86_400_000;
const ago = (ms) => new Date(Date.now() - ms);

describe.skipIf(h.skip)('purge', () => {
  let t;
  beforeEach(async () => {
    t = await beginTest(h);
  });
  afterEach(() => t.end());

  it('removes only what is past its time', async () => {
    const u = await t.makeUser();
    const token = (expiresAt) => t.trx.identity('refresh_tokens').insert({ user_id: u.id, family_id: randomUUID(), device_id: 'dev-test', token_hash: randomUUID().replace(/-/g, '').padEnd(64, '0'), created_at: ago(2 * DAY), expires_at: expiresAt }).then(([id]) => id);
    const expired = await token(ago(60_000));
    const live = await token(new Date(Date.now() + DAY));

    const note = (createdAt, type) => t.trx.notify('notifications').insert({ user_id: u.id, type, body: 'Test note (demo)', created_at: createdAt }).then(([id]) => id);
    const oldNote = await note(ago(31 * DAY), 'test.old');
    const newNote = await note(ago(29 * DAY), 'test.new');

    const rider = await t.trx.dispatch('riders').first('id');
    const fix = (at) => t.trx.dispatch('rider_trail').insert({ order_id: 999999001, rider_id: rider.id, lat: 16.3, lng: 80.44, at }).then(([id]) => id);
    const oldFix = await fix(ago(3 * DAY));
    const newFix = await fix(ago(DAY));

    const out = await runPurge({ dbs: t.trx });
    expect(out.refreshTokens).toBeGreaterThanOrEqual(1);
    expect(out.notifications).toBeGreaterThanOrEqual(1);
    expect(out.riderTrail).toBeGreaterThanOrEqual(1);

    const ids = async (db, table, list) => (await db(table).whereIn('id', list).pluck('id')).map(Number);
    expect(await ids(t.trx.identity, 'refresh_tokens', [expired, live])).toEqual([live]);
    expect(await ids(t.trx.notify, 'notifications', [oldNote, newNote])).toEqual([newNote]);
    expect(await ids(t.trx.dispatch, 'rider_trail', [oldFix, newFix])).toEqual([newFix]);
  });
});
