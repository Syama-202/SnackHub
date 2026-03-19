import { buildSeed } from '@shared/seed/seed';
import { DEFAULT_POLICY } from '@shared/domain/policy';
import { computeEarning } from '@shared/domain/penalty';

const KEY = 'snackhub.mockdb.v1';
let mem = null;

// A fingerprint of the demo seed: when the catalogue changes (new snacks, shops or cities), a
// browser that kept the old mock data rebuilds it, so new products can go in the cart.
const seedShape = () => {
  const s = buildSeed();
  return `${s.cities.length}.${s.sellers.length}.${s.products.length}.${s.riders.length}`;
};
let shape = null;
const currentShape = () => (shape ??= seedShape());

const minutesAgo = (m) => Date.now() - m * 60000;

function fresh() {
  const seed = buildSeed();
  const db = {
    ...seed,
    policy: DEFAULT_POLICY,
    policyHistory: [{ ...DEFAULT_POLICY, effectiveFrom: new Date(minutesAgo(60 * 24 * 30)).toISOString(), changedBy: 'seed' }],
    carts: {},
    orders: [],
    orderEvents: [],
    payments: [],
    notifications: [],
    assignments: [],
    earnings: [],
    complaints: [],
    fines: [],
    credits: [],
    applications: [],
    audit: [],
    idem: {},
    otpPlain: {}, // demo only: a real server stores the hash and never the code
    seq: { order: 1040, payment: 500, notification: 1, assignment: 1, earning: 1, complaint: 1, fine: 1, application: 1, audit: 1, event: 1 },
  };
  seedHistory(db);
  return db;
}

/** A little history so the seller, rider and admin consoles are not empty. */
function seedHistory(db) {
  const shop = db.sellers[0];
  const prods = db.products.filter((p) => p.sellerId === shop.id);
  const addr = db.addresses[0];
  const mk = (over) => {
    const id = db.seq.order++;
    const items = [{ productId: prods[0].id, title: prods[0].title, unitPricePaise: prods[0].pricePaise, qty: 2 }, { productId: prods[3].id, title: prods[3].title, unitPricePaise: prods[3].pricePaise, qty: 1 }];
    const sub = items.reduce((s, i) => s + i.unitPricePaise * i.qty, 0);
    return {
      id, customerId: 1, sellerId: shop.id, riderId: 1, status: 'DELIVERED', tempClass: 'HOT', items,
      subtotalPaise: sub, deliveryFeePaise: db.policy.deliveryFeePaise, totalPaise: sub + db.policy.deliveryFeePaise,
      paymentMode: 'ONLINE', paymentStatus: 'CAPTURED', addressText: addr.line, drop: { lat: addr.lat, lng: addr.lng },
      distanceM: 1900, policyVersion: 1, simSeller: false, simRider: false, otpAttempts: 0, otpLocked: false,
      ...over,
    };
  };
  // Three worked cases from doc 27.2 (T6), recorded as past deliveries
  const cases = [
    { label: 'A: rider only', lateMin: 14, sellerDelayMin: 0 },
    { label: 'B: seller only', lateMin: 14, sellerDelayMin: 12 },
    { label: 'C: shared', lateMin: 14, sellerDelayMin: 5 },
  ];
  cases.forEach((c, i) => {
    const placed = minutesAgo(60 * 24 * (i + 1) + 120);
    const promised = placed + 28 * 60000;
    const o = mk({ placedAt: placed, promisedAt: promised, deliveredAt: promised + c.lateMin * 60000, packedAt: placed + (14 + c.sellerDelayMin) * 60000, sellerDelayMin: c.sellerDelayMin });
    db.orders.push(o);
    const e = computeEarning({ km: 1.9, lateMin: c.lateMin, sellerDelayMin: c.sellerDelayMin }, db.policy);
    db.earnings.push({ id: db.seq.earning++, orderId: o.id, riderId: 1, status: 'OK', caseLabel: c.label, createdAt: o.deliveredAt, ...e });
  });
  // An on-time one with a bonus
  const placed = minutesAgo(60 * 5);
  const ot = mk({ placedAt: placed, promisedAt: placed + 28 * 60000, deliveredAt: placed + 24 * 60000, packedAt: placed + 11 * 60000, sellerDelayMin: 0 });
  db.orders.push(ot);
  db.earnings.push({ id: db.seq.earning++, orderId: ot.id, riderId: 1, status: 'OK', createdAt: ot.deliveredAt, ...computeEarning({ km: 2.4, lateMin: -4 }, db.policy) });

  // One complaint waiting for an admin
  db.complaints.push({
    id: db.seq.complaint++, orderId: db.orders[0].id, customerId: 1, sellerId: shop.id, riderId: 1,
    category: 'DELIVERY', subtype: 'LATE', description: 'Arrived about 14 minutes after the promised time.',
    status: 'IN_REVIEW', classification: 'DELIVERY', confidence: 0.62, riderSharePct: 100, sellerSharePct: 0,
    autoDecided: false, createdAt: minutesAgo(60 * 20),
    evidence: { promisedAt: db.orders[0].promisedAt, deliveredAt: db.orders[0].deliveredAt, sellerDelayMin: 0, riderLateMin: 12, otpVerified: true, geofencePassed: true, pickupSealed: true },
  });

  // Applications waiting for approval (doc 16.4)
  const pune2 = db.sellers.find((s) => s.cityId === 'pune' && s.status === 'pending');
  db.applications.push(
    { id: db.seq.application++, kind: 'SELLER', sellerId: pune2.id, name: pune2.shopName, city: 'Pune', status: 'UNDER_REVIEW', submittedAt: minutesAgo(60 * 30), licenceNo: pune2.licenceNo, checks: { identity: true, licence: false, location: true, kitchen: true, menu: true, testOrder: false } },
    { id: db.seq.application++, kind: 'RIDER', name: 'Prakash N (demo applicant)', city: 'Guntur', vehicle: 'Scooter', status: 'SUBMITTED', submittedAt: minutesAgo(90), checks: { identity: true, licence: true, vehicle: true } },
  );

  // One manual order waiting in the seller's "New" column
  const nowPlaced = Date.now() - 20000;
  const pending = mk({ status: 'PLACED', riderId: null, placedAt: nowPlaced, promisedAt: nowPlaced + 28 * 60000, deliveredAt: null, packedAt: null, paymentMode: 'COD', paymentStatus: 'COD_PENDING' });
  db.orders.push(pending);
}

export function getDb() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      if (stored.seedShape === currentShape()) {
        mem = stored;
        return mem;
      }
      return resetDb();
    }
  } catch {
    /* storage blocked: fall back to memory */
  }
  if (!mem) mem = { ...fresh(), seedShape: currentShape() };
  return mem;
}

const GEN_KEY = `${KEY}.gen`;
const currentGen = () => {
  try {
    return localStorage.getItem(GEN_KEY);
  } catch {
    return null;
  }
};

export function saveDb(db) {
  // A request that loaded the data before a reset must not write the old data back
  const gen = currentGen();
  if (gen && db.gen !== gen) return;
  mem = db;
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* ignore */
  }
}

export function resetDb() {
  mem = { ...fresh(), gen: String(Date.now()), seedShape: currentShape() };
  try {
    localStorage.setItem(GEN_KEY, mem.gen);
  } catch {
    /* ignore */
  }
  saveDb(mem);
  return mem;
}

export const nextId = (db, k) => db.seq[k]++;
