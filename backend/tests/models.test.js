// The models against the real schemas, each logged in as its own module user (least
// privilege). Every test runs in a transaction that is rolled back, so the seed stays as it is.
import { afterAll, describe, expect, it } from 'vitest';
import { connect } from './helpers/db.js';
import { moduleDb } from '../src/db/connection.js';
import {
  sellerModel, productModel, stockModel, stockHoldModel, orderModel, webhookEventModel, assignmentModel,
  notificationModel, paymentModel, ledgerEntryModel, outboxModel, addressModel,
} from '../src/models/index.js';

const { db: migrator, env, reason } = await connect();
if (!migrator) console.warn(`model tests skipped: ${reason}`);
const dbs = migrator ? Object.fromEntries(['identity', 'catalog', 'ordering', 'dispatch', 'payment', 'notify'].map((m) => [m, moduleDb(env, m)])) : {};
afterAll(async () => {
  await Promise.all([migrator, ...Object.values(dbs)].filter(Boolean).map((d) => d.destroy()));
});

// run fn inside a transaction on one module's pool, then roll everything back
async function inTrx(module, fn) {
  const trx = await dbs[module].transaction();
  try {
    return await fn(trx);
  } finally {
    await trx.rollback();
  }
}

const BRODIPET = { lat: 16.3152, lng: 80.4301 }; // demo home address in Guntur

describe.skipIf(!migrator)('catalog models', () => {
  it('measures distance with the right axis order (Guntur to Vijayawada is about 31 km)', async () => {
    const [[row]] = await dbs.catalog.raw('SELECT ST_Distance_Sphere(POINT(80.4365, 16.3067), POINT(80.648, 16.5062)) AS m');
    expect(row.m).toBeGreaterThan(28_000);
    expect(row.m).toBeLessThan(35_000);
  });

  it('finds only the shops that can reach the address, nearest first (doc 12.1, query 2)', async () => {
    const shops = await sellerModel.listServiceable(dbs.catalog, { ...BRODIPET, maxKm: 3 });
    expect(shops.length).toBeGreaterThan(0);
    expect(shops.every((s) => s.city === 'Guntur')).toBe(true);
    expect(shops.every((s) => s.distance_m <= 3000)).toBe(true);
    expect(shops.map((s) => s.distance_m)).toEqual([...shops.map((s) => s.distance_m)].sort((a, b) => a - b));
  });

  it('never shows suspended, pending or paused shops', async () => {
    const jaipur = { lat: 26.9124, lng: 75.7873 };
    const shops = await sellerModel.listServiceable(dbs.catalog, { ...jaipur, maxKm: 5 });
    expect(shops.some((s) => s.status === 'suspended')).toBe(false);
    await inTrx('catalog', async (trx) => {
      const [first] = await sellerModel.listServiceable(trx, { ...BRODIPET, maxKm: 3 });
      await sellerModel.setPaused(trx, first.id, true);
      const after = await sellerModel.listServiceable(trx, { ...BRODIPET, maxKm: 3 });
      expect(after.some((s) => s.id === first.id)).toBe(false);
    });
  });

  it('holds stock once per checkout and refuses the last units to a second buyer (doc 10.8)', async () => {
    await inTrx('catalog', async (trx) => {
      const mirchi = (await productModel.listBySeller(trx, 1)).find((p) => p.title === 'Mirchi Bajji');
      expect(mirchi.attrs.spice).toBe(3);
      expect(await stockModel.getQty(trx, mirchi.id)).toBe(3);

      const item = [{ productId: mirchi.id, qty: 2 }];
      expect(await stockHoldModel.reserve(trx, 'checkout-a', item, 2)).toEqual({ ok: true });
      expect(await stockHoldModel.reserve(trx, 'checkout-a', item, 2)).toEqual({ ok: true }); // retry: no second decrement
      expect(await stockModel.getQty(trx, mirchi.id)).toBe(1);
      expect(await stockHoldModel.reserve(trx, 'checkout-b', item, 2)).toEqual({ ok: false, productId: mirchi.id, available: 1 });

      expect(await stockHoldModel.release(trx, 'checkout-a')).toBe(1);
      expect(await stockModel.getQty(trx, mirchi.id)).toBe(3);
    });
  });
});

