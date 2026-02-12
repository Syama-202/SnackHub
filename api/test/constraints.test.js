// Prompt 2.1: the database itself refuses bad data. CHECK, UNIQUE and foreign keys,
// plus the append-only ledger, one accepted rider per order, and module isolation.
import { afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { connect, moduleDb, ER, expectError } from './helpers/db.js';

const { db, env, reason } = await connect();
if (!db) console.warn(`database tests skipped: ${reason}`);
afterAll(async () => {
  await db?.destroy();
});

const now = () => new Date();
let n = 0;
const uniq = () => `${Date.now()}${++n}`;

// minimal valid rows, created inside the test transaction
async function makeSeller(trx, over = {}) {
  const [id] = await trx('catalog.sellers').insert({ user_id: 900000000 + n++, shop_name: 'Test shop (demo)', city: 'Guntur', lat: 16.3, lng: 80.43, status: 'active', ...over });
  return id;
}
async function makeProduct(trx, sellerId, over = {}) {
  const [id] = await trx('catalog.products').insert({ seller_id: sellerId, slug: `test-${uniq()}`, title: 'Test snack', category: 'fried', serving_temp: 'HOT', prep_minutes: 10, price_paise: 5000, ...over });
  return id;
}
const order = (over = {}) => ({
  customer_id: 1,
  seller_id: 1,
  status: 'PLACED',
  temp_class: 'HOT',
  total_paise: 12900,
  payment_mode: 'ONLINE',
  address_text: 'Test address (demo)',
  drop_lat: 16.31,
  drop_lng: 80.43,
  distance_m: 1800,
  otp_hash: 'a'.repeat(64),
  idem_key: `idem-${uniq()}`,
  policy_id: 1,
  placed_at: now(),
  promised_at: new Date(Date.now() + 30 * 60000),
  ...over,
});
async function makeOrder(trx, over) {
  const [id] = await trx('ordering.orders').insert(order(over));
  return id;
}

describe.skipIf(!db)('database constraints', () => {
  let trx;
  beforeEach(async () => {
    trx = await db.transaction();
  });
  afterEach(async () => {
    await trx.rollback();
  });
  describe('CHECK', () => {
    it('stock can never go below zero', async () => {
      const p = await makeProduct(trx, await makeSeller(trx));
      await expectError(trx('catalog.stock').insert({ product_id: p, qty: -1 }), ER.CHECK_VIOLATED);
      await trx('catalog.stock').insert({ product_id: p, qty: 2 });
      await expectError(trx('catalog.stock').where({ product_id: p }).update({ qty: trx.raw('qty - 3') }), ER.CHECK_VIOLATED);
    });

    it('the stock decrement guard changes zero rows when units run out (doc 12.1 query 1)', async () => {
      const p = await makeProduct(trx, await makeSeller(trx));
      await trx('catalog.stock').insert({ product_id: p, qty: 3 });
      const take = (q) => trx.raw('UPDATE catalog.stock SET qty = qty - ? WHERE product_id = ? AND qty >= ?', [q, p, q]);
      expect((await take(2))[0].affectedRows).toBe(1);
      expect((await take(2))[0].affectedRows).toBe(0);
    });

    it('a product price is positive and the MRP is never below it', async () => {
      const s = await makeSeller(trx);
      await expectError(makeProduct(trx, s, { price_paise: 0 }), ER.CHECK_VIOLATED);
      await expectError(makeProduct(trx, s, { price_paise: 5000, mrp_paise: 4000 }), ER.CHECK_VIOLATED);
      await makeProduct(trx, s, { price_paise: 5000, mrp_paise: 6000 });
    });

    it('a shop sits on the globe with a sane delivery radius', async () => {
      await expectError(makeSeller(trx, { lat: 91 }), ER.CHECK_VIOLATED);
      await expectError(makeSeller(trx, { radius_km: 0 }), ER.CHECK_VIOLATED);
      await expectError(makeSeller(trx, { quality_score: 101 }), ER.CHECK_VIOLATED);
    });

    it('a review rating is 1 to 5', async () => {
      const o = await makeOrder(trx);
      await expectError(trx('ordering.order_reviews').insert({ order_id: o, customer_id: 1, rating: 6, created_at: now() }), ER.CHECK_VIOLATED);
      await expectError(trx('ordering.order_reviews').insert({ order_id: o, customer_id: 1, rating: 0, created_at: now() }), ER.CHECK_VIOLATED);
      await trx('ordering.order_reviews').insert({ order_id: o, customer_id: 1, rating: 5, created_at: now() });
    });

    it('only pay-on-delivery orders record cash collected, and the promise is after placing', async () => {
      await expectError(makeOrder(trx, { payment_mode: 'ONLINE', collected_paise: 12900 }), ER.CHECK_VIOLATED);
      await makeOrder(trx, { payment_mode: 'COD', collected_paise: 12900 });
      await expectError(makeOrder(trx, { promised_at: new Date(Date.now() - 60000) }), ER.CHECK_VIOLATED);
    });

    it('rider pay is never below zero', async () => {
      const row = { order_id: 990000001, rider_id: 1, base_paise: 2500, distance_paise: 1440, net_paise: -10, created_at: now() };
      await expectError(trx('dispatch.rider_earnings').insert(row), ER.CHECK_VIOLATED);
      await expectError(trx('dispatch.rider_earnings').insert({ ...row, net_paise: 3000, penalty_paise: -1 }), ER.CHECK_VIOLATED);
      await trx('dispatch.rider_earnings').insert({ ...row, net_paise: 3940 });
    });

    it('complaint fault shares add up to at most 100 percent', async () => {
      const o = await makeOrder(trx);
      const c = { order_id: o, seller_id: 1, customer_id: 1, category: 'DELIVERY', created_at: now() };
      await expectError(trx('ordering.complaints').insert({ ...c, rider_share_pct: 70, seller_share_pct: 40 }), ER.CHECK_VIOLATED);
      await expectError(trx('ordering.complaints').insert({ ...c, confidence: 1.5 }), ER.CHECK_VIOLATED);
      await trx('ordering.complaints').insert({ ...c, rider_share_pct: 60, seller_share_pct: 40 });
    });

    it('a verification decision needs a reason', async () => {
      const s = await makeSeller(trx);
      const a = { seller_id: s, status: 'REJECTED', submitted_at: now() };
      await expectError(trx('catalog.seller_applications').insert(a), ER.CHECK_VIOLATED);
      await trx('catalog.seller_applications').insert({ ...a, decision_reason: 'Licence number does not match the certificate' });
    });

    it('cash payment states belong to cash payments', async () => {
      const p = { order_id: 990000002, amount_paise: 12900, created_at: now(), updated_at: now() };
      await expectError(trx('payment.payments').insert({ ...p, method: 'RAZORPAY', status: 'COD_PENDING' }), ER.CHECK_VIOLATED);
      await expectError(trx('payment.payments').insert({ ...p, method: 'COD', status: 'CAPTURED' }), ER.CHECK_VIOLATED);
      await expectError(trx('payment.payments').insert({ ...p, method: 'RAZORPAY', status: 'CREATED', currency: 'USD' }), ER.CHECK_VIOLATED);
    });
  });

  describe('UNIQUE', () => {
    it('one account per email', async () => {
      const email = `dup-${uniq()}@example.test`;
      await trx('identity.users').insert({ email, name: 'Dup (demo)' });
      await expectError(trx('identity.users').insert({ email, name: 'Dup again (demo)' }), ER.DUP_ENTRY);
    });

    it('the same Idempotency-Key from the same customer cannot create two orders', async () => {
      const idem_key = `idem-${uniq()}`;
      await makeOrder(trx, { idem_key });
      await expectError(makeOrder(trx, { idem_key }), ER.DUP_ENTRY);
      // a different customer may reuse the same key
      await makeOrder(trx, { idem_key, customer_id: 2 });
    });

    it('a slug is unique within a shop', async () => {
      const s = await makeSeller(trx);
      await makeProduct(trx, s, { slug: 'same' });
      await expectError(makeProduct(trx, s, { slug: 'same' }), ER.DUP_ENTRY);
      await makeProduct(trx, await makeSeller(trx), { slug: 'same' });
    });

    it('a retried checkout finds its stock hold already there', async () => {
      const p = await makeProduct(trx, await makeSeller(trx));
      const hold = { order_key: `ok-${uniq()}`, product_id: p, qty: 2, expires_at: new Date(Date.now() + 120000) };
      await trx('catalog.stock_holds').insert(hold);
      const [res] = await trx.raw('INSERT IGNORE INTO catalog.stock_holds (order_key, product_id, qty, expires_at) VALUES (?, ?, ?, ?)', [hold.order_key, p, 2, hold.expires_at]);
      expect(res.affectedRows).toBe(0);
    });

    it('a webhook event id is processed once', async () => {
      const e = { event_id: `evt_${uniq()}`, type: 'payment.captured', payload: '{}', received_at: now() };
      await trx('payment.webhook_events').insert(e);
      await expectError(trx('payment.webhook_events').insert(e), ER.DUP_ENTRY);
    });

    it('one payment per order, and provider ids are never reused', async () => {
      const p = { method: 'RAZORPAY', amount_paise: 12900, status: 'CREATED', provider_order_id: `order_${uniq()}`, created_at: now(), updated_at: now() };
      await trx('payment.payments').insert({ ...p, order_id: 990000003 });
      await expectError(trx('payment.payments').insert({ ...p, order_id: 990000003, provider_order_id: `order_${uniq()}` }), ER.DUP_ENTRY);
      await expectError(trx('payment.payments').insert({ ...p, order_id: 990000004 }), ER.DUP_ENTRY);
    });

    it('one earnings row per order', async () => {
      const row = { order_id: 990000005, rider_id: 1, base_paise: 2500, distance_paise: 1440, net_paise: 3940, created_at: now() };
      await trx('dispatch.rider_earnings').insert(row);
      await expectError(trx('dispatch.rider_earnings').insert(row), ER.DUP_ENTRY);
    });

    it('only one rider can hold the accepted offer for an order', async () => {
      const a = { order_id: 990000006, offered_at: now() };
      await trx('dispatch.assignments').insert({ ...a, rider_id: 1, status: 'ACCEPTED' });
      await trx('dispatch.assignments').insert({ ...a, rider_id: 2, status: 'DECLINED' });
      await expectError(trx('dispatch.assignments').insert({ ...a, rider_id: 3, status: 'ACCEPTED' }), ER.DUP_ENTRY);
    });

    it('one complaint per category per order', async () => {
      const o = await makeOrder(trx);
      const c = { order_id: o, seller_id: 1, customer_id: 1, category: 'FOOD_QUALITY', created_at: now() };
      await trx('ordering.complaints').insert(c);
      await expectError(trx('ordering.complaints').insert(c), ER.DUP_ENTRY);
      await trx('ordering.complaints').insert({ ...c, category: 'DELIVERY' });
    });

    it('a re-delivered notification event is harmless', async () => {
      const row = { user_id: 1, order_id: 990000007, type: 'order.accepted', body: 'Shop accepted your order', created_at: now() };
      await trx('notify.notifications').insert(row);
      await expectError(trx('notify.notifications').insert(row), ER.DUP_ENTRY);
    });
  });

  describe('FOREIGN KEY', () => {
    it('a product needs a real shop, and a shop with products cannot be deleted', async () => {
      await expectError(makeProduct(trx, 999999999), ER.NO_REFERENCED_ROW);
      const s = await makeSeller(trx);
      await makeProduct(trx, s);
      await expectError(trx('catalog.sellers').where({ id: s }).delete(), ER.ROW_IS_REFERENCED);
    });

    it('stock and holds belong to a real product', async () => {
      await expectError(trx('catalog.stock').insert({ product_id: 999999999, qty: 1 }), ER.NO_REFERENCED_ROW);
      await expectError(trx('catalog.stock_holds').insert({ order_key: 'x', product_id: 999999999, qty: 1, expires_at: now() }), ER.NO_REFERENCED_ROW);
    });

    it('order lines, events and reviews belong to a real order', async () => {
      await expectError(trx('ordering.order_items').insert({ order_id: 999999999, product_id: 1, title: 'x', unit_price_paise: 100, qty: 1 }), ER.NO_REFERENCED_ROW);
      await expectError(trx('ordering.order_events').insert({ order_id: 999999999, to_status: 'PLACED', at: now() }), ER.NO_REFERENCED_ROW);
      await expectError(makeOrder(trx, { policy_id: 999999 }), ER.NO_REFERENCED_ROW);
    });

    it('an offer, a GPS point and a pay row need a real rider', async () => {
      await expectError(trx('dispatch.assignments').insert({ order_id: 1, rider_id: 999999999, status: 'OFFERED', offered_at: now() }), ER.NO_REFERENCED_ROW);
      await expectError(trx('dispatch.rider_trail').insert({ order_id: 1, rider_id: 999999999, lat: 16.3, lng: 80.4, at: now() }), ER.NO_REFERENCED_ROW);
    });

    it('a refund and a ledger entry need a real payment', async () => {
      await expectError(trx('payment.refunds').insert({ payment_id: 999999999, amount_paise: 100, status: 'PENDING', created_at: now() }), ER.NO_REFERENCED_ROW);
      await expectError(trx('payment.ledger_entries').insert({ payment_id: 999999999, entry_type: 'CHARGE', amount_paise: 100, created_at: now() }), ER.NO_REFERENCED_ROW);
    });
  });

  describe('append-only ledger', () => {
    it('ledger rows can be added but never changed or removed', async () => {
      const [pay] = await trx('payment.payments').insert({ order_id: 990000008, method: 'RAZORPAY', amount_paise: 12900, status: 'CAPTURED', created_at: now(), updated_at: now() });
      const [id] = await trx('payment.ledger_entries').insert({ payment_id: pay, entry_type: 'CHARGE', amount_paise: 12900, created_at: now() });
      await expectError(trx('payment.ledger_entries').where({ id }).update({ amount_paise: 1 }), ER.SIGNAL);
      await expectError(trx('payment.ledger_entries').where({ id }).delete(), ER.SIGNAL);
      // a correction is a new row
      await trx('payment.ledger_entries').insert({ payment_id: pay, entry_type: 'REFUND', amount_paise: 12900, created_at: now() });
    });
  });

  describe('JSON attributes', () => {
    it('spice is indexed from the attrs JSON column (doc 12.1b)', async () => {
      const p = await makeProduct(trx, await makeSeller(trx), { attrs: JSON.stringify({ spice: 3, tags: ['spicy'] }) });
      const row = await trx('catalog.products').where({ id: p }).first('spice');
      expect(row.spice).toBe('3');
    });
  });
});

describe.skipIf(!db)('module isolation', () => {
  it('each module user reaches its own schema only', async () => {
    const catalog = moduleDb(env, 'sh_catalog', 'catalog');
    try {
      await catalog.raw('SELECT COUNT(*) FROM catalog.products');
      await expectError(catalog.raw('SELECT COUNT(*) FROM identity.users'), ER.TABLE_ACCESS_DENIED);
      await expectError(catalog.raw('SELECT COUNT(*) FROM payment.payments'), ER.TABLE_ACCESS_DENIED);
    } finally {
      await catalog.destroy();
    }
  });

  it('a module user cannot change the schema', async () => {
    const payment = moduleDb(env, 'sh_payment', 'payment');
    try {
      await expectError(payment.raw('DROP TABLE payment.ledger_entries'), ER.TABLE_ACCESS_DENIED);
    } finally {
      await payment.destroy();
    }
  });
});

describe.skipIf(!db)('last-units race', () => {
  it('two buyers for the last units: exactly one wins (doc 10.8)', async () => {
    // committed rows so two real connections can race; removed afterwards
    const [s] = await db('catalog.sellers').insert({ user_id: 900000000 + n++, shop_name: 'Race shop (demo)', city: 'Guntur', lat: 16.3, lng: 80.43, status: 'active' });
    const [p] = await db('catalog.products').insert({ seller_id: s, slug: `race-${uniq()}`, title: 'Race snack', category: 'fried', serving_temp: 'HOT', prep_minutes: 10, price_paise: 5000 });
    await db('catalog.stock').insert({ product_id: p, qty: 3 });
    try {
      const buy = () =>
        db.transaction(async (t) => {
          const [res] = await t.raw('UPDATE catalog.stock SET qty = qty - ? WHERE product_id = ? AND qty >= ?', [2, p, 2]);
          return res.affectedRows;
        });
      const results = await Promise.all([buy(), buy()]);
      expect(results.sort()).toEqual([0, 1]);
      expect((await db('catalog.stock').where({ product_id: p }).first('qty')).qty).toBe(1);
    } finally {
      await db('catalog.stock').where({ product_id: p }).delete();
      await db('catalog.products').where({ id: p }).delete();
      await db('catalog.sellers').where({ id: s }).delete();
    }
  });
});
