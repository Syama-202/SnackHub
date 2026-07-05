// The shop-wide announcement: anyone reads it, only an admin sets or clears it, it stops
// showing at its end time, and it is plain text.
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHarness, beginTest } from './helpers/app.js';
import { staffToken, admin } from './helpers/onboarding.js';

const h = await openHarness();
if (h.skip) console.warn(`notice tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

describe.skipIf(h.skip)('the announcement', () => {
  let t;
  let boss;
  let reviewer;
  beforeEach(async () => {
    t = await beginTest(h);
    boss = await staffToken(t, 'admin');
    reviewer = await staffToken(t, 'reviewer');
  });
  afterEach(() => t.end());

  const shown = async () => (await request(t.app).get('/api/v1/notice').expect(200)).body.notice;

  it('is set by an admin, read by anyone, and cleared again', async () => {
    const set = (await admin(t, boss.token).put('/notice', { message: '  Closed on 12 November for Diwali  ', tone: 'warning' }).expect(200)).body;
    expect(set).toMatchObject({ showing: true, notice: { message: 'Closed on 12 November for Diwali', tone: 'warning', endsAt: null } });
    expect(await shown()).toMatchObject({ message: 'Closed on 12 November for Diwali', tone: 'warning' });

    expect((await admin(t, boss.token).put('/notice', { message: '' }).expect(200)).body).toEqual({ notice: null, showing: false });
    expect(await shown()).toBeNull();
    const actions = await t.trx.identity('audit_log').whereIn('action', ['notice.set', 'notice.clear']).where({ target: 'site:notice' }).orderBy('id', 'desc').limit(2).pluck('action');
    expect(actions).toEqual(['notice.clear', 'notice.set']);
  });

  it('stops showing at its end time', async () => {
    const endsAt = Date.now() + 3_600_000;
    await admin(t, boss.token).put('/notice', { message: 'Orders close at 9 pm today', endsAt }).expect(200);
    expect((await shown()).endsAt).toBeGreaterThan(Date.now());
    await t.trx.notify('site_notices').orderBy('id', 'desc').limit(1).update({ ends_at: new Date(Date.now() - 1000) });
    // the admin form still has the text; the shop no longer shows it
    expect((await admin(t, boss.token).get('/notice').expect(200)).body).toMatchObject({ showing: false, notice: { message: 'Orders close at 9 pm today' } });
    await admin(t, boss.token).put('/notice', { message: 'x', endsAt: Date.now() - 1000 }).expect(400);
  });

  it('refuses markup, long text and anyone who is not an admin', async () => {
    await admin(t, boss.token).put('/notice', { message: '<b>Sale</b>' }).expect(400);
    await admin(t, boss.token).put('/notice', { message: 'x'.repeat(201) }).expect(400);
    await admin(t, boss.token).put('/notice', { message: 'Hello', colour: 'red' }).expect(400);
    await admin(t, reviewer.token).put('/notice', { message: 'Hello' }).expect(403);
    await request(t.app).put('/api/v1/admin/notice').send({ message: 'Hello' }).expect((r) => expect([401, 403, 404]).toContain(r.status));
  });
});