describe.skipIf(!migrator)('ordering models', () => {
  const order = () => ({
    customer_id: 1, seller_id: 1, status: 'PLACED', temp_class: 'HOT', total_paise: 12900, payment_mode: 'COD',
    address_text: 'Test address (demo)', drop_lat: 16.31, drop_lng: 80.43, distance_m: 1800, otp_hash: 'b'.repeat(64),
    idem_key: `idem-${Date.now()}`, policy_id: 1, placed_at: new Date(), promised_at: new Date(Date.now() + 30 * 60000),
  });

  it('changes status only through canTransition, once, with a history row', async () => {
    await inTrx('ordering', async (trx) => {
      const id = await orderModel.create(trx, order());
      expect(await orderModel.transition(trx, id, { from: 'PLACED', to: 'ACCEPTED', actorId: 1001, role: 'seller' })).toBe(true);
      // a second seller tab acting on the old status loses
      expect(await orderModel.transition(trx, id, { from: 'PLACED', to: 'ACCEPTED', actorId: 1001, role: 'seller' })).toBe(false);
      await expect(orderModel.transition(trx, id, { from: 'ACCEPTED', to: 'PACKED', role: 'customer' })).rejects.toMatchObject({ code: 'BAD_TRANSITION' });
      expect((await orderModel.events(trx, id)).map((e) => e.to_status)).toEqual(['ACCEPTED']);
    });
  });

  it('never returns the delivery code hash or the idempotency key in a read', async () => {
    await inTrx('ordering', async (trx) => {
      const o = order();
      const id = await orderModel.create(trx, o);
      const read = await orderModel.findByIdempotencyKey(trx, 1, o.idem_key);
      expect(read.id).toBe(id);
      expect(read).not.toHaveProperty('otp_hash');
      expect(read).not.toHaveProperty('idem_key');
    });
  });
});

describe.skipIf(!migrator)('dispatch, payment and notify models', () => {
  it('lets only one rider accept an order', async () => {
    await inTrx('dispatch', async (trx) => {
      const a = await assignmentModel.offer(trx, 990001, 1);
      const b = await assignmentModel.offer(trx, 990001, 2);
      expect(await assignmentModel.accept(trx, a, 1)).toBe(true);
      expect(await assignmentModel.accept(trx, b, 2)).toBe(false);
      expect((await assignmentModel.findAccepted(trx, 990001)).rider_id).toBe(1);
    });
  });

  it('processes a webhook event once and keeps the ledger balance', async () => {
    await inTrx('payment', async (trx) => {
      const evt = { eventId: `evt_${Date.now()}`, type: 'payment.captured', payload: { demo: true } };
      expect(await webhookEventModel.record(trx, evt)).toBe(true);
      expect(await webhookEventModel.record(trx, evt)).toBe(false);

      const pay = await paymentModel.create(trx, { order_id: 990002, method: 'RAZORPAY', amount_paise: 12900, status: 'CREATED' });
      expect(await paymentModel.moveStatus(trx, pay, 'CREATED', 'CAPTURED')).toBe(true);
      expect(await paymentModel.moveStatus(trx, pay, 'CREATED', 'FAILED')).toBe(false); // a late failure cannot undo a capture
      await ledgerEntryModel.append(trx, { paymentId: pay, entryType: 'CHARGE', amountPaise: 12900 });
      await ledgerEntryModel.append(trx, { paymentId: pay, entryType: 'REFUND', amountPaise: 2900 });
      expect(await ledgerEntryModel.balance(trx, pay)).toBe(10000);

      await outboxModel.add(trx, 'payment.captured', { paymentId: pay });
      const claimed = await outboxModel.claim(trx, 10);
      expect(claimed.some((r) => r.type === 'payment.captured')).toBe(true);
    });
  });

  it('sends a notification once per order, type and person', async () => {
    await inTrx('notify', async (trx) => {
      const n = { userId: 1, orderId: 990003, type: 'order.accepted', body: 'The shop accepted your order' };
      expect(await notificationModel.create(trx, n)).toBe(true);
      expect(await notificationModel.create(trx, n)).toBe(false);
      expect(await notificationModel.unreadCount(trx, 1)).toBeGreaterThanOrEqual(1);
    });
  });

  it('scopes addresses to their owner', async () => {
    await inTrx('identity', async (trx) => {
      const [home] = await addressModel.listByUser(trx, 1);
      expect(await addressModel.findForUser(trx, home.id, 1)).toBeTruthy();
      expect(await addressModel.findForUser(trx, home.id, 9001)).toBeUndefined();
    });
  });
});
