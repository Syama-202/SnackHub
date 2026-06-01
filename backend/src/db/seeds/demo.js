// Demo data seed: the shared demo data (shared/seed/seed.js, the same data the frontend
// mock uses) shaped into table rows. Idempotent: rows are upserted by id, so running it
// again leaves the same state, and stock goes back to the seed values.
// Run it with `npm run seed` (scripts/seed.js).
//
// The verification queue starts with real work: the pending shops and one rider applicant
// have their details and placeholder PDFs (each says it is a demo, not a real document) in
// private storage, waiting for review.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildSeed } from '../../../../shared/seed/seed.js';
import { DEFAULT_POLICY } from '../../../../shared/domain/policy.js';
import { emptyChecks } from '../../../../shared/domain/verification.js';
import { DOC_TYPES } from '../../../../shared/domain/documents.js';
import { demoPdf } from './demoPdf.js';

// demo shops were verified at a fixed, fake date so every run writes the same value
const VERIFIED_AT = '2026-01-15 10:00:00';
const SUBMITTED_AT = '2026-02-20 11:30:00';

// someone who has applied to ride; the admin console's verification queue starts with them
const RIDER_APPLICANT = { id: 3001, name: 'Prakash N (demo applicant)', email: 'applicant1@example.test', role: 'rider' };

// fixed storage keys, so the seed writes the same files every time: de + kind + id
const demoKey = (kind, id) => `de${kind === 'seller' ? '5e' : 'a1'}${String(id).padStart(28, '0')}`;
const demoFile = (label) => demoPdf('SnackHub DEMO document', [`Not a real ${label}.`, 'Placeholder made by the demo seed.', 'Review it like any upload; nothing here is real.']);
const docRow = (kind, id, userId, applicationId, docType, extra = {}) => {
  const bytes = demoFile(DOC_TYPES[docType].label);
  return {
    id,
    user_id: userId,
    application_id: applicationId,
    doc_type: docType,
    version: 1,
    number_enc: null,
    number_last4: null,
    issuer: DOC_TYPES[docType].issuer ? 'Demo issuing office' : null,
    issued_on: DOC_TYPES[docType].issued ? '2025-06-01' : null,
    expires_on: null,
    storage_key: demoKey(kind, id),
    mime: 'application/pdf',
    size_bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    scan_status: 'not_scanned',
    status: 'PENDING',
    reviewer_id: null,
    reviewer_remarks: null,
    rejection_reason: null,
    reviewed_at: null,
    reminded_days: null,
    uploaded_at: SUBMITTED_AT,
    ...extra,
  };
};

