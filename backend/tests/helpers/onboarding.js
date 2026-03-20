// Onboarding helpers: complete answers, valid demo documents and files, and the steps a
// seller, a rider and a reviewer take through the API.
import { request, bearer, ADMIN } from './app.js';
import { demoPdf } from '../../src/db/seeds/demoPdf.js';

const day = (offsetDays) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
export const future = (years = 2) => day(years * 365);
export const past = (days = 1) => day(-days);

export const pdf = (label = 'Test document') => demoPdf('Test document (demo)', [label]);
export const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(256, 7)]);

export const SELLER_PROFILE = {
  ownerLegalName: 'Ravi Kumar',
  businessType: 'sole_proprietorship',
  businessEmail: 'shop@example.test',
  businessPhone: '+919876543210',
  shopName: 'Test Mirchi Bandi (demo)',
  kind: 'stall',
  addressLine: '4-12 Brodipet Main Road (demo)',
  state: 'Andhra Pradesh',
  city: 'Guntur',
  pin: '522002',
  lat: 16.3001,
  lng: 80.4501,
  radiusKm: 3,
  openHours: '16:00-22:00',
  bankHolder: 'Ravi Kumar',
  bankIfsc: 'SBIN0001234',
  bankAccount: '123456789012',
};

export const RIDER_PROFILE = {
  legalName: 'Kiran Babu',
  dob: '1999-05-20',
  addressLine: '7-1 Lakshmipuram (demo)',
  state: 'Andhra Pradesh',
  city: 'Guntur',
  pin: '522007',
  emergencyName: 'Sita Babu',
  emergencyPhone: '+919876500001',
  backgroundConsent: true,
};

export const VEHICLES = {
  scooter: { mode: 'scooter', registrationNo: 'AP07AB1234' },
  ev_scooter: { mode: 'ev_scooter', registrationNo: 'AP07EV1234' },
  motorcycle: { mode: 'motorcycle', registrationNo: 'AP07MC1234' },
  bicycle: { mode: 'bicycle' },
};

export const DETAILS = {
  OWNER_ID: { number: 'P1234567', issuer: 'Passport Office (demo)' },
  PAN: { number: 'ABCDE1234F' },
  FSSAI: { number: '12345678901234', issuer: 'FSSAI (demo)', issuedOn: '2025-01-01', expiresOn: future() },
  GST: { number: '37ABCDE1234F1Z5', issuedOn: '2024-01-01' },
  BUSINESS_REG: { number: 'U15400AP2020PTC1', issuer: 'Registrar of Companies (demo)', issuedOn: '2020-01-01' },
  BANK_PROOF: {},
  ADDRESS_PROOF: { issuedOn: '2026-01-01' },
  LOCAL_PERMIT: { number: 'GMC-TL-2026-1', issuer: 'Guntur Municipal Corporation (demo)', issuedOn: '2026-01-01', expiresOn: future(1) },
  ID_PROOF: { number: 'V1234567', issuer: 'Election Commission (demo)' },
  PHOTO: {},
  DRIVING_LICENCE: { number: 'AP07 20110012345', issuer: 'RTO Guntur (demo)', issuedOn: '2019-01-01', expiresOn: future(5) },
  VEHICLE_RC: { number: 'AP07AB1234', issuer: 'RTO Guntur (demo)', issuedOn: '2021-01-01', expiresOn: future(8) },
  INSURANCE: { number: 'POL-123456', issuer: 'Demo Insurance Co', issuedOn: '2026-01-01', expiresOn: future(1) },
  PUC: { number: 'PUC-1234', issuedOn: '2026-06-01', expiresOn: future(1) },
};

/** Uploads one document with valid details (over replaces some), as the applicant. */
export function upload(t, token, kind, docType, over = {}, file = pdf(docType), filename = 'document.pdf', contentType = 'application/pdf') {
  let r = request(t.app).post(`/api/v1/${kind}/onboarding/documents`).set(bearer(token)).field('docType', docType);
  for (const [k, v] of Object.entries({ ...DETAILS[docType], ...over })) if (v !== undefined && v !== null) r = r.field(k, v);
  return r.attach('file', file, { filename, contentType });
}

export const show = (t, token, kind) => request(t.app).get(`/api/v1/${kind}/onboarding`).set(bearer(token));
export const saveProfile = (t, token, kind, body) => request(t.app).put(`/api/v1/${kind}/onboarding/profile`).set(bearer(token)).send(body);
export const submit = (t, token, kind) => request(t.app).post(`/api/v1/${kind}/onboarding/submit`).set(bearer(token)).send({});

/** A seller whose answers and required documents are all in; optionally submitted. */
export async function readySeller(t, { profile = {}, submitted = true, extraDocs = [] } = {}) {
  const user = await t.makeUser({ roles: ['seller'], mfa: true });
  const token = t.tokenFor(user, 'seller');
  await saveProfile(t, token, 'seller', { ...SELLER_PROFILE, ...profile }).expect(200);
  const view = (await show(t, token, 'seller')).body;
  for (const r of view.requirements.filter((x) => x.required || extraDocs.includes(x.docType))) await upload(t, token, 'seller', r.docType).expect(201);
  if (submitted) await submit(t, token, 'seller').expect(200);
  return { user, token };
}

/** A rider with profile, vehicle and required documents; optionally submitted. */
export async function readyRider(t, { mode = 'scooter', submitted = true } = {}) {
  const user = await t.makeUser({ roles: ['rider'] });
  const token = t.tokenFor(user, 'rider', { mfa: false });
  await saveProfile(t, token, 'rider', RIDER_PROFILE).expect(200);
  await request(t.app).put('/api/v1/rider/onboarding/vehicle').set(bearer(token)).send(VEHICLES[mode]).expect(200);
  const view = (await show(t, token, 'rider')).body;
  for (const r of view.requirements.filter((x) => x.required)) await upload(t, token, 'rider', r.docType).expect(201);
  if (submitted) await submit(t, token, 'rider').expect(200);
  return { user, token };
}

/** Staff with a fresh second factor. */
export async function staffToken(t, role = 'admin') {
  const u = await t.makeUser({ roles: [role], password: null, mfa: true, name: `Test ${role} (demo)` });
  return { user: u, token: t.tokenFor(u, role) };
}

export const admin = (t, token) => ({
  get: (path) => request(t.app).get(`/api/v1/admin${path}`).set(ADMIN).set(bearer(token)),
  post: (path, body = {}) => request(t.app).post(`/api/v1/admin${path}`).set(ADMIN).set(bearer(token)).send(body),
  put: (path, body = {}) => request(t.app).put(`/api/v1/admin${path}`).set(ADMIN).set(bearer(token)).send(body),
});

/** The application ref of a person, from their own view. */
export const refOf = async (t, token, kind) => (await show(t, token, kind)).body.applicationId;

/** Approves every pending document, ticks every check and approves the application. */
export async function approveAll(t, staff, ref) {
  const a = admin(t, staff);
  let item = (await a.get(`/verification/item/${ref}`).expect(200)).body;
  for (const d of item.documents.filter((x) => x.status === 'PENDING')) await a.post(`/documents/${d.ref}/review`, { decision: 'approve' }).expect(200);
  for (const c of item.checkNames) await a.post(`/verification/item/${ref}/check`, { check: c, value: true }).expect(200);
  item = (await a.post(`/verification/item/${ref}/approve`).expect(200)).body;
  return item;
}
