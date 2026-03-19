// Demo data seed: the shared demo data (shared/seed/seed.js, the same data the frontend
// mock uses) shaped into table rows. Idempotent: rows are upserted by id, so running it
// again leaves the same state, and stock goes back to the seed values.
// Run it with `npm run seed` (scripts/seed.js).
import { buildSeed } from '../../../../shared/seed/seed.js';
import { DEFAULT_POLICY } from '../../../../shared/domain/policy.js';
import { emptyChecks } from '../../../../shared/domain/applications.js';

// demo shops were verified at a fixed, fake date so every run writes the same value
const VERIFIED_AT = '2026-01-15 10:00:00';
const SUBMITTED_AT = '2026-02-20 11:30:00';

// a customer who has applied to ride; the admin console's approvals queue starts with them
const RIDER_APPLICANT = { id: 3001, name: 'Prakash N (demo applicant)', email: 'applicant1@example.test', role: 'customer' };

export function seedRows(data = buildSeed()) {
  const users = new Map();
  const addUser = (u) => users.set(u.id, { status: 'active', ...users.get(u.id), ...u });
  for (const s of data.sellers) addUser({ id: s.userId, name: `${s.shopName} owner (demo seller)`, email: `seller${s.id}@example.test`, role: 'seller' });
  for (const r of data.riders) addUser({ id: r.userId, name: `${r.name} (demo rider)`, email: `rider${r.id}@example.test`, role: 'rider' });
  for (const u of data.users) addUser({ id: u.id, name: u.name, email: u.email, role: u.role });
  addUser(RIDER_APPLICANT);

  const cityName = Object.fromEntries(data.cities.map((c) => [c.id, c.name]));

  return {
    users: [...users.values()].sort((a, b) => a.id - b.id),
    addresses: data.addresses.map((a) => ({ id: a.id, user_id: 1, label: a.label, line: a.line, city: cityName[a.cityId], lat: a.lat, lng: a.lng })),
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
      verified_at: s.verified ? VERIFIED_AT : null,
      quality_score: s.qualityScore,
    })),
    products: data.products.map((p) => ({
      id: p.id,
      seller_id: p.sellerId,
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
    })),
    // every shop still waiting for approval has an application under review (doc 16.4)
    sellerApplications: data.sellers
      .filter((s) => s.status === 'pending')
      .map((s, i) => ({
        id: i + 1,
        seller_id: s.id,
        status: 'UNDER_REVIEW',
        checks: JSON.stringify({ ...emptyChecks('SELLER'), identity: true, location: true, kitchen: true, menu: true }),
        reviewer_id: null,
        decision_reason: null,
        submitted_at: SUBMITTED_AT,
        decided_at: null,
      })),
    riderApplications: [
      {
        id: 1,
        user_id: RIDER_APPLICANT.id,
        name: RIDER_APPLICANT.name,
        city: 'Guntur',
        vehicle: 'Scooter',
        vehicle_no: 'AP07 DEMO 0001',
        licence_no: 'FAKE-DL-0001',
        status: 'SUBMITTED',
        checks: JSON.stringify({ ...emptyChecks('RIDER'), identity: true, licence: true, vehicle: true }),
        reviewer_id: null,
        decision_reason: null,
        rider_id: null,
        submitted_at: SUBMITTED_AT,
        decided_at: null,
      },
    ],
    policies: [{ id: DEFAULT_POLICY.version, effective_from: '2026-01-01 00:00:00', config: JSON.stringify(DEFAULT_POLICY) }],
  };
}

// table -> rows, in foreign-key order
const TARGETS = [
  ['identity.users', 'users'],
  ['identity.addresses', 'addresses'],
  ['catalog.sellers', 'sellers'],
  ['catalog.products', 'products'],
  ['catalog.stock', 'stock'],
  ['dispatch.riders', 'riders'],
  ['catalog.seller_applications', 'sellerApplications'],
  ['dispatch.rider_applications', 'riderApplications'],
  ['ordering.delivery_policy', 'policies'],
];

export async function seed(db) {
  const rows = seedRows();
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