export function seedRows(data = buildSeed()) {
  const users = new Map();
  const addUser = (u) => users.set(u.id, { status: 'active', ...users.get(u.id), ...u });
  for (const s of data.sellers) addUser({ id: s.userId, name: `${s.shopName} owner (demo seller)`, email: `seller${s.id}@example.test`, role: 'seller' });
  for (const r of data.riders) addUser({ id: r.userId, name: `${r.name} (demo rider)`, email: `rider${r.id}@example.test`, role: 'rider' });
  for (const u of data.users) addUser({ id: u.id, name: u.name, email: u.email, role: u.role });
  addUser(RIDER_APPLICANT);

  const cityName = Object.fromEntries(data.cities.map((c) => [c.id, c.name]));

  const pendingShops = data.sellers.filter((s) => s.status === 'pending');
  const sellerDocs = pendingShops.flatMap((s, i) =>
    ['OWNER_ID', 'PAN', 'FSSAI', 'BANK_PROOF'].map((t, j) => docRow('seller', i * 10 + j + 1, s.userId, i + 1, t, t === 'FSSAI' ? { expires_on: '2028-03-31' } : {})),
  );
  const riderDocs = [
    ['ID_PROOF', {}],
    ['PHOTO', {}],
    ['DRIVING_LICENCE', { expires_on: '2034-08-14' }],
    ['VEHICLE_RC', { expires_on: '2036-01-09' }],
    ['INSURANCE', { expires_on: '2027-01-31' }],
    ['PUC', { expires_on: '2026-12-15' }],
  ].map(([t, extra], j) => docRow('rider', j + 1, RIDER_APPLICANT.id, 1, t, extra));

  const allUsers = [...users.values()].sort((a, b) => a.id - b.id);
  return {
    users: allUsers.map(({ role: _r, ...u }) => ({ ...u, email_verified_at: VERIFIED_AT })),
    userRoles: allUsers.map((u) => ({ user_id: u.id, role: u.role, status: 'active', status_reason: null, granted_at: VERIFIED_AT })),
    addresses: data.addresses.map((a) => ({ id: a.id, user_id: 1, kind: a.kind, label: a.label, line: a.line, house: a.house ?? null, floor: a.floor ?? null, landmark: a.landmark ?? null, instructions: a.instructions ?? null, city: cityName[a.cityId], lat: a.lat, lng: a.lng, is_default: Boolean(a.isDefault) })),
    sellers: data.sellers.map((s) => ({
      id: s.id,
      user_id: s.userId,
      shop_name: s.shopName,
      kind: s.kind ?? 'shop',
      city: s.city,
      region: s.region,
      lat: s.lat,
      lng: s.lng,
      radius_km: s.radiusKm,
      busy_extra_min: s.busyExtraMin,
      paused: s.paused,
      open_hours: s.openHours,
      status: s.status,
      licence_no: s.licenceNo,
      licence_expires_on: s.licenceExpiresOn,
      is_demo: true,
      verified_at: s.verified ? VERIFIED_AT : null,
      quality_score: s.qualityScore,
    })),
    catalogItems: data.catalogItems.map((i) => ({
      id: i.id,
      slug: i.slug,
      title: i.title,
      description: i.description,
      category: i.category,
      serving_temp: i.servingTemp,
      active: true,
      attrs: JSON.stringify({ weight: i.weight, spice: i.spice, vegetarian: i.vegetarian, allergens: i.allergens, tags: i.tags, collections: i.collections, art: i.art }),
    })),
    products: data.products.map((p) => ({
      id: p.id,
      seller_id: p.sellerId,
      catalog_item_id: p.catalogItemId,
      slug: p.slug,
      title: p.title,
      description: p.description,
      category: p.category,
      region: p.region,
      serving_temp: p.servingTemp,
      prep_minutes: p.prepMinutes,
      price_paise: p.pricePaise,
      mrp_paise: p.mrpPaise,
      image_path: null,
      active: p.active,
      attrs: JSON.stringify({
        spice: p.spice,
        weight: p.weight,
        tags: p.tags,
        collections: p.collections,
        allergens: p.attrs.allergens,
        vegetarian: p.attrs.vegetarian,
        bestseller: p.bestseller,
        trending: p.trending,
        art: p.art,
        imageAlt: p.imageAlt,
        demoRating: p.rating,
        demoRatingCount: p.ratingCount,
      }),
    })),
    stock: data.products.map((p) => ({ product_id: p.id, qty: p.stock })),
    riders: data.riders.map((r) => ({
      id: r.id,
      user_id: r.userId,
      name: r.name,
      city: cityName[r.cityId],
      vehicle: r.vehicle,
      status: r.status,
      last_lat: r.lat,
      last_lng: r.lng,
      is_demo: true,
    })),
    // every shop still waiting for approval has an application under review (doc 16.4)
    sellerApplications: pendingShops.map((s, i) => ({
      id: i + 1,
      user_id: s.userId,
      seller_id: s.id,
      status: 'UNDER_REVIEW',
      checks: JSON.stringify({ ...emptyChecks('SELLER'), location: true, kitchen: true }),
      reviewer_id: null,
      decision_reason: null,
      submitted_at: SUBMITTED_AT,
      submit_count: 1,
      review_started_at: SUBMITTED_AT,
      decided_at: null,
    })),
    sellerBusinesses: pendingShops.map((s) => ({
      user_id: s.userId,
      owner_legal_name: `${s.shopName} owner (demo)`,
      business_type: 'sole_proprietorship',
      business_email: `seller${s.id}@example.test`,
      business_phone: '+919000000000',
      shop_name: s.shopName,
      kind: s.kind ?? 'shop',
      address_line: `Shop ${s.id}, Main Road (demo)`,
      state: s.region ?? 'Maharashtra',
      city: s.city,
      pin: '411001',
      lat: s.lat,
      lng: s.lng,
      radius_km: s.radiusKm,
      open_hours: s.openHours ?? '10:00-21:00',
      bank_holder: `${s.shopName} owner (demo)`,
      bank_ifsc: 'DEMO0000001',
      bank_account_enc: null,
      bank_account_last4: null,
    })),
    sellerDocuments: sellerDocs,
    riderApplications: [
      {
        id: 1,
        user_id: RIDER_APPLICANT.id,
        status: 'SUBMITTED',
        checks: JSON.stringify(emptyChecks('RIDER')),
        reviewer_id: null,
        decision_reason: null,
        rider_id: null,
        submitted_at: SUBMITTED_AT,
        submit_count: 1,
        review_started_at: null,
        decided_at: null,
      },
    ],
    riderProfiles: [
      {
        user_id: RIDER_APPLICANT.id,
        legal_name: RIDER_APPLICANT.name,
        dob: '1998-04-12',
        address_line: '12-3 Brodipet 4th Lane (demo)',
        state: 'Andhra Pradesh',
        city: 'Guntur',
        pin: '522002',
        emergency_name: 'Lakshmi N (demo)',
        emergency_phone: '+919000000001',
        background_consent_at: SUBMITTED_AT,
      },
    ],
    riderVehicles: [{ user_id: RIDER_APPLICANT.id, mode: 'scooter', registration_no: 'AP07DE0001', make_model: 'Demo scooter', owned_by_rider: true }],
    riderDocuments: riderDocs,
    policies: [{ id: DEFAULT_POLICY.version, effective_from: '2026-01-01 00:00:00', config: JSON.stringify(DEFAULT_POLICY) }],
  };
}

