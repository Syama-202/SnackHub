// Prompt 7: seller and rider applications, admin approve and reject, requireRole and the
// audit log (doc 11.2 to 11.4, 16.3, 16.4), with the privilege escalation cases. Each test
// runs inside rolled-back transactions on the identity, catalog and dispatch module users.
import { afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { connect } from './helpers/db.js';
import { moduleDb } from '../src/db/connection.js';
import { loadEnv } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/utils/tokens.js';

const { db: migrator, env: dbEnv, reason } = await connect();
if (!migrator) console.warn(`application tests skipped: ${reason}`);
const MODULES = ['identity', 'catalog', 'dispatch'];
const pools = migrator ? Object.fromEntries(MODULES.map((m) => [m, moduleDb(dbEnv, m)])) : {};
afterAll(async () => {
  await Promise.all([migrator, ...Object.values(pools)].filter(Boolean).map((d) => d.destroy()));
});

const env = migrator
  ? loadEnv({ ...dbEnv, DB_PORT: String(dbEnv.DB_PORT), CORS_ORIGINS: 'http://localhost:5173', JWT_SECRET: 'test-only-secret-that-is-at-least-32-characters',
      MFA_KEY: 'dGVzdC1vbmx5LW1mYS1rZXktMzItYnl0ZXMtbG9uZyE', GOOGLE_CLIENT_ID: '' })
  : null;

const ADMIN_ID = 9001; // seeded admin (demo)
const MIN = 60_000;
const token = (id, role, mfaAgoMin) => `Bearer ${signAccessToken(env, { id, role }, mfaAgoMin == null ? {} : { mfaAt: Date.now() - mfaAgoMin * MIN })}`;
const admin = (mfaAgoMin = 1) => token(ADMIN_ID, 'admin', mfaAgoMin);

const shop = (over = {}) => ({
  shopName: 'Test Snack Corner (demo)', city: 'Guntur', region: 'Andhra Pradesh', lat: 16.31, lng: 80.43,
  radiusKm: 4, openHours: '08:00-21:00', licenceNo: 'FAKE-TEST-123456', licenceExpiresOn: '2030-01-31', ...over,
});
const ride = (over = {}) => ({ name: 'Test Rider (demo)', city: 'Guntur', vehicle: 'Scooter', vehicleNo: 'AP07 TE 1234', licenceNo: 'FAKE-DL-9999', ...over });

describe.skipIf(!migrator)('applications', () => {
  let trx;
  let app;
  let n = 0;
  const newCustomer = async () => {
    n++;
    const [id] = await trx.identity('users').insert({ email: `apply-${Date.now()}-${n}@example.test`, name: 'Applicant (demo)', role: 'customer' });
    return id;
  };
  const tick = async (id, names) => {
    for (const check of names) await request(app).post(`/api/v1/admin/applications/${id}/check`).set('X-SnackHub-Host', 'admin').set('Authorization', admin()).send({ check, value: true }).expect(200);
  };

  beforeEach(async () => {
    trx = Object.fromEntries(await Promise.all(MODULES.map(async (m) => [m, await pools[m].transaction()])));
    app = createApp({ env, logger: pino({ level: 'silent' }), dbs: trx, verifyGoogle: async () => { throw new Error('unused'); } });
  });
  afterEach(async () => {
    await Promise.all(Object.values(trx).map((t) => t.rollback()));
  });

  describe('applying', () => {
    it('a customer applies to sell; the shop stays hidden and the status is readable', async () => {
      const id = await newCustomer();
      const res = await request(app).post('/api/v1/seller/apply').set('Authorization', token(id, 'customer')).send(shop()).expect(201);
      expect(res.body).toMatchObject({ status: 'SUBMITTED', id: expect.stringMatching(/^seller-\d+$/) });
      const row = await trx.catalog('sellers').where({ id: res.body.sellerId }).first();
      expect(row).toMatchObject({ status: 'pending', user_id: id, verified_at: null });
      const mine = await request(app).get('/api/v1/seller/application').set('Authorization', token(id, 'customer')).expect(200);
      expect(mine.body).toMatchObject({ status: 'SUBMITTED', name: 'Test Snack Corner (demo)' });
      expect(await trx.catalog('outbox').where({ type: 'seller.applied' }).count('* as c').first()).toMatchObject({ c: expect.any(Number) });
    });

    it('refuses role, status or user id in the body', async () => {
      const id = await newCustomer();
      for (const extra of [{ role: 'seller' }, { status: 'active' }, { userId: ADMIN_ID }, { checks: { licence: true } }]) {
        await request(app).post('/api/v1/seller/apply').set('Authorization', token(id, 'customer')).send(shop(extra)).expect(400);
      }
    });

    it('refuses a second application while one is open, and an expired licence', async () => {
      const id = await newCustomer();
      await request(app).post('/api/v1/seller/apply').set('Authorization', token(id, 'customer')).send(shop()).expect(201);
      const again = await request(app).post('/api/v1/seller/apply').set('Authorization', token(id, 'customer')).send(shop()).expect(409);
      expect(again.body.error.code).toBe('ALREADY_APPLIED');
      const other = await newCustomer();
      await request(app).post('/api/v1/seller/apply').set('Authorization', token(other, 'customer')).send(shop({ licenceExpiresOn: '2020-01-01' })).expect(400);
    });

    it('only a customer can apply: sellers, riders and admins cannot', async () => {
      await request(app).post('/api/v1/seller/apply').set('Authorization', token(1001, 'seller')).send(shop()).expect(403);
      await request(app).post('/api/v1/rider/apply').set('Authorization', token(2001, 'rider')).send(ride()).expect(403);
      await request(app).post('/api/v1/rider/apply').set('Authorization', admin()).send(ride()).expect(403);
      await request(app).post('/api/v1/rider/apply').send(ride()).expect(401);
    });
  });

  describe('who can decide', () => {
    it('customers, sellers and riders cannot reach the admin queue', async () => {
      const id = await newCustomer();
      for (const auth of [token(id, 'customer'), token(1001, 'seller', 0), token(2001, 'rider', 0)]) {
        await request(app).get('/api/v1/admin/applications').set('X-SnackHub-Host', 'admin').set('Authorization', auth).expect(403);
      }
    });

    it('a token that says admin is refused when the account is not an admin', async () => {
      const id = await newCustomer();
      // e.g. an admin who was demoted: the old token still says admin until it expires
      await request(app).get('/api/v1/admin/applications').set('X-SnackHub-Host', 'admin').set('Authorization', token(id, 'admin', 0)).expect(403);
    });

    it('an admin needs a second factor, and a fresh one for a decision', async () => {
      await request(app).get('/api/v1/admin/applications').set('X-SnackHub-Host', 'admin').set('Authorization', token(ADMIN_ID, 'admin')).expect(401);
      await request(app).get('/api/v1/admin/applications').set('X-SnackHub-Host', 'admin').set('Authorization', admin(9 * 60)).expect(401);
      const list = await request(app).get('/api/v1/admin/applications').set('X-SnackHub-Host', 'admin').set('Authorization', admin(60)).expect(200);
      const open = list.body.find((a) => a.kind === 'RIDER');
      const late = await request(app).post(`/api/v1/admin/applications/${open.id}/approve`).set('X-SnackHub-Host', 'admin').set('Authorization', admin(60)).send({}).expect(401);
      expect(late.body.error.code).toBe('MFA_REQUIRED');
    });

    it('an applicant cannot approve their own application', async () => {
      const id = await newCustomer();
      const res = await request(app).post('/api/v1/rider/apply').set('Authorization', token(id, 'customer')).send(ride()).expect(201);
      await request(app).post(`/api/v1/admin/applications/${res.body.id}/approve`).set('X-SnackHub-Host', 'admin').set('Authorization', token(id, 'customer', 0)).send({}).expect(403);
      expect((await trx.identity('users').where({ id }).first()).role).toBe('customer');
    });
  });

  describe('deciding', () => {
    it('approval needs every check, then makes the shop visible on probation and the person a seller', async () => {
      const id = await newCustomer();
      const applied = await request(app).post('/api/v1/seller/apply').set('Authorization', token(id, 'customer')).send(shop()).expect(201);
      const appId = applied.body.id;
      const early = await request(app).post(`/api/v1/admin/applications/${appId}/approve`).set('X-SnackHub-Host', 'admin').set('Authorization', admin()).send({}).expect(422);
      expect(early.body.error.code).toBe('CHECKS_INCOMPLETE');

      await tick(appId, ['identity', 'licence', 'location', 'kitchen', 'menu', 'testOrder']);
      const done = await request(app).post(`/api/v1/admin/applications/${appId}/approve`).set('X-SnackHub-Host', 'admin').set('Authorization', admin()).send({}).expect(200);
      expect(done.body).toMatchObject({ status: 'APPROVED', decisionReason: expect.any(String) });

      expect((await trx.identity('users').where({ id }).first()).role).toBe('seller');
      const row = await trx.catalog('sellers').where({ id: applied.body.sellerId }).first();
      expect(row.status).toBe('probation');
      expect(row.verified_at).not.toBeNull();
      const audit = await trx.identity('audit_log').where({ actor_id: ADMIN_ID }).orderBy('id', 'desc').limit(2).pluck('action');
      expect(audit).toEqual(['role.grant', 'application.approve']);
      expect(await trx.catalog('outbox').where({ type: 'seller.application.approved' }).first()).toBeTruthy();

      const twice = await request(app).post(`/api/v1/admin/applications/${appId}/approve`).set('X-SnackHub-Host', 'admin').set('Authorization', admin()).send({}).expect(409);
      expect(twice.body.error.code).toBe('ALREADY_DECIDED');
    });

    it('rejection needs a reason; a rejected shop can apply again', async () => {
      const id = await newCustomer();
      const applied = await request(app).post('/api/v1/seller/apply').set('Authorization', token(id, 'customer')).send(shop()).expect(201);
      const none = await request(app).post(`/api/v1/admin/applications/${applied.body.id}/reject`).set('X-SnackHub-Host', 'admin').set('Authorization', admin()).send({}).expect(422);
      expect(none.body.error.code).toBe('REASON_REQUIRED');
      await request(app).post(`/api/v1/admin/applications/${applied.body.id}/reject`).set('X-SnackHub-Host', 'admin').set('Authorization', admin()).send({ reason: 'Licence number not on the register (demo)' }).expect(200);
      expect((await trx.catalog('sellers').where({ id: applied.body.sellerId }).first()).status).toBe('rejected');
      expect((await trx.identity('users').where({ id }).first()).role).toBe('customer');
      const again = await request(app).post('/api/v1/seller/apply').set('Authorization', token(id, 'customer')).send(shop({ licenceNo: 'FAKE-TEST-654321' })).expect(201);
      expect(again.body.sellerId).toBe(applied.body.sellerId);
    });

    it('approving a rider creates the rider row, offline, and grants the rider role', async () => {
      const id = await newCustomer();
      const applied = await request(app).post('/api/v1/rider/apply').set('Authorization', token(id, 'customer')).send(ride()).expect(201);
      await tick(applied.body.id, ['identity', 'licence', 'vehicle']);
      const done = await request(app).post(`/api/v1/admin/applications/${applied.body.id}/approve`).set('X-SnackHub-Host', 'admin').set('Authorization', admin()).send({}).expect(200);
      const rider = await trx.dispatch('riders').where({ user_id: id }).first();
      expect(rider).toMatchObject({ status: 'OFFLINE', city: 'Guntur', vehicle: 'Scooter' });
      expect(done.body.riderId).toBe(rider.id);
      expect((await trx.identity('users').where({ id }).first()).role).toBe('rider');
    });

    it('never approves someone whose role changed meanwhile, and leaves the application open', async () => {
      const id = await newCustomer();
      const applied = await request(app).post('/api/v1/rider/apply').set('Authorization', token(id, 'customer')).send(ride()).expect(201);
      await tick(applied.body.id, ['identity', 'licence', 'vehicle']);
      await trx.identity('users').where({ id }).update({ role: 'seller' });
      const res = await request(app).post(`/api/v1/admin/applications/${applied.body.id}/approve`).set('X-SnackHub-Host', 'admin').set('Authorization', admin()).send({}).expect(409);
      expect(res.body.error.code).toBe('ROLE_CONFLICT');
      expect(await trx.dispatch('riders').where({ user_id: id }).first()).toBeUndefined();
      expect((await trx.dispatch('rider_applications').where({ id: Number(applied.body.id.split('-')[1]) }).first()).status).toBe('UNDER_REVIEW');
    });

    it('refuses an unknown check and a malformed id', async () => {
      const list = await request(app).get('/api/v1/admin/applications').set('X-SnackHub-Host', 'admin').set('Authorization', admin()).expect(200);
      const seller = list.body.find((a) => a.kind === 'SELLER');
      await request(app).post(`/api/v1/admin/applications/${seller.id}/check`).set('X-SnackHub-Host', 'admin').set('Authorization', admin()).send({ check: 'vehicle', value: true }).expect(422);
      await request(app).post('/api/v1/admin/applications/12/approve').set('X-SnackHub-Host', 'admin').set('Authorization', admin()).send({}).expect(400);
      await request(app).post('/api/v1/admin/applications/seller-1/promote').set('X-SnackHub-Host', 'admin').set('Authorization', admin()).send({}).expect(400);
    });
  });
});
