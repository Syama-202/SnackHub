// npm run seed: loads the shared demo data (shared/seed/seed.js, the same data the web
// mock uses) into MySQL. Idempotent: rows are upserted by id, so running it again leaves
// the same state, and stock goes back to the seed values.
import { pathToFileURL } from 'node:url';
import { loadEnv } from '../src/config/env.js';
import { migratorDb } from '../src/db/knex.js';
import { buildSeed } from '../../shared/seed/seed.js';
import { DEFAULT_POLICY } from '../../shared/domain/policy.js';

// demo shops were verified at a fixed, fake date so every run writes the same value
const VERIFIED_AT = '2026-01-15 10:00:00';

export function seedRows(data = buildSeed()) {
  const users = new Map();
  const addUser = (u) => users.set(u.id, { status: 'active', ...users.get(u.id), ...u });
  for (const s of data.sellers) addUser({ id: s.userId, name: `${s.shopName} owner (demo seller)`, email: `seller${s.id}@example.test`, role: 'seller' });
  for (const r of data.riders) addUser({ id: r.userId, name: `${r.name} (demo rider)`, email: `rider${r.id}@example.test`, role: 'rider' });
  for (const u of data.users) addUser({ id: u.id, name: u.name, email: u.email, role: u.role });

  const cityName = Object.fromEntries(data.cities.map((c) => [c.id, c.name]));

  return {
    users: [...users.values()].sort((a, b) => a.id - b.id),
    addresses: data.addresses.map((a) => ({ id: a.id, user_id: 1, label: a.label, line: a.line, city: cityName[a.cityId], lat: a.lat, lng: a.lng })),
    sellers: data.sellers.map((s) => ({
      id: s.id,
      user_id: s.userId,
      shop_name: s.shopName,
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
  });
  return Object.fromEntries(TARGETS.map(([table, key]) => [table, rows[key].length]));
}

// run only when called as a script, not when the tests import seedRows()
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = migratorDb(loadEnv());
  try {
    const counts = await seed(db);
    for (const [table, n] of Object.entries(counts)) console.log(`${table.padEnd(26)} ${n}`);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}