// table -> rows, in foreign-key order
const TARGETS = [
  ['identity.users', 'users'],
  ['identity.user_roles', 'userRoles'],
  ['identity.addresses', 'addresses'],
  ['catalog.sellers', 'sellers'],
  ['catalog.catalog_items', 'catalogItems'],
  ['catalog.products', 'products'],
  ['catalog.stock', 'stock'],
  ['dispatch.riders', 'riders'],
  ['catalog.seller_applications', 'sellerApplications'],
  ['catalog.seller_businesses', 'sellerBusinesses'],
  ['catalog.seller_documents', 'sellerDocuments'],
  ['dispatch.rider_applications', 'riderApplications'],
  ['dispatch.rider_profiles', 'riderProfiles'],
  ['dispatch.rider_vehicles', 'riderVehicles'],
  ['dispatch.rider_documents', 'riderDocuments'],
  ['ordering.delivery_policy', 'policies'],
];

/** The placeholder PDFs, in private storage under their fixed keys. */
async function writeDemoFiles(rows, storageDir) {
  const root = path.resolve(storageDir);
  for (const d of [...rows.sellerDocuments, ...rows.riderDocuments]) {
    const file = path.join(root, d.storage_key.slice(0, 2), d.storage_key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, demoFile(DOC_TYPES[d.doc_type].label), { mode: 0o600 });
  }
}

export async function seed(db, { storageDir = process.env.STORAGE_DIR || 'storage/private' } = {}) {
  const rows = seedRows();
  await writeDemoFiles(rows, storageDir);
  await db.transaction(async (trx) => {
    for (const [table, key] of TARGETS) {
      for (let i = 0; i < rows[key].length; i += 200) {
        await trx(table).insert(rows[key].slice(i, i + 200)).onConflict().merge();
      }
    }
    // a demo approval made a rider row for the applicant; the application is open again, so remove it
    await trx('dispatch.riders').where({ user_id: RIDER_APPLICANT.id }).del();
  });
  return Object.fromEntries(TARGETS.map(([table, key]) => [table, rows[key].length]));
}
