// Complaints, credit, fines, rider pay disputes, the delivery policy and the live board, on a
// real delivered order. Windows and times are moved in the database instead of waiting.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHarness, beginTest, request, bearer, ADMIN } from './helpers/app.js';
import { staffToken, admin } from './helpers/onboarding.js';
import { deliveredOrder, placeOrder, key } from './helpers/orders.js';
import { signAccessToken } from '../src/utils/tokens.js';

const h = await openHarness();
if (h.skip) console.warn(`complaint tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 9)]);
function report(t, token, orderId, fields, photos = []) {
  const r = request(t.app).post(`/api/v1/orders/${orderId}/complaints`).set(bearer(token));
  for (const [k, v] of Object.entries(fields)) r.field(k, String(v));
  for (const [i, p] of photos.entries()) r.attach('photos', p, { filename: `photo-${i}.jpg`, contentType: 'image/jpeg' });
  return r;
}

describe.skipIf(h.skip)('complaints, credit and operations', () => {
  let t;
  let staff;
  let boss;
  beforeEach(async () => {
    t = await beginTest(h);
    staff = await staffToken(t, 'reviewer');
    boss = await staffToken(t, 'admin');
  });
  afterEach(() => t.end());

  it('a missing-item report with a photo is resolved at once with a credit the next order uses', async () => {
    const { customer: c, order, shop } = await deliveredOrder(t, staff);
    // food quality needs a photo, and only items from this order
    expect((await report(t, c.token, order.id, { category: 'FOOD_QUALITY', subtype: 'MISSING_ITEM' }).expect(422)).body.error.code).toBe('PHOTO_REQUIRED');
    await report(t, c.token, order.id, { category: 'FOOD_QUALITY', subtype: 'MISSING_ITEM', itemIds: '999999' }, [jpeg()]).expect(422);
    await report(t, c.token, order.id, { category: 'FOOD_QUALITY', subtype: 'MADE_UP' }, [jpeg()]).expect(400);
    // a PDF is not a photo
    await report(t, c.token, order.id, { category: 'FOOD_QUALITY', subtype: 'MISSING_ITEM' }, [Buffer.from('%PDF-1.4\n%%EOF')]).expect(422);

    const made = (await report(t, c.token, order.id, { category: 'FOOD_QUALITY', subtype: 'MISSING_ITEM', itemIds: String(shop.product.id), description: 'One vada short' }, [jpeg()]).expect(201)).body;
    expect(made).toMatchObject({ status: 'RESOLVED', autoDecided: true, resolution: 'VALID', classification: 'FOOD_QUALITY', creditPaise: order.subtotalPaise, photoCount: 1 });
    expect(made.evidence).toMatchObject({ otpVerified: true, geofencePassed: true, pickupSealed: true });
    // once per kind of problem
    expect((await report(t, c.token, order.id, { category: 'FOOD_QUALITY', subtype: 'STALE' }, [jpeg()]).expect(409)).body.error.code).toBe('DUPLICATE');

    const credits = (await c.api.get('/me/credits').expect(200)).body;
    expect(credits).toEqual([expect.objectContaining({ amountPaise: order.subtotalPaise, usedOrderId: null })]);
    // the next pay-on-delivery order spends it; cancelling gives it back
    const quote = (await (async () => {
      await c.api.put('/cart', { productId: shop.product.id, qty: 1 }).expect(200);
      return c.api.post('/orders/quote', { addressId: c.address.id }).expect(200);
    })()).body;
    expect(quote.creditPaise).toBe(order.subtotalPaise);
    const next = (await c.api.post('/orders', { addressId: c.address.id }, { 'Idempotency-Key': key() }).expect(201)).body.order;
    expect(next.creditPaise).toBe(Math.min(order.subtotalPaise, next.subtotalPaise));
    expect(next.totalPaise).toBe(next.subtotalPaise + next.deliveryFeePaise - next.creditPaise);
    expect((await c.api.get('/me/credits').expect(200)).body[0].usedOrderId).toBe(next.id);
    await c.api.post(`/orders/${next.id}/cancel`).expect(200);
    expect((await c.api.get('/me/credits').expect(200)).body[0].usedOrderId).toBeNull();
  });

  it('closes the windows: 2 hours for food, 24 for delivery, and only after delivery', async () => {
    const { customer: c, order, shop } = await deliveredOrder(t, staff);
    await t.trx.ordering('orders').where({ id: order.id }).update({ delivered_at: new Date(Date.now() - 3 * 3600_000) });
    expect((await report(t, c.token, order.id, { category: 'FOOD_QUALITY', subtype: 'STALE' }, [jpeg()]).expect(409)).body.error.code).toBe('WINDOW_CLOSED');
    await report(t, c.token, order.id, { category: 'DELIVERY', subtype: 'RIDER_RUDE', description: 'Shouted at the gate' }).expect(201);
    const open = await placeOrder(c, shop, 1);
    expect((await report(t, c.token, open.id, { category: 'DELIVERY', subtype: 'LATE' }).expect(409)).body.error.code).toBe('NOT_DELIVERED');
    const stranger = await t.makeUser({ roles: ['customer'] });
    await report(t, t.tokenFor(stranger, 'customer', { mfa: false }), order.id, { category: 'OTHER', subtype: 'APP' }).expect(404);
  });

  it('an unsafe-food report hides the shop at once and waits for an admin', async () => {
    const { customer: c, order, shop } = await deliveredOrder(t, staff);
    const made = (await report(t, c.token, order.id, { category: 'FOOD_QUALITY', subtype: 'UNSAFE', description: 'Smelled off' }, [jpeg()]).expect(201)).body;
    expect(made).toMatchObject({ status: 'IN_REVIEW', safety: true, autoDecided: false });
    expect((await t.trx.catalog('sellers').where({ id: shop.shop.id }).first()).paused).toBe(1);
    const alert = await t.trx.ordering('outbox').where({ type: 'admin.alert' }).orderBy('id', 'desc').first();
    expect(typeof alert.payload === 'string' ? JSON.parse(alert.payload) : alert.payload).toMatchObject({ type: 'unsafe_food_report', orderId: order.id });
  });

  it('an admin decides with a fresh code: credit, fines, and a reversal with a reason', async () => {
    const { customer: c, order } = await deliveredOrder(t, staff);
    const made = (await report(t, c.token, order.id, { category: 'DELIVERY', subtype: 'RIDER_RUDE', description: 'Rude at the door' }).expect(201)).body;
    expect(made.status).toBe('IN_REVIEW');
    // reviewers do not decide complaints; admins do, on the admin host, with a recent code
    await admin(t, staff.token).get('/complaints').expect(403);
    await request(t.app).get('/api/v1/admin/complaints').set(bearer(boss.token)).expect(404);
    const stale = signAccessToken(h.env, { id: boss.user.id }, { role: 'admin', mfaAt: Date.now() - 10 * 60_000 });
    await admin(t, stale).post(`/complaints/${made.id}/decide`, { resolution: 'VALID', reason: 'Rider confirmed', creditPaise: 3000, riderFinePaise: 1000 }).expect(401);

    const queue = (await admin(t, boss.token).get('/complaints').expect(200)).body;
    expect(queue[0]).toMatchObject({ id: made.id, status: 'IN_REVIEW', evidence: expect.objectContaining({ deliveredAt: expect.any(Number) }) });
    const done = (await admin(t, boss.token).post(`/complaints/${made.id}/decide`, { resolution: 'VALID', reason: 'The rider confirmed it', creditPaise: 3000, riderFinePaise: 1000 }).expect(200)).body;
    expect(done).toMatchObject({ status: 'RESOLVED', resolution: 'VALID', creditPaise: 3000 });
    await admin(t, boss.token).post(`/complaints/${made.id}/decide`, { resolution: 'INVALID', reason: 'Twice' }).expect(409);
    const fines = (await admin(t, boss.token).get('/fines').expect(200)).body;
    const fine = fines.find((f) => f.complaintId === made.id);
    expect(fine).toMatchObject({ targetType: 'RIDER', amountPaise: 1000, status: 'APPLIED' });
    await admin(t, boss.token).post(`/fines/${fine.id}/reverse`, {}).expect(400);
    expect((await admin(t, boss.token).post(`/fines/${fine.id}/reverse`, { reason: 'Dashcam cleared the rider' }).expect(200)).body.status).toBe('REVERSED');
    await admin(t, boss.token).post(`/fines/${fine.id}/reverse`, { reason: 'Again' }).expect(409);
    await t.inbox();
    expect((await c.api.get('/me/notifications').expect(200)).body.some((n) => n.type === `complaint.decided.${made.id}`)).toBe(true);
  });

  it('a rider disputes a lateness cut once, within 48 hours, and an admin gives it back', async () => {
    const { rider: r, order } = await deliveredOrder(t, staff);
    const row = await t.trx.dispatch('rider_earnings').where({ order_id: order.id }).first();
    const [e] = (await r.api.get('/rider/earnings').expect(200)).body;
    expect((await r.api.post(`/rider/earnings/${e.id}/dispute`, { reason: 'Road closed by police' }).expect(409)).body.error.code).toBe('NOTHING_TO_DISPUTE');
    await t.trx.dispatch('rider_earnings').where({ id: row.id }).update({ penalty_paise: 800, net_paise: row.net_paise - 800 });
    expect((await r.api.post(`/rider/earnings/${e.id}/dispute`, { reason: 'Road closed by police' }).expect(200)).body).toMatchObject({ status: 'DISPUTED', disputeReason: 'Road closed by police' });
    await r.api.post(`/rider/earnings/${e.id}/dispute`, { reason: 'Again please' }).expect(409);
    const list = (await admin(t, boss.token).get('/earnings').expect(200)).body;
    expect(list[0]).toMatchObject({ id: e.id, status: 'DISPUTED' });
    const fixed = (await admin(t, boss.token).post(`/earnings/${e.id}/resolve`, { reverse: true, reason: 'Diversion confirmed' }).expect(200)).body;
    expect(fixed).toMatchObject({ status: 'ADJUSTED', adjustmentPaise: 800, netPaise: row.net_paise });

    // older than 48 hours: closed
    const { rider: r2, order: o2 } = await deliveredOrder(t, staff);
    await t.trx.dispatch('rider_earnings').where({ order_id: o2.id }).update({ penalty_paise: 500, created_at: new Date(Date.now() - 49 * 3600_000) });
    const [e2] = (await r2.api.get('/rider/earnings').expect(200)).body;
    expect((await r2.api.post(`/rider/earnings/${e2.id}/dispute`, { reason: 'Late reply' }).expect(409)).body.error.code).toBe('APPEAL_WINDOW_CLOSED');
  });

  it('a policy change is checked as a whole and saved as a new version with who made it', async () => {
    const before = (await admin(t, boss.token).get('/policy').expect(200)).body;
    await admin(t, boss.token).put('/policy', { arrivalGeofenceM: 500, otpRevealM: 400 }).expect(422);
    await admin(t, boss.token).put('/policy', { notAField: 1 }).expect(400);
    const saved = (await admin(t, boss.token).put('/policy', { deliveryFeePaise: before.current.deliveryFeePaise + 500, hot: { maxKm: 2.5 } }).expect(200)).body;
    expect(saved).toMatchObject({ version: before.current.version + 1, deliveryFeePaise: before.current.deliveryFeePaise + 500, hot: { maxKm: 2.5, maxRideMin: before.current.hot.maxRideMin } });
    const after = (await admin(t, boss.token).get('/policy').expect(200)).body;
    expect(after.history[0]).toMatchObject({ version: saved.version, changedBy: `staff #${boss.user.id}` });
  });

  it('the live board shows the server’s own numbers, for admins only', async () => {
    const { order } = await deliveredOrder(t, staff);
    const sla = (await admin(t, boss.token).get('/metrics/sla').expect(200)).body;
    expect(sla).toMatchObject({ activeOrders: expect.any(Number), onTimeRate: expect.any(Number) });
    const orders = (await admin(t, boss.token).get('/orders').expect(200)).body;
    expect(orders.find((o) => o.id === order.id)).toMatchObject({ status: 'DELIVERED', cashMismatch: false, track: expect.objectContaining({ progress: 1 }) });
    expect((await admin(t, boss.token).get('/reconciliation').expect(200)).body.find((x) => x.orderId === order.id)).toMatchObject({ mismatch: false });
    // the long lists take a size: one row when asked for one, and never more than 500
    expect((await admin(t, boss.token).get('/orders?limit=1').expect(200)).body).toHaveLength(1);
    expect((await admin(t, boss.token).get('/reconciliation?limit=1').expect(200)).body).toHaveLength(1);
    for (const list of ['/complaints', '/fines', '/earnings']) await admin(t, boss.token).get(`${list}?limit=5`).expect(200);
    await admin(t, boss.token).get('/orders?limit=0').expect(400);
    await admin(t, boss.token).get('/fines?limit=501').expect(400);
    await admin(t, boss.token).get('/orders?before=3').expect(400);
    // finding an order by its number, by the shop's name or by status
    expect((await admin(t, boss.token).get(`/orders?q=${order.id}`).expect(200)).body.map((o) => o.id)).toEqual([order.id]);
    expect((await admin(t, boss.token).get(`/orders?q=%23${order.id}&status=DELIVERED`).expect(200)).body).toHaveLength(1);
    expect((await admin(t, boss.token).get(`/orders?q=${order.id}&status=PLACED`).expect(200)).body).toHaveLength(0);
    const shopName = (await admin(t, boss.token).get(`/orders?q=${order.id}`).expect(200)).body[0].seller.shopName;
    expect((await admin(t, boss.token).get(`/orders?q=${encodeURIComponent(shopName.slice(0, 6))}&limit=500`).expect(200)).body.some((o) => o.id === order.id)).toBe(true);
    // a wildcard is plain text, not "match everything"
    expect((await admin(t, boss.token).get('/orders?q=%25%25%25').expect(200)).body).toHaveLength(0);
    await admin(t, boss.token).get('/orders?status=NOPE').expect(400);
    await admin(t, staff.token).get('/orders').expect(403);
    await request(t.app).get('/api/v1/admin/orders').set(ADMIN).set(bearer(t.tokenFor(await t.makeUser(), 'customer', { mfa: false }))).expect(403);
  });
});
