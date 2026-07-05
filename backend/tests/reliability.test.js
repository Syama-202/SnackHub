// Things that keep the service honest when something goes wrong or grows:
// - a message that can never be delivered is reported, not left unseen in the outbox
// - stopping a job waits for the pass that is under way
// - the operations board lists orders still in progress first, whatever their age
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHarness, beginTest } from './helpers/app.js';
import { staffToken, admin } from './helpers/onboarding.js';
import * as H from './helpers/orders.js';
import { createOutboxRelay, MAX_ATTEMPTS } from '../src/jobs/outboxRelay.js';
import { createOrderTimers } from '../src/jobs/orderTimers.js';

const h = await openHarness();
if (h.skip) console.warn(`reliability tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

describe.skipIf(h.skip)('reliability', () => {
  let t;
  beforeEach(async () => {
    t = await beginTest(h);
  });
  afterEach(() => t.end());

  const email = (attempts) => t.trx.identity('outbox').insert({ type: 'email.send', payload: JSON.stringify({ to: 'asha@example.test', template: 'password_changed', data: { name: 'Asha' } }), attempts }).then(([id]) => id);

  it('reports a message it has given up on, once, and stops trying it', async () => {
    const down = { enabled: true, send: async () => { throw Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }); } };
    const relay = createOutboxRelay({ env: h.env, dbs: t.trx, mailer: down, sms: { enabled: false }, push: { enabled: false } });
    const last = await email(MAX_ATTEMPTS - 1);
    const first = await email(0);
    const gaveUp = () => t.trx.identity('error_groups').where({ kind: 'OutboxGaveUp' }).andWhere('message', 'like', '%email.send%');
    const before = (await gaveUp()).length;

    await relay.runOnce();
    const rows = new Map((await t.trx.identity('outbox').whereIn('id', [last, first])).map((r) => [r.id, r]));
    // the last try is used up and nothing was marked as sent
    expect(rows.get(last)).toMatchObject({ attempts: MAX_ATTEMPTS, published_at: null });
    // a first failure just waits for its next try
    expect(rows.get(first)).toMatchObject({ attempts: 1, published_at: null });
    expect(new Date(rows.get(first).available_at).getTime()).toBeGreaterThan(Date.now());

    const groups = await gaveUp();
    expect(groups.length).toBeGreaterThan(before);
    // the report says what and why, never to whom
    expect(JSON.stringify(groups)).not.toContain('asha@example.test');
    expect(groups.some((g) => g.message.includes('ETIMEDOUT'))).toBe(true);

    // the next pass leaves the exhausted message alone
    await relay.runOnce();
    expect((await t.trx.identity('outbox').where({ id: last }).first()).attempts).toBe(MAX_ATTEMPTS);
  });

  it('stopping a job waits for the pass that is under way', async () => {
    let release;
    const gate = new Promise((r) => (release = r));
    let finished = false;
    const slow = { enabled: true, send: async () => { await gate; finished = true; } };
    const relay = createOutboxRelay({ env: h.env, dbs: t.trx, mailer: slow, sms: { enabled: false }, push: { enabled: false } });
    await email(0);
    relay.start(5);
    await new Promise((r) => setTimeout(r, 60));
    const stopped = relay.stop();
    let done = false;
    stopped.then(() => (done = true));
    await new Promise((r) => setTimeout(r, 60));
    // still sending: stop has not returned
    expect(done).toBe(false);
    release();
    await stopped;
    expect(finished).toBe(true);

    // a job that is not running stops at once
    const timers = createOrderTimers({ dbs: t.trx });
    timers.start(60_000);
    await timers.stop();
  });

  it('the operations board lists orders in progress before finished ones, whatever their age', async () => {
    const staff = await staffToken(t, 'reviewer');
    const boss = await staffToken(t, 'admin');
    // an order still open, placed two days ago, and a newer one already delivered
    const s = await H.openShop(t, staff);
    const c = await H.customerAt(t);
    const open = await H.placeOrder(c, s, 1);
    await t.trx.ordering('orders').where({ id: open.id }).update({ placed_at: new Date(Date.now() - 2 * 86_400_000) });
    const { order: done } = await H.deliveredOrder(t, staff);

    const board = (await admin(t, boss.token).get('/orders?limit=500').expect(200)).body;
    const at = (id) => board.findIndex((o) => o.id === id);
    expect(at(open.id)).toBeGreaterThanOrEqual(0);
    expect(at(open.id)).toBeLessThan(at(done.id));
    // no finished order sits above one in progress
    const finished = (o) => ['DELIVERED', 'CANCELLED', 'REJECTED'].includes(o.status);
    const firstFinished = board.findIndex(finished);
    expect(board.slice(firstFinished).every(finished)).toBe(true);
    // the board counts and the cash check still answer
    expect((await admin(t, boss.token).get('/metrics/sla').expect(200)).body).toMatchObject({ deliveredToday: expect.any(Number), cashMismatches: expect.any(Number) });
    expect((await admin(t, boss.token).get('/reconciliation').expect(200)).body.some((r) => r.orderId === done.id)).toBe(true);
    expect((await admin(t, boss.token).get('/riders').expect(200)).body.every((r) => r.lat != null)).toBe(true);
  });
});
