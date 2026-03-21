// The verification team's work and what it unlocks: the queue, document reviews, decisions
// with reasons and a fresh second factor, the review history and audit log, who may decide,
// what an unapproved seller or rider cannot do, expiry reminders and restrictions, admin
// changes to the requirements, and account suspension.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHarness, beginTest, request, bearer } from './helpers/app.js';
import { readySeller, readyRider, staffToken, admin, refOf, approveAll, show, upload, submit, SELLER_PROFILE, future } from './helpers/onboarding.js';
import { signAccessToken } from '../src/utils/tokens.js';
import { sellerModel } from '../src/models/catalog/seller.js';
import { riderModel } from '../src/models/dispatch/rider.js';
import { runDocumentExpiry, reminderDue } from '../src/jobs/documentExpiry.js';

const h = await openHarness();
if (h.skip) console.warn(`verification tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

const at = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const nearShop = (trx) => sellerModel.listServiceable(trx, { lat: SELLER_PROFILE.lat, lng: SELLER_PROFILE.lng, maxKm: 5 });

describe.skipIf(h.skip)('verification', () => {
  let t;
  let staff;
  beforeEach(async () => {
    t = await beginTest(h);
    staff = await staffToken(t, 'admin');
  });
  afterEach(() => t.end());

  describe('the queue', () => {
    it('lists submitted applications with search, overdue flags and pages', async () => {
      const s = await readySeller(t);
      const a = admin(t, staff.token);
      const found = (await a.get(`/verification/seller?q=${encodeURIComponent(s.user.email)}`).expect(200)).body;
      expect(found).toMatchObject({ total: 1, page: 1 });
      expect(found.items[0]).toMatchObject({ status: 'SUBMITTED', name: SELLER_PROFILE.shopName, overdue: false, pendingDocuments: 4, type: 'sole_proprietorship' });
      await t.trx.catalog('seller_applications').where({ user_id: s.user.id }).update({ submitted_at: new Date(Date.now() - 3 * 86_400_000) });
      const overdue = (await a.get('/verification/seller?overdue=true&pageSize=50').expect(200)).body;
      expect(overdue.items.find((i) => i.applicant.id === s.user.id)).toMatchObject({ overdue: true });
      expect((await a.get('/verification/seller?pageSize=999').expect(400)).body.error.code).toBe('VALIDATION');
    });

    it('a draft is never in the queue or visible to reviewers', async () => {
      const s = await readySeller(t, { submitted: false });
      const ref = await refOf(t, s.token, 'seller');
      await admin(t, staff.token).get(`/verification/item/${ref}`).expect(404);
    });
  });

  describe('decisions', () => {
    it('approval needs every required document approved and every check ticked; then the shop goes live on probation', async () => {
      const s = await readySeller(t);
      const ref = await refOf(t, s.token, 'seller');
      const a = admin(t, staff.token);
      expect((await a.post(`/verification/item/${ref}/approve`).expect(409)).body.error.code).toBe('NOT_ALLOWED');
      await a.post(`/verification/item/${ref}/start-review`).expect(200);
      expect((await a.post(`/verification/item/${ref}/approve`).expect(409)).body.error.code).toBe('NOT_READY');

      const item = await approveAll(t, staff.token, ref);
      expect(item.status).toBe('APPROVED');
      expect((await t.trx.catalog('sellers').where({ user_id: s.user.id }).first()).status).toBe('probation');
      expect((await nearShop(t.trx.catalog)).some((x) => x.user_id === s.user.id)).toBe(true);
      expect((await request(t.app).get('/api/v1/seller/eligibility').set(bearer(s.token)).expect(200)).body).toMatchObject({ ok: true, validUntil: expect.any(String) });

      // every step is in the history and the audit log, with who did it
      expect(item.history.map((x) => x.action)).toEqual(expect.arrayContaining(['submit', 'start-review', 'document.approve', 'approve']));
      expect(item.history.find((x) => x.action === 'approve')).toMatchObject({ by: staff.user.name, from: 'UNDER_REVIEW', to: 'APPROVED' });
      const audit = await t.trx.identity('audit_log').where({ actor_id: staff.user.id }).pluck('action');
      expect(audit).toEqual(expect.arrayContaining(['document.approve', 'application.check', 'application.approve']));
      expect((await t.inbox()).some((m) => m.to === s.user.email && /approved/i.test(m.subject))).toBe(true);
    });

    it('a rejected document goes back with its reason; the corrected upload is resubmitted', async () => {
      const s = await readySeller(t);
      const ref = await refOf(t, s.token, 'seller');
      const a = admin(t, staff.token);
      const item = (await a.get(`/verification/item/${ref}`)).body;
      const pan = item.documents.find((d) => d.docType === 'PAN');
      expect((await a.post(`/documents/${pan.ref}/review`, { decision: 'reject' }).expect(422)).body.error.code).toBe('REASON_REQUIRED');
      await a.post(`/documents/${pan.ref}/review`, { decision: 'reject', reason: 'The PAN card photo is cut off' }).expect(200);
      await a.post(`/verification/item/${ref}/request-changes`).expect(422);
      await a.post(`/verification/item/${ref}/request-changes`, { reason: 'Please upload a full photo of the PAN card' }).expect(200);

      let mine = (await show(t, s.token, 'seller')).body;
      expect(mine).toMatchObject({ status: 'ACTION_REQUIRED', decisionReason: 'Please upload a full photo of the PAN card', canEdit: true });
      expect(mine.documents.find((d) => d.docType === 'PAN')).toMatchObject({ status: 'REJECTED', rejectionReason: 'The PAN card photo is cut off' });
      expect(mine.history.every((x) => x.by === 'you' || x.by === 'SnackHub team')).toBe(true);
      // resubmitting the rejected document as it is would not do
      expect((await submit(t, s.token, 'seller').expect(422)).body.error.details.missing).toContain('PAN card');
      await upload(t, s.token, 'seller', 'PAN').expect(201);
      mine = (await submit(t, s.token, 'seller').expect(200)).body;
      expect(mine.status).toBe('SUBMITTED');
      const versions = await t.trx.catalog('seller_documents').where({ user_id: s.user.id, doc_type: 'PAN' }).orderBy('version').pluck('status');
      expect(versions).toEqual(['SUPERSEDED', 'PENDING']);
      expect((await t.trx.catalog('seller_applications').where({ user_id: s.user.id }).first()).submit_count).toBe(2);
      const mails = await t.inbox();
      expect(mails.some((m) => /upload your PAN card again/i.test(m.subject))).toBe(true);
    });

    it('a rejection is final for the waiting period, then a new draft can start', async () => {
      const s = await readySeller(t);
      const ref = await refOf(t, s.token, 'seller');
      await admin(t, staff.token).post(`/verification/item/${ref}/reject`, { reason: 'The licence belongs to another business' }).expect(200);
      expect((await t.trx.catalog('sellers').where({ user_id: s.user.id }).first()).status).toBe('rejected');
      expect((await request(t.app).post('/api/v1/seller/onboarding/restart').set(bearer(s.token)).send({}).expect(409)).body.error.code).toBe('TOO_SOON');
      await t.trx.catalog('seller_applications').where({ user_id: s.user.id }).update({ decided_at: new Date(Date.now() - 8 * 86_400_000) });
      expect((await request(t.app).post('/api/v1/seller/onboarding/restart').set(bearer(s.token)).send({}).expect(201)).body.status).toBe('DRAFT');
    });

    it('a decision needs a second factor from the last five minutes', async () => {
      const s = await readySeller(t);
      const ref = await refOf(t, s.token, 'seller');
      const stale = signAccessToken(h.env, { id: staff.user.id }, { role: 'admin', mfaAt: Date.now() - 6 * 60_000 });
      const a = admin(t, stale);
      await a.post(`/verification/item/${ref}/start-review`).expect(200);
      expect((await a.post(`/verification/item/${ref}/reject`, { reason: 'Test reason' }).expect(401)).body.error.code).toBe('MFA_REQUIRED');
    });
  });

  describe('who may decide', () => {
    it('reviewers review and decide, but cannot suspend, change requirements, or manage accounts', async () => {
      const reviewer = await staffToken(t, 'reviewer');
      const r = admin(t, reviewer.token);
      const s = await readySeller(t);
      const ref = await refOf(t, s.token, 'seller');
      const item = await approveAll(t, reviewer.token, ref);
      expect(item.status).toBe('APPROVED');
      expect((await r.post(`/verification/item/${ref}/suspend`, { reason: 'Test' }).expect(403)).body.error.code).toBe('FORBIDDEN');
      await r.put('/requirements/seller', { rows: [] }).expect(403);
      await r.get('/users').expect(403);
      await r.get('/audit').expect(403);
    });

    it('customers, sellers and riders cannot reach the queue or decide, even with a forged admin claim', async () => {
      const s = await readySeller(t);
      const ref = await refOf(t, s.token, 'seller');
      for (const role of ['customer', 'seller', 'rider']) {
        const u = await t.makeUser({ roles: [role] });
        await admin(t, t.tokenFor(u, role)).post(`/verification/item/${ref}/reject`, { reason: 'x'.repeat(5) }).expect(403);
      }
      // the applicant claiming to be an admin: the token is signed, but the account holds no admin role
      const forged = signAccessToken(h.env, { id: s.user.id }, { role: 'admin', mfaAt: Date.now() });
      await admin(t, forged).post(`/verification/item/${ref}/start-review`).expect(403);
      expect((await t.trx.catalog('seller_applications').where({ user_id: s.user.id }).first()).status).toBe('SUBMITTED');
    });
  });

  describe('what approval unlocks', () => {
    it('an unapproved seller cannot publish products; an approved one can; hiding is always allowed', async () => {
      const s = await readySeller(t);
      const shop = await t.trx.catalog('sellers').where({ user_id: s.user.id }).first();
      const [productId] = await t.trx.catalog('products').insert({ seller_id: shop.id, slug: `test-${h.uniq()}`, title: 'Test bajji (demo)', category: 'fried', serving_temp: 'HOT', prep_minutes: 8, price_paise: 4000, active: false });
      const res = await request(t.app).patch(`/api/v1/seller/products/${productId}`).set(bearer(s.token)).send({ active: true }).expect(403);
      expect(res.body.error).toMatchObject({ code: 'NOT_ELIGIBLE', details: { reasons: expect.arrayContaining([expect.objectContaining({ code: 'NOT_APPROVED' })]) } });
      await request(t.app).patch(`/api/v1/seller/products/${productId}`).set(bearer(s.token)).send({ active: false }).expect(200);

      await approveAll(t, staff.token, await refOf(t, s.token, 'seller'));
      await request(t.app).patch(`/api/v1/seller/products/${productId}`).set(bearer(s.token)).send({ active: true }).expect(200);
      expect((await t.trx.catalog('products').where({ id: productId }).first()).active).toBe(1);
      // another seller cannot touch it by id
      const other = await readySeller(t);
      await request(t.app).patch(`/api/v1/seller/products/${productId}`).set(bearer(other.token)).send({ active: false }).expect(404);
    });

    it('a rider goes online only when approved with valid documents; expired insurance takes them out', async () => {
      const r = await readyRider(t, { mode: 'scooter' });
      const online = () => request(t.app).put('/api/v1/rider/status').set(bearer(r.token)).send({ status: 'ONLINE' });
      expect((await online().expect(403)).body.error.code).toBe('NOT_ELIGIBLE');
      await approveAll(t, staff.token, await refOf(t, r.token, 'rider'));
      const rider = await t.trx.dispatch('riders').where({ user_id: r.user.id }).first();
      expect(rider).toMatchObject({ status: 'OFFLINE', vehicle: 'Scooter' });
      await online().expect(200);
      await t.trx.dispatch('riders').where({ id: rider.id }).update({ last_lat: 16.3, last_lng: 80.45 });
      expect((await riderModel.listOnlineInCity(t.trx.dispatch, 'Guntur')).some((x) => x.id === rider.id)).toBe(true);

      // the insurance lapses: online is refused at once, and the job takes the rider out of dispatch
      await t.trx.dispatch('rider_documents').where({ user_id: r.user.id, doc_type: 'INSURANCE' }).update({ expires_on: at(-1), issued_on: at(-400) });
      const refused = await online().expect(403);
      expect(refused.body.error.details.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'DOCUMENT_EXPIRED', docType: 'INSURANCE' })]));
      await runDocumentExpiry({ env: h.env, dbs: t.trx });
      expect((await t.trx.dispatch('riders').where({ id: rider.id }).first()).status).toBe('OFFLINE');
      expect((await riderModel.listOnlineInCity(t.trx.dispatch, 'Guntur')).some((x) => x.id === rider.id)).toBe(false);
      // going offline is always allowed
      await request(t.app).put('/api/v1/rider/status').set(bearer(r.token)).send({ status: 'OFFLINE' }).expect(200);
    });

    it('a bicycle rider is approved on identity and photo alone', async () => {
      const r = await readyRider(t, { mode: 'bicycle' });
      const item = await approveAll(t, staff.token, await refOf(t, r.token, 'rider'));
      expect(item.status).toBe('APPROVED');
      await request(t.app).put('/api/v1/rider/status').set(bearer(r.token)).send({ status: 'ONLINE' }).expect(200);
    });
  });

  describe('expiry', () => {
    it('reminds 30, 7 and 1 days ahead and on expiry, each once', async () => {
      expect([45, 30, 12, 7, 3, 1, 0, -2].map(reminderDue)).toEqual([null, 30, 30, 7, 7, 1, 1, 0]);
      const s = await readySeller(t);
      await approveAll(t, staff.token, await refOf(t, s.token, 'seller'));
      await t.inbox();
      await t.trx.catalog('seller_documents').where({ user_id: s.user.id, doc_type: 'FSSAI' }).update({ expires_on: at(5) });
      await runDocumentExpiry({ env: h.env, dbs: t.trx });
      await runDocumentExpiry({ env: h.env, dbs: t.trx });
      let mails = (await t.inbox()).filter((m) => m.to === s.user.email);
      expect(mails).toHaveLength(1);
      expect(mails[0].subject).toMatch(/FSSAI licence or registration expires in 5 days/);
      // still live until the day it expires
      expect((await nearShop(t.trx.catalog)).some((x) => x.user_id === s.user.id)).toBe(true);

      // it lapses: one more email, the shop leaves the listings, and selling stops
      await t.trx.catalog('seller_documents').where({ user_id: s.user.id, doc_type: 'FSSAI' }).update({ expires_on: at(-1), issued_on: at(-800) });
      await runDocumentExpiry({ env: h.env, dbs: t.trx });
      mails = (await t.inbox()).filter((m) => m.to === s.user.email);
      expect(mails.map((m) => m.subject)).toEqual(['FSSAI licence or registration has expired']);
      expect((await nearShop(t.trx.catalog)).some((x) => x.user_id === s.user.id)).toBe(false);
      expect((await request(t.app).get('/api/v1/seller/eligibility').set(bearer(s.token))).body.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'DOCUMENT_EXPIRED' })]));
      expect((await admin(t, staff.token).get('/expiring').expect(200)).body.some((x) => x.docType === 'FSSAI' && x.state === 'expired')).toBe(true);

      // a renewal brings it back once approved
      await upload(t, s.token, 'seller', 'FSSAI', { expiresOn: future(3) }).expect(201);
      const renewal = (await admin(t, staff.token).get(`/verification/item/${await refOf(t, s.token, 'seller')}`)).body.documents.find((d) => d.docType === 'FSSAI' && d.status === 'PENDING');
      await admin(t, staff.token).post(`/documents/${renewal.ref}/review`, { decision: 'approve' }).expect(200);
      expect((await nearShop(t.trx.catalog)).some((x) => x.user_id === s.user.id)).toBe(true);
    });
  });

  describe('requirements', () => {
    it('an admin can require a document in one state; approved sellers there must provide it before trading', async () => {
      const s = await readySeller(t);
      await approveAll(t, staff.token, await refOf(t, s.token, 'seller'));
      const a = admin(t, staff.token);
      const { rows } = (await a.get('/requirements/seller').expect(200)).body;
      const next = [...rows.map(({ docType, mode, types, states }) => ({ docType, mode, types, states })), { docType: 'LOCAL_PERMIT', mode: 'required', types: null, states: ['Andhra Pradesh'] }];
      await a.put('/requirements/seller', { rows: next }).expect(200);
      expect((await request(t.app).get('/api/v1/seller/eligibility').set(bearer(s.token))).body.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'DOCUMENT_MISSING', docType: 'LOCAL_PERMIT' })]));
      expect((await nearShop(t.trx.catalog)).some((x) => x.user_id === s.user.id)).toBe(false);
      expect(await t.trx.identity('audit_log').where({ actor_id: staff.user.id, action: 'requirements.update' }).first()).toBeTruthy();
      // nonsense is refused
      await a.put('/requirements/seller', { rows: [{ docType: 'DRIVING_LICENCE', mode: 'required', types: null, states: null }] }).expect(422);
      await a.put('/requirements/seller', { rows: [{ docType: 'GST', mode: 'required', types: ['bank'], states: null }] }).expect(422);
    });
  });

  describe('suspension and accounts', () => {
    it('an admin suspends and reinstates an approved seller, with reasons', async () => {
      const s = await readySeller(t);
      const ref = await refOf(t, s.token, 'seller');
      await approveAll(t, staff.token, ref);
      const a = admin(t, staff.token);
      await a.post(`/verification/item/${ref}/suspend`).expect(422);
      await a.post(`/verification/item/${ref}/suspend`, { reason: 'Food safety complaint under investigation' }).expect(200);
      expect((await nearShop(t.trx.catalog)).some((x) => x.user_id === s.user.id)).toBe(false);
      await a.post(`/verification/item/${ref}/reinstate`, { reason: 'Inspection passed' }).expect(200);
      expect((await nearShop(t.trx.catalog)).some((x) => x.user_id === s.user.id)).toBe(true);
    });

    it('suspending an account signs it out and blocks every request; staff accounts are off limits', async () => {
      const u = await t.makeUser();
      const session = await t.signIn(u, 'customer');
      const a = admin(t, staff.token);
      await a.post(`/users/${u.id}/suspend`).expect(400);
      await a.post(`/users/${u.id}/suspend`, { reason: 'Repeated chargebacks (demo)' }).expect(200);
      await request(t.app).get('/api/v1/me').set(bearer(session.body.accessToken)).expect(403);
      expect(await t.trx.identity('refresh_tokens').where({ user_id: u.id }).whereNull('revoked_at').first()).toBeUndefined();
      await a.post(`/users/${u.id}/reactivate`, { reason: 'Resolved' }).expect(200);
      await request(t.app).get('/api/v1/me').set(bearer(session.body.accessToken)).expect(200);

      const otherAdmin = await staffToken(t, 'admin');
      expect((await a.post(`/users/${otherAdmin.user.id}/suspend`, { reason: 'Not allowed here' }).expect(403)).body.error.code).toBe('STAFF_TARGET');
      expect((await a.post(`/users/${staff.user.id}/suspend`, { reason: 'Not allowed here' }).expect(403)).body.error.code).toBe('SELF_TARGET');
      const page = (await a.get(`/users?q=${encodeURIComponent(u.email)}`).expect(200)).body;
      expect(page.items[0]).toMatchObject({ id: u.id, status: 'active', roles: [{ role: 'customer', status: 'active' }] });
      const log = (await a.get(`/audit?target=user:${u.id}`).expect(200)).body;
      expect(log.items.map((x) => x.action)).toEqual(expect.arrayContaining(['user.suspend', 'user.reactivate']));
    });

    it('document numbers are masked; revealing one needs a fresh code and is logged', async () => {
      const s = await readySeller(t);
      const ref = await refOf(t, s.token, 'seller');
      const a = admin(t, staff.token);
      const item = (await a.get(`/verification/item/${ref}`)).body;
      const pan = item.documents.find((d) => d.docType === 'PAN');
      expect(pan.number).toBe('••••234F');
      expect(JSON.stringify(item)).not.toContain('ABCDE1234F');
      expect(JSON.stringify(item)).not.toMatch(/storage_key|storageKey|number_enc|numberEnc/);
      expect((await a.post(`/documents/${pan.ref}/number`).expect(200)).body.number).toBe('ABCDE1234F');
      expect(await t.trx.identity('audit_log').where({ actor_id: staff.user.id, action: 'document.number.revealed' }).first()).toBeTruthy();
      const stale = signAccessToken(h.env, { id: staff.user.id }, { role: 'admin', mfaAt: Date.now() - 10 * 60_000 });
      await admin(t, stale).post(`/documents/${pan.ref}/number`).expect(401);
      // the reviewer's link opens the file, and that view is logged too
      const { url } = (await a.post(`/documents/${pan.ref}/link`).expect(200)).body;
      await request(t.app).get(url).expect(200);
      expect(await t.trx.identity('audit_log').where({ actor_id: staff.user.id, action: 'document.view' }).first()).toBeTruthy();
    });
  });
});
