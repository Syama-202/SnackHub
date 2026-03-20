// Seller and rider onboarding: drafts that save and resume, the checklist, conditional
// document requirements, file checks (real type from the bytes, size, scripts, malware),
// submission gating, private signed links, and the vehicle rules for riders.
import { readdir } from 'node:fs/promises';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHarness, beginTest, request, bearer } from './helpers/app.js';
import { SELLER_PROFILE, RIDER_PROFILE, VEHICLES, upload, show, saveProfile, submit, readySeller, png, pdf, past } from './helpers/onboarding.js';
import { signFileLink } from '../src/utils/signedUrl.js';
import { sellerModel } from '../src/models/catalog/seller.js';

const h = await openHarness();
if (h.skip) console.warn(`onboarding tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

const filesIn = async (dir) => (await readdir(dir, { recursive: true, withFileTypes: true })).filter((d) => d.isFile()).length;

describe.skipIf(h.skip)('seller onboarding', () => {
  let t;
  let seller;
  let token;
  beforeEach(async () => {
    t = await beginTest(h);
    seller = await t.makeUser({ roles: ['seller'], mfa: true });
    token = t.tokenFor(seller, 'seller');
  });
  afterEach(() => t.end());

  it('starts empty, saves a draft as it goes, and never returns the bank account number', async () => {
    expect((await show(t, token, 'seller').expect(200)).body.status).toBe('NOT_STARTED');
    const saved = (await saveProfile(t, token, 'seller', { shopName: 'Half done (demo)', bankAccount: '998877665544' }).expect(200)).body;
    expect(saved.status).toBe('DRAFT');
    expect(saved.profile).toMatchObject({ shopName: 'Half done (demo)', bankAccount: '••••5544' });
    expect(JSON.stringify(saved)).not.toContain('998877665544');
    const row = await t.trx.catalog('seller_businesses').where({ user_id: seller.id }).first();
    expect(row.bank_account_enc).not.toContain('998877665544');
    expect(row.bank_account_last4).toBe('5544');
    // resuming later shows the same answers
    expect((await show(t, token, 'seller')).body.profile.shopName).toBe('Half done (demo)');
  });

  it('cannot be submitted until every answer and required document is in, and says what is missing', async () => {
    await saveProfile(t, token, 'seller', { shopName: 'Missing bits (demo)' }).expect(200);
    const res = await submit(t, token, 'seller').expect(422);
    expect(res.body.error.code).toBe('INCOMPLETE');
    expect(res.body.error.details.missing).toEqual(expect.arrayContaining(['Business type', 'PIN code', 'FSSAI licence or registration', 'PAN card']));
    const view = (await show(t, token, 'seller')).body;
    expect(view.checklist.ready).toBe(false);
    expect(view.checklist.documents.find((d) => d.docType === 'FSSAI')).toMatchObject({ required: true, state: 'missing' });
  });

  it('asks a company for GST and business registration, and never asks an individual for registration', async () => {
    await saveProfile(t, token, 'seller', { ...SELLER_PROFILE, businessType: 'individual' }).expect(200);
    let view = (await show(t, token, 'seller')).body;
    expect(view.requirements.find((r) => r.docType === 'BUSINESS_REG')).toBeUndefined();
    expect(view.requirements.find((r) => r.docType === 'GST')).toMatchObject({ required: false });
    expect((await upload(t, token, 'seller', 'BUSINESS_REG').expect(422)).body.error.code).toBe('DOC_NOT_APPLICABLE');

    await saveProfile(t, token, 'seller', { businessType: 'company' }).expect(200);
    view = (await show(t, token, 'seller')).body;
    expect(view.requirements.filter((r) => r.required).map((r) => r.docType)).toEqual(expect.arrayContaining(['GST', 'BUSINESS_REG']));
    for (const r of view.requirements.filter((x) => x.required && !['GST', 'BUSINESS_REG'].includes(x.docType))) await upload(t, token, 'seller', r.docType).expect(201);
    expect((await submit(t, token, 'seller').expect(422)).body.error.details.missing).toEqual(expect.arrayContaining(['GST registration certificate', 'Business registration']));
    await upload(t, token, 'seller', 'GST').expect(201);
    await upload(t, token, 'seller', 'BUSINESS_REG').expect(201);
    expect((await submit(t, token, 'seller').expect(200)).body.status).toBe('SUBMITTED');
  });

  it('judges a file by its bytes: renamed programs, oversize files and scripted PDFs are refused', async () => {
    await saveProfile(t, token, 'seller', SELLER_PROFILE).expect(200);
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(500, 0x90)]);
    expect((await upload(t, token, 'seller', 'PAN', {}, exe, 'pan.pdf').expect(422)).body.error.code).toBe('FILE_INVALID');
    expect((await upload(t, token, 'seller', 'PAN', {}, Buffer.alloc(5 * 1024 * 1024 + 10, 0x41)).expect(413)).body.error.code).toBe('FILE_TOO_LARGE');
    const scripted = Buffer.from('%PDF-1.4\n1 0 obj << /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >> endobj\ntrailer << >>\n%%EOF\n', 'latin1');
    expect((await upload(t, token, 'seller', 'PAN', {}, scripted).expect(422)).body.error.code).toBe('FILE_INVALID');
    // the declared type is ignored: a PNG sent as "application/pdf" is stored as a PNG
    const view = (await upload(t, token, 'seller', 'PAN', {}, png(), 'pan.pdf', 'application/pdf').expect(201)).body;
    expect(view.documents.find((d) => d.docType === 'PAN')).toMatchObject({ mime: 'image/png', status: 'PENDING', number: '••••234F' });
    // the stored row has a random key, never the original name
    const row = await t.trx.catalog('seller_documents').where({ user_id: seller.id }).first();
    expect(row.storage_key).toMatch(/^[a-f0-9]{32}$/);
    expect(row.number_enc).not.toContain('ABCDE1234F');
  });

  it('refuses expired documents and numbers in the wrong format', async () => {
    await saveProfile(t, token, 'seller', SELLER_PROFILE).expect(200);
    const expired = await upload(t, token, 'seller', 'FSSAI', { expiresOn: past(3) }).expect(422);
    expect(expired.body.error).toMatchObject({ code: 'DOCUMENT_INVALID', details: [{ field: 'expiresOn', message: expect.stringMatching(/expired/) }] });
    expect((await upload(t, token, 'seller', 'PAN', { number: '1234' }).expect(422)).body.error.details[0].field).toBe('number');
    expect((await upload(t, token, 'seller', 'FSSAI', { issuer: '' }).expect(422)).body.error.details[0].field).toBe('issuer');
  });

  it('a new upload replaces an unreviewed one; only unreviewed draft uploads can be removed', async () => {
    await saveProfile(t, token, 'seller', SELLER_PROFILE).expect(200);
    await upload(t, token, 'seller', 'PAN').expect(201);
    await upload(t, token, 'seller', 'PAN', { number: 'ZYXWV9876K' }).expect(201);
    const versions = await t.trx.catalog('seller_documents').where({ user_id: seller.id, doc_type: 'PAN' }).orderBy('version');
    expect(versions.map((v) => [v.version, v.status])).toEqual([[1, 'SUPERSEDED'], [2, 'PENDING']]);
    const current = (await show(t, token, 'seller')).body.documents.find((d) => d.docType === 'PAN');
    expect(current.number).toBe('••••876K');
    await request(t.app).delete(`/api/v1/seller/onboarding/documents/${current.id}`).set(bearer(token)).expect(200);
    expect((await show(t, token, 'seller')).body.documents.find((d) => d.docType === 'PAN')).toBeUndefined();
  });

  it('submitting makes the hidden shop and freezes the answers while it is reviewed', async () => {
    const { user, token: tk } = await readySeller(t);
    const view = (await show(t, tk, 'seller')).body;
    expect(view.status).toBe('SUBMITTED');
    const shop = await t.trx.catalog('sellers').where({ user_id: user.id }).first();
    expect(shop).toMatchObject({ status: 'pending', shop_name: SELLER_PROFILE.shopName, kind: 'stall' });
    expect(shop.licence_no).toBe('••••1234');
    const visible = await sellerModel.listServiceable(t.trx.catalog, { lat: SELLER_PROFILE.lat, lng: SELLER_PROFILE.lng, maxKm: 5 });
    expect(visible.some((s) => s.user_id === user.id)).toBe(false);
    expect((await saveProfile(t, tk, 'seller', { shopName: 'Changed (demo)' }).expect(409)).body.error.code).toBe('NOT_EDITABLE');
    await upload(t, tk, 'seller', 'PAN').expect(409);
    await submit(t, tk, 'seller').expect(409);
    // the email went out, once
    const mails = await t.inbox();
    expect(mails.filter((m) => /received your seller application/i.test(m.subject))).toHaveLength(1);
  });

  it('opens your own document through a five-minute signed link; nobody else gets one', async () => {
    await saveProfile(t, token, 'seller', SELLER_PROFILE).expect(200);
    const file = pdf('my PAN');
    const doc = (await upload(t, token, 'seller', 'PAN', {}, file).expect(201)).body.documents[0];
    const { url } = (await request(t.app).post(`/api/v1/seller/onboarding/documents/${doc.id}/link`).set(bearer(token)).expect(200)).body;
    const got = await request(t.app).get(url).buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(got.body.equals(file)).toBe(true);
    expect(got.headers).toMatchObject({ 'content-type': 'application/pdf', 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store' });
    expect(got.headers['content-security-policy']).toContain('sandbox');
    expect(await t.trx.identity('audit_log').where({ actor_id: seller.id, action: 'document.view' }).first()).toBeTruthy();

    // another seller cannot ask for a link to it, by id or otherwise
    const other = await t.makeUser({ roles: ['seller'], mfa: true });
    await request(t.app).post(`/api/v1/seller/onboarding/documents/${doc.id}/link`).set(bearer(t.tokenFor(other, 'seller'))).expect(404);
    await request(t.app).delete(`/api/v1/seller/onboarding/documents/${doc.id}`).set(bearer(t.tokenFor(other, 'seller'))).expect(404);
    // a changed or expired link opens nothing
    const token2 = url.split('/').pop();
    const [body, sig] = token2.split('.');
    await request(t.app).get(`/api/v1/files/${body}.${sig.replace(/^./, (c) => (c === 'a' ? 'b' : 'a'))}`).expect(404);
    const old = signFileLink(h.env, { ref: `seller-doc:${doc.id}`, viewerId: seller.id }, Date.now() - 10 * 60_000);
    await request(t.app).get(`/api/v1/files/${old}`).expect(404);
  });

  it('stores nothing when the scanner finds malware', async () => {
    await t.end();
    t = await beginTest(h, { scan: 'infected' });
    seller = await t.makeUser({ roles: ['seller'], mfa: true });
    token = t.tokenFor(seller, 'seller');
    await saveProfile(t, token, 'seller', SELLER_PROFILE).expect(200);
    const before = await filesIn(h.env.STORAGE_DIR);
    expect((await upload(t, token, 'seller', 'PAN').expect(422)).body.error.code).toBe('FILE_INFECTED');
    expect(await filesIn(h.env.STORAGE_DIR)).toBe(before);
    expect(await t.trx.catalog('seller_documents').where({ user_id: seller.id }).first()).toBeUndefined();
  });
});

describe.skipIf(h.skip)('rider onboarding', () => {
  let t;
  beforeEach(async () => {
    t = await beginTest(h);
  });
  afterEach(() => t.end());

  async function riderWith(mode) {
    const user = await t.makeUser({ roles: ['rider'] });
    const token = t.tokenFor(user, 'rider', { mfa: false });
    await saveProfile(t, token, 'rider', RIDER_PROFILE).expect(200);
    await request(t.app).put('/api/v1/rider/onboarding/vehicle').set(bearer(token)).send(VEHICLES[mode]).expect(200);
    return { user, token, view: (await show(t, token, 'rider')).body };
  }

  it('a bicycle rider is never asked for motor-vehicle documents; motor riders are', async () => {
    const required = (view) => view.requirements.filter((r) => r.required).map((r) => r.docType).sort();
    const bike = await riderWith('bicycle');
    expect(required(bike.view)).toEqual(['ID_PROOF', 'PHOTO']);
    expect((await upload(t, bike.token, 'rider', 'DRIVING_LICENCE').expect(422)).body.error.code).toBe('DOC_NOT_APPLICABLE');
    for (const d of ['ID_PROOF', 'PHOTO']) await upload(t, bike.token, 'rider', d).expect(201);
    expect((await submit(t, bike.token, 'rider').expect(200)).body.status).toBe('SUBMITTED');

    const scooter = await riderWith('scooter');
    expect(required(scooter.view)).toEqual(['DRIVING_LICENCE', 'ID_PROOF', 'INSURANCE', 'PHOTO', 'PUC', 'VEHICLE_RC']);
    // an electric scooter needs no pollution certificate
    const ev = await riderWith('ev_scooter');
    expect(required(ev.view)).not.toContain('PUC');
    expect(required(ev.view)).toContain('DRIVING_LICENCE');
    for (const d of ['ID_PROOF', 'PHOTO']) await upload(t, scooter.token, 'rider', d).expect(201);
    expect((await submit(t, scooter.token, 'rider').expect(422)).body.error.details.missing).toEqual(expect.arrayContaining(['Driving licence', 'Motor insurance']));
  });

  it('riders must be adults, bicycles have no registration and motor vehicles need one', async () => {
    const user = await t.makeUser({ roles: ['rider'] });
    const token = t.tokenFor(user, 'rider', { mfa: false });
    const young = new Date(Date.now() - 16 * 365 * 86_400_000).toISOString().slice(0, 10);
    await saveProfile(t, token, 'rider', { dob: young }).expect(400);
    await request(t.app).put('/api/v1/rider/onboarding/vehicle').set(bearer(token)).send({ mode: 'bicycle', registrationNo: 'AP07AB1234' }).expect(400);
    await request(t.app).put('/api/v1/rider/onboarding/vehicle').set(bearer(token)).send({ mode: 'scooter' }).expect(400);
    await request(t.app).put('/api/v1/rider/onboarding/vehicle').set(bearer(token)).send({ mode: 'scooter', registrationNo: 'ap 07 ab 1234' }).expect(200);
    expect((await show(t, token, 'rider')).body.vehicle).toMatchObject({ mode: 'scooter', registrationNo: 'AP07AB1234' });
  });

  it('the profile refuses fields that are not answers', async () => {
    const user = await t.makeUser({ roles: ['rider'] });
    const token = t.tokenFor(user, 'rider', { mfa: false });
    for (const extra of [{ status: 'APPROVED' }, { userId: 1 }, { checks: { background: true } }, { riderId: 5 }]) await saveProfile(t, token, 'rider', extra).expect(400);
  });
});
