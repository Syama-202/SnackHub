import { http, HttpResponse, delay } from 'msw';
import { getDb, saveDb, resetDb, nextId } from './db';
import { tick, addEvent, notify, acceptOrder, assignRider, deliver, trackState, releaseStock } from './simulate';
import { deliveryPromise, cartTempClass } from '../domain/promise';
import { distanceM } from '../domain/geo';
import { canTransition } from '../domain/orderStates';
import { triage, canAutoResolve } from '../domain/triage';
import { computeEarning } from '../domain/penalty';

const API = '/api/v1';
let reqSeq = 1;
const rid = () => `req_${Date.now().toString(36)}_${(reqSeq++).toString(36)}`;

/** One error envelope with a requestId (doc 11.4). */
const fail = (status, code, message, details) =>
  HttpResponse.json({ error: { code, message, requestId: rid(), ...(details ? { details } : {}) } }, { status });
const ok = (data, status = 200) => HttpResponse.json(data, { status });

// --- auth: demo tokens look like demo.<role>.<userId>[.<mfaAt>]
function who(request) {
  const h = request.headers.get('authorization') || '';
  const [, tok] = h.split(' ');
  if (!tok?.startsWith('demo.')) return null;
  const [, role, id, mfaAt] = tok.split('.');
  return { role, userId: Number(id), mfaAt: mfaAt ? Number(mfaAt) : null };
}

/** Role comes from the token, never the body. */
function guard(request, roles) {
  const u = who(request);
  if (!u) return { res: fail(401, 'UNAUTHENTICATED', 'Sign in first') };
  if (roles && !roles.includes(u.role)) return { res: fail(403, 'FORBIDDEN', 'Your role cannot do this') };
  return { u };
}

/** Admin routes: 404 on the public host, then role, then fresh MFA (doc 16.3). */
function adminGuard(request, { stepUp = false } = {}) {
  if (request.headers.get('x-snackhub-host') !== 'admin') return { res: fail(404, 'NOT_FOUND', 'Not found') };
  const u = who(request);
  if (!u) return { res: fail(401, 'UNAUTHENTICATED', 'Sign in first') };
  if (u.role !== 'admin') return { res: fail(403, 'FORBIDDEN', 'Admins only') };
  const maxAge = stepUp ? 5 * 60000 : 8 * 3600000;
  if (!u.mfaAt || Date.now() - u.mfaAt > maxAge) return { res: fail(401, 'MFA_REQUIRED', stepUp ? 'Confirm your code again for this action' : 'Second factor required') };
  return { u };
}

function audit(db, actor, action, before, after) {
  db.audit.unshift({ id: nextId(db, 'audit'), actor: `admin:${actor.userId}`, action, before, after, at: Date.now() });
}

/** Wrap a handler: load db, run the simulator, save after. */
const withDb = (fn) => async (ctx) => {
  await delay(120 + Math.random() * 180);
  const db = getDb();
  tick(db);
  const res = await fn({ ...ctx, db });
  saveDb(db);
  return res;
};

const visibleSeller = (s) => ['active', 'probation'].includes(s.status) && !s.paused;
const sellerPublic = (s) => ({ id: s.id, shopName: s.shopName, city: s.city, region: s.region, lat: s.lat, lng: s.lng, rating: s.rating, verified: s.verified, isNew: s.isNew, busyExtraMin: s.busyExtraMin, qualityScore: s.qualityScore, licenceValid: true });

function promiseFor(db, seller, point, temp) {
  const km = distanceM(seller, point) / 1000;
  return { ...deliveryPromise({ straightKm: km, temp, busyExtraMin: seller.busyExtraMin, sellerRadiusKm: seller.radiusKm }, db.policy), distanceKm: +km.toFixed(2) };
}

function serviceableSellers(db, lat, lng, temp) {
  const point = { lat, lng };
  return db.sellers
    .filter(visibleSeller)
    .map((s) => {
      const hasHot = db.products.some((p) => p.sellerId === s.id && p.servingTemp === 'HOT');
      const hot = promiseFor(db, s, point, 'HOT');
      const amb = promiseFor(db, s, point, 'AMBIENT');
      return { ...sellerPublic(s), promise: { HOT: hasHot ? hot : null, AMBIENT: amb }, distanceKm: amb.distanceKm };
    })
    .filter((s) => (temp === 'HOT' ? s.promise.HOT?.serviceable : s.promise.AMBIENT.serviceable || s.promise.HOT?.serviceable))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

function cartView(db, userId) {
  const cart = db.carts[userId] || { sellerId: null, items: [] };
  const items = cart.items
    .map((i) => {
      const p = db.products.find((x) => x.id === i.productId);
      return p ? { productId: p.id, qty: i.qty, title: p.title, pricePaise: p.pricePaise, servingTemp: p.servingTemp, stock: p.stock, art: p.art, weight: p.weight } : null;
    })
    .filter(Boolean);
  const subtotalPaise = items.reduce((s, i) => s + i.pricePaise * i.qty, 0);
  const seller = cart.sellerId ? db.sellers.find((s) => s.id === cart.sellerId) : null;
  return { sellerId: cart.sellerId, seller: seller ? sellerPublic(seller) : null, items, subtotalPaise, deliveryFeePaise: items.length ? db.policy.deliveryFeePaise : 0, tempClass: items.length ? cartTempClass(items) : null };
}

/** Order payloads never contain the delivery code (doc 10.3). */
function orderView(db, o, viewer = 'customer') {
  const seller = db.sellers.find((s) => s.id === o.sellerId);
  const rider = o.riderId ? db.riders.find((r) => r.id === o.riderId) : null;
  const v = {
    id: o.id, status: o.status, tempClass: o.tempClass, items: o.items, subtotalPaise: o.subtotalPaise, deliveryFeePaise: o.deliveryFeePaise,
    creditPaise: o.creditPaise || 0, totalPaise: o.totalPaise, paymentMode: o.paymentMode, paymentStatus: o.paymentStatus,
    placedAt: o.placedAt, promisedAt: o.promisedAt, acceptedAt: o.acceptedAt, packedAt: o.packedAt, pickedAt: o.pickedAt, arrivedAt: o.arrivedAt, deliveredAt: o.deliveredAt,
    promiseWindow: o.promiseWindow, cancelReason: o.cancelReason, simulated: o.simSeller || o.simRider,
    seller: seller ? { id: seller.id, shopName: seller.shopName, city: seller.city, lat: seller.lat, lng: seller.lng } : null,
    rider: rider ? { id: rider.id, name: rider.name, vehicle: rider.vehicle, rating: rider.rating } : null,
    events: db.orderEvents.filter((e) => e.orderId === o.id),
    otpRevealed: Boolean(o.otpRevealed), otpLocked: Boolean(o.otpLocked),
  };
  // Seller and rider never see the customer's address details beyond what the job needs
  if (viewer === 'customer' || viewer === 'admin') v.addressText = o.addressText;
  if (viewer === 'rider') v.addressText = o.addressText.replace(/^[^,]+,\s*/, '');
  if (viewer !== 'seller') v.drop = o.drop;
  return v;
}

export const handlers = [
  // ---------- platform
  http.get(`${API}/health`, () => ok({ status: 'ok' })),
  http.post(`${API}/dev/reset`, () => {
    resetDb();
    return ok({ reset: true });
  }),
  // Demo only: a customer order arrives at the signed-in seller's shop, run by hand (no simulation)
  http.post(`${API}/dev/incoming-order`, withDb(({ request, db }) => {
    const g = guard(request, ['seller']);
    if (g.res) return g.res;
    const user = db.users.find((u) => u.id === g.u.userId);
    const seller = db.sellers.find((s) => s.id === user.sellerId);
    const prods = db.products.filter((p) => p.sellerId === seller.id && p.stock > 1).slice(0, 2);
    const addr = db.addresses[0];
    const items = prods.map((p, i) => ({ productId: p.id, title: p.title, unitPricePaise: p.pricePaise, qty: i + 1 }));
    items.forEach((it) => (db.products.find((p) => p.id === it.productId).stock -= it.qty));
    const sub = items.reduce((s, i) => s + i.unitPricePaise * i.qty, 0);
    const promise = promiseFor(db, seller, addr, cartTempClass(prods));
    const now = Date.now();
    const order = {
      id: nextId(db, 'order'), customerId: 1, sellerId: seller.id, riderId: null, status: 'PLACED', tempClass: cartTempClass(prods), items,
      subtotalPaise: sub, deliveryFeePaise: db.policy.deliveryFeePaise, creditPaise: 0, totalPaise: sub + db.policy.deliveryFeePaise,
      paymentMode: 'COD', paymentStatus: 'COD_PENDING', addressText: addr.line, drop: { lat: addr.lat, lng: addr.lng }, distanceM: Math.round(promise.distanceKm * 1000),
      policyVersion: db.policy.version, placedAt: now, promisedAt: now + promise.window[1] * 60000, promiseWindow: promise.window,
      simSeller: false, simRider: false, otpAttempts: 0, otpLocked: false,
    };
    db.orders.push(order);
    db.orderEvents.push({ id: nextId(db, 'event'), orderId: order.id, from: null, to: 'PLACED', role: 'customer', at: now });
    return ok({ orderId: order.id }, 201);
  })),

  // ---------- identity
  http.post(`${API}/auth/google`, withDb(async ({ request, db }) => {
    const body = await request.json();
    // Google sign-in always creates a customer. Seller, rider and admin accounts are seeded (demo).
    const user = db.users.find((u) => u.role === (body.demoRole || 'customer'));
    if (!user) return fail(400, 'BAD_REQUEST', 'Unknown demo account');
    if (user.role === 'admin') {
      if (request.headers.get('x-snackhub-host') !== 'admin') return fail(404, 'NOT_FOUND', 'Not found');
      return ok({ mfaPending: true, halfToken: `demo.mfa_pending.${user.id}`, user });
    }
    return ok({ accessToken: `demo.${user.role}.${user.id}`, user });
  })),
  http.post(`${API}/admin/auth/mfa`, withDb(async ({ request, db }) => {
    if (request.headers.get('x-snackhub-host') !== 'admin') return fail(404, 'NOT_FOUND', 'Not found');
    const { code } = await request.json();
    const user = db.users.find((u) => u.role === 'admin');
    if (code !== '246810') return fail(401, 'MFA_INVALID', 'That code is not right. 5 wrong codes lock the account for 15 minutes.');
    audit(db, { userId: user.id }, 'admin.login', null, { amr: ['google', 'totp'] });
    return ok({ accessToken: `demo.admin.${user.id}.${Date.now()}`, user, amr: ['google', 'totp'] });
  })),
  http.get(`${API}/me`, withDb(({ request, db }) => {
    const g = guard(request);
    if (g.res) return g.res;
    return ok(db.users.find((u) => u.id === g.u.userId));
  })),
  http.get(`${API}/me/addresses`, withDb(({ request, db }) => {
    const g = guard(request, ['customer']);
    if (g.res) return g.res;
    return ok(db.addresses);
  })),
  http.post(`${API}/me/addresses`, withDb(async ({ request, db }) => {
    const g = guard(request, ['customer']);
    if (g.res) return g.res;
    const b = await request.json();
    const a = { id: Math.max(0, ...db.addresses.map((x) => x.id)) + 1, ...b };
    db.addresses.push(a);
    return ok(a, 201);
  })),
  http.delete(`${API}/me/addresses/:id`, withDb(({ request, params, db }) => {
    const g = guard(request, ['customer']);
    if (g.res) return g.res;
    db.addresses = db.addresses.filter((a) => a.id !== Number(params.id));
    return ok({ deleted: true });
  })),
  http.get(`${API}/me/notifications`, withDb(({ request, db }) => {
    const g = guard(request);
    if (g.res) return g.res;
    return ok(db.notifications.filter((n) => n.userId === g.u.userId).slice(0, 50));
  })),
  http.post(`${API}/me/notifications/read`, withDb(({ request, db }) => {
    const g = guard(request);
    if (g.res) return g.res;
    db.notifications.forEach((n) => n.userId === g.u.userId && !n.readAt && (n.readAt = Date.now()));
    return ok({ ok: true });
  })),
  http.get(`${API}/me/credits`, withDb(({ request, db }) => {
    const g = guard(request, ['customer']);
    if (g.res) return g.res;
    return ok(db.credits.filter((c) => c.customerId === g.u.userId));
  })),

  // ---------- catalog
  http.get(`${API}/cities`, withDb(({ db }) => ok(db.cities))),
  http.get(`${API}/sellers`, withDb(({ request, db }) => {
    const url = new URL(request.url);
    const lat = Number(url.searchParams.get('lat'));
    const lng = Number(url.searchParams.get('lng'));
    const temp = url.searchParams.get('temp');
    return ok(serviceableSellers(db, lat, lng, temp));
  })),
  http.get(`${API}/sellers/:id`, withDb(({ request, params, db }) => {
    const s = db.sellers.find((x) => x.id === Number(params.id));
    if (!s || !visibleSeller(s)) return fail(404, 'NOT_FOUND', 'Shop not found');
    const url = new URL(request.url);
    const lat = Number(url.searchParams.get('lat'));
    const lng = Number(url.searchParams.get('lng'));
    const products = db.products.filter((p) => p.sellerId === s.id && p.active);
    return ok({ ...sellerPublic(s), promise: lat ? { HOT: promiseFor(db, s, { lat, lng }, 'HOT'), AMBIENT: promiseFor(db, s, { lat, lng }, 'AMBIENT') } : null, products });
  })),
  http.get(`${API}/products`, withDb(({ request, db }) => {
    const url = new URL(request.url);
    const lat = Number(url.searchParams.get('lat'));
    const lng = Number(url.searchParams.get('lng'));
    const near = new Map(serviceableSellers(db, lat, lng).map((s) => [s.id, s]));
    const list = db.products
      .filter((p) => p.active && near.has(p.sellerId))
      .map((p) => {
        const s = near.get(p.sellerId);
        const pr = s.promise[p.servingTemp];
        return { ...p, shopName: s.shopName, serviceable: Boolean(pr?.serviceable), window: pr?.window, distanceKm: s.distanceKm };
      })
      .filter((p) => p.serviceable);
    return ok(list);
  })),
  // Search: Elasticsearch in the real stack, MySQL FULLTEXT as fallback. Here: fuzzy-ish match.
  http.get(`${API}/search`, withDb(({ request, db }) => {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const syn = { chakli: 'murukku', jilebi: 'jalebi', mithai: 'sweet', murku: 'murukku', samsa: 'samosa', bajji: 'bajji', laddoo: 'laddu' };
    const term = syn[q] || q;
    const lat = Number(url.searchParams.get('lat'));
    const lng = Number(url.searchParams.get('lng'));
    const near = new Set(serviceableSellers(db, lat, lng).map((s) => s.id));
    const score = (p) => {
      const t = p.title.toLowerCase();
      if (t.startsWith(term)) return 3;
      if (t.includes(term)) return 2;
      if (p.category.includes(term) || p.region.toLowerCase().includes(term) || p.tags.some((x) => x.includes(term))) return 1;
      if (term.length > 3 && lev(t.split(' ')[0], term) <= 2) return 1;
      return 0;
    };
    const res = db.products.filter((p) => near.has(p.sellerId) && p.active).map((p) => ({ p, s: score(p) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 8).map((x) => ({ id: x.p.id, title: x.p.title, sellerId: x.p.sellerId, shopName: db.sellers.find((s) => s.id === x.p.sellerId).shopName, pricePaise: x.p.pricePaise, art: x.p.art, servingTemp: x.p.servingTemp }));
    return ok({ q, results: res, provider: 'mock-fulltext' });
  })),

  // ---------- cart (Redis hash cart:{userId}, one seller only)
  http.get(`${API}/cart`, withDb(({ request, db }) => {
    const g = guard(request, ['customer']);
    if (g.res) return g.res;
    return ok(cartView(db, g.u.userId));
  })),
  http.put(`${API}/cart`, withDb(async ({ request, db }) => {
    const g = guard(request, ['customer']);
    if (g.res) return g.res;
    const { productId, qty, replace } = await request.json();
    const p = db.products.find((x) => x.id === productId);
    if (!p) return fail(404, 'NOT_FOUND', 'Snack not found');
    const cart = db.carts[g.u.userId] || { sellerId: null, items: [] };
    if (cart.sellerId && cart.sellerId !== p.sellerId && cart.items.length) {
      if (!replace) {
        const other = db.sellers.find((s) => s.id === cart.sellerId);
        return fail(409, 'CART_OTHER_SELLER', `Your cart has snacks from ${other.shopName}. One order comes from one shop.`, { currentSellerId: cart.sellerId });
      }
      cart.items = [];
    }
    cart.sellerId = p.sellerId;
    const line = cart.items.find((i) => i.productId === productId);
    // A cart never reserves stock; the quantity is only checked at checkout.
    if (qty <= 0) cart.items = cart.items.filter((i) => i.productId !== productId);
    else if (line) line.qty = qty;
    else cart.items.push({ productId, qty });
    if (!cart.items.length) cart.sellerId = null;
    db.carts[g.u.userId] = cart;
    return ok(cartView(db, g.u.userId));
  })),
  http.delete(`${API}/cart`, withDb(({ request, db }) => {
    const g = guard(request, ['customer']);
    if (g.res) return g.res;
    delete db.carts[g.u.userId];
    return ok(cartView(db, g.u.userId));
  })),

  // ---------- orders
  http.post(`${API}/orders/quote`, withDb(async ({ request, db }) => {
    const g = guard(request, ['customer']);
    if (g.res) return g.res;
    const { addressId } = await request.json();
    const cart = cartView(db, g.u.userId);
    const addr = db.addresses.find((a) => a.id === addressId);
    if (!cart.items.length) return fail(400, 'CART_EMPTY', 'Your cart is empty');
    const seller = db.sellers.find((s) => s.id === cart.sellerId);
    const promise = promiseFor(db, seller, addr, cart.tempClass);
    const credit = db.credits.find((c) => c.customerId === g.u.userId && !c.usedOrderId && c.expiresAt > Date.now());
    return ok({ ...cart, promise, codEnabled: db.policy.codEnabled, creditPaise: credit?.amountPaise || 0 });
  })),
  http.post(`${API}/orders`, withDb(async ({ request, db }) => {
    const g = guard(request, ['customer']);
    if (g.res) return g.res;
    const key = request.headers.get('idempotency-key');
    if (!key) return fail(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Missing Idempotency-Key');
    const idemKey = `${g.u.userId}:${key}`;
    if (db.idem[idemKey]) {
      const prev = db.orders.find((o) => o.id === db.idem[idemKey]);
      return ok({ order: orderView(db, prev), replayed: true });
    }
    const body = await request.json();
    const cart = cartView(db, g.u.userId);
    if (!cart.items.length) return fail(400, 'CART_EMPTY', 'Your cart is empty');
    const addr = db.addresses.find((a) => a.id === body.addressId);
    if (!addr) return fail(422, 'ADDRESS_REQUIRED', 'Choose a delivery address');
    const seller = db.sellers.find((s) => s.id === cart.sellerId);
    if (!visibleSeller(seller)) return fail(409, 'SHOP_UNAVAILABLE', 'This shop is not taking orders right now');
    // Serviceability is re-run at checkout (doc 10.8)
    const promise = promiseFor(db, seller, addr, cart.tempClass);
    if (!promise.serviceable) return fail(409, 'NOT_SERVICEABLE', promise.reasons[0] || 'Not serviceable', { reasons: promise.reasons });
    if (body.paymentMode === 'COD' && !db.policy.codEnabled) return fail(409, 'COD_DISABLED', 'Pay on delivery is switched off right now');
    // Reserve stock: all-or-nothing, in sorted product order (doc 10.8)
    const sorted = [...cart.items].sort((a, b) => a.productId - b.productId);
    for (const it of sorted) {
      const p = db.products.find((x) => x.id === it.productId);
      if (p.stock < it.qty) return fail(409, 'OUT_OF_STOCK', p.stock ? `Only ${p.stock} ${p.title} left` : `${p.title} just sold out`, { productId: p.id, title: p.title, available: p.stock });
    }
    sorted.forEach((it) => (db.products.find((x) => x.id === it.productId).stock -= it.qty));
    // Prices are recomputed from the catalogue; the client's total is ignored
    const items = cart.items.map((i) => ({ productId: i.productId, title: i.title, unitPricePaise: i.pricePaise, qty: i.qty }));
    const subtotal = items.reduce((s, i) => s + i.unitPricePaise * i.qty, 0);
    const credit = body.paymentMode === 'COD' ? db.credits.find((c) => c.customerId === g.u.userId && !c.usedOrderId && c.expiresAt > Date.now()) : null;
    const creditPaise = credit ? Math.min(credit.amountPaise, subtotal) : 0;
    const now = Date.now();
    const order = {
      id: nextId(db, 'order'), customerId: g.u.userId, sellerId: seller.id, riderId: null,
      status: body.paymentMode === 'ONLINE' ? 'PENDING_PAYMENT' : 'PLACED', tempClass: cart.tempClass, items,
      subtotalPaise: subtotal, deliveryFeePaise: db.policy.deliveryFeePaise, creditPaise, totalPaise: subtotal + db.policy.deliveryFeePaise - creditPaise,
      paymentMode: body.paymentMode, paymentStatus: body.paymentMode === 'ONLINE' ? 'CREATED' : 'COD_PENDING',
      addressText: addr.line, drop: { lat: addr.lat, lng: addr.lng }, distanceM: Math.round(promise.distanceKm * 1000),
      policyVersion: db.policy.version, placedAt: now, promisedAt: now + promise.window[1] * 60000, promiseWindow: promise.window,
      simSeller: body.simulate !== false, simRider: body.simulate !== false, otpAttempts: 0, otpLocked: false, holdExpiresAt: now + (body.paymentMode === 'ONLINE' ? 10 : 2) * 60000,
    };
    if (credit) credit.usedOrderId = order.id;
    db.orders.push(order);
    db.orderEvents.push({ id: nextId(db, 'event'), orderId: order.id, from: null, to: order.status, role: 'customer', at: now });
    db.idem[idemKey] = order.id;
    delete db.carts[g.u.userId];
    return ok({ order: orderView(db, order) }, 201);
  })),
  http.get(`${API}/orders`, withDb(({ request, db }) => {
    const g = guard(request, ['customer']);
    if (g.res) return g.res;
    return ok(db.orders.filter((o) => o.customerId === g.u.userId).sort((a, b) => b.placedAt - a.placedAt).map((o) => orderView(db, o)));
  })),
  http.get(`${API}/orders/:id`, withDb(({ request, params, db }) => {
    const g = guard(request, ['customer']);
    if (g.res) return g.res;
    const o = db.orders.find((x) => x.id === Number(params.id));
    // Ownership from the token: another customer's order is a 404, not a leak (IDOR fix)
    if (!o || o.customerId !== g.u.userId) return fail(404, 'NOT_FOUND', 'Order not found');
    return ok(orderView(db, o));
  })),
  http.get(`${API}/orders/:id/track`, withDb(({ request, params, db }) => {
    const g = guard(request, ['customer']);
    if (g.res) return g.res;
    const o = db.orders.find((x) => x.id === Number(params.id));
    if (!o || o.customerId !== g.u.userId) return fail(404, 'NOT_FOUND', 'Order not found');
    return ok({ ...trackState(db, o), order: orderView(db, o), simulated: o.simSeller || o.simRider });
  })),
  http.get(`${API}/orders/:id/otp`, withDb(({ request, params, db }) => {
    const g = guard(request, ['customer']);
    if (g.res) return g.res;
    const o = db.orders.find((x) => x.id === Number(params.id));
    if (!o || o.customerId !== g.u.userId) return fail(404, 'NOT_FOUND', 'Order not found');
    if (o.status === 'DELIVERED') return fail(410, 'OTP_USED', 'The code stopped working after delivery');
    if (!o.otpRevealed) return fail(403, 'OTP_LOCKED', 'Your code appears when the rider is about 500 m away');
    return ok({ code: db.otpPlain[o.id] });
  })),
  http.post(`${API}/orders/:id/cancel`, withDb(({ request, params, db }) => {
    const g = guard(request, ['customer']);
    if (g.res) return g.res;
    const o = db.orders.find((x) => x.id === Number(params.id));
    if (!o || o.customerId !== g.u.userId) return fail(404, 'NOT_FOUND', 'Order not found');
    if (!canTransition(o.status, 'CANCELLED', 'customer')) return fail(409, 'CANNOT_CANCEL', 'Cancelling is free until the order is packed. After that, contact support.');
    addEvent(db, o, 'CANCELLED', 'customer');
    o.cancelReason = 'Cancelled by you';
    releaseStock(db, o);
    if (o.paymentStatus === 'CAPTURED') o.paymentStatus = 'REFUND_PENDING';
    return ok(orderView(db, o));
  })),
  http.post(`${API}/orders/:id/review`, withDb(async ({ request, params, db }) => {
    const g = guard(request, ['customer']);
    if (g.res) return g.res;
    const o = db.orders.find((x) => x.id === Number(params.id));
    if (!o || o.customerId !== g.u.userId) return fail(404, 'NOT_FOUND', 'Order not found');
    o.review = await request.json();
    return ok({ ok: true });
  })),
  http.post(`${API}/orders/:id/complaints`, withDb(async ({ request, params, db }) => {
    const g = guard(request, ['customer']);
    if (g.res) return g.res;
    const o = db.orders.find((x) => x.id === Number(params.id));
    if (!o || o.customerId !== g.u.userId) return fail(404, 'NOT_FOUND', 'Order not found');
    const b = await request.json();
    if (o.status !== 'DELIVERED') return fail(409, 'NOT_DELIVERED', 'You can report a problem after delivery');
    const windowMs = b.category === 'FOOD_QUALITY' ? 2 * 3600000 : 24 * 3600000;
    if (Date.now() - o.deliveredAt > windowMs) return fail(409, 'WINDOW_CLOSED', b.category === 'FOOD_QUALITY' ? 'Food quality reports close 2 hours after delivery' : 'Reports close 24 hours after delivery');
    if (db.complaints.some((c) => c.orderId === o.id && c.category === b.category)) return fail(409, 'DUPLICATE', 'You already reported this category for this order');
    if (b.category === 'FOOD_QUALITY' && !(b.photoCount > 0)) return fail(422, 'PHOTO_REQUIRED', 'Add 1 to 3 photos');
    const lateMin = Math.max(0, (o.deliveredAt - o.promisedAt) / 60000);
    const evidence = {
      promisedAt: o.promisedAt, deliveredAt: o.deliveredAt, sellerDelayMin: o.sellerDelayMin || 0, riderLateMin: Math.max(0, lateMin - (o.sellerDelayMin || 0) - db.policy.graceMin),
      packedToPickedMin: o.pickedAt && o.packedAt ? (o.pickedAt - o.packedAt) / 60000 : 0, rideMin: o.arrivedAt && o.rideStartedAt ? (o.arrivedAt - o.rideStartedAt) / 60000 : 0,
      otpVerified: true, geofencePassed: true, pickupSealed: o.pickupSealed !== false, hasPhoto: b.photoCount > 0,
    };
    const t = triage({ subtype: b.subtype, evidence, rideLimitMin: o.tempClass === 'HOT' ? db.policy.hot.maxRideMin : db.policy.ambient.maxRideMin });
    const affected = o.items.filter((i) => (b.itemIds || []).includes(i.productId)).reduce((s, i) => s + i.unitPricePaise * i.qty, 0) || o.subtotalPaise;
    const auto = canAutoResolve(t, affected);
    const c = {
      id: nextId(db, 'complaint'), orderId: o.id, customerId: g.u.userId, sellerId: o.sellerId, riderId: o.riderId, category: b.category, subtype: b.subtype,
      description: b.description, itemIds: b.itemIds || [], photoCount: b.photoCount || 0, ...t, autoDecided: auto, status: auto ? 'RESOLVED' : 'IN_REVIEW', evidence, createdAt: Date.now(),
    };
    if (auto) {
      c.resolution = 'VALID';
      db.credits.push({ id: db.credits.length + 1, customerId: g.u.userId, complaintId: c.id, amountPaise: affected, expiresAt: Date.now() + 30 * 86400000, usedOrderId: null });
    }
    if (t.safety) {
      const s = db.sellers.find((x) => x.id === o.sellerId);
      s.paused = true; // hide the shop at once and send to an admin
    }
    db.complaints.push(c);
    notify(db, g.u.userId, o.id, `complaint.${c.id}`, auto ? 'Complaint resolved. A credit was added to your account.' : 'Complaint received. An admin will review it.');
    return ok(c, 201);
  })),

  // ---------- payments (Razorpay, mocked; the server decides the amount)
  http.post(`${API}/payments`, withDb(async ({ request, db }) => {
    const g = guard(request, ['customer']);
    if (g.res) return g.res;
    const { orderId } = await request.json();
    const o = db.orders.find((x) => x.id === orderId && x.customerId === g.u.userId);
    if (!o) return fail(404, 'NOT_FOUND', 'Order not found');
    if (o.status !== 'PENDING_PAYMENT') return fail(409, 'NOT_PAYABLE', 'This order is not waiting for payment');
    let p = db.payments.find((x) => x.orderId === o.id);
    if (!p) {
      p = { id: nextId(db, 'payment'), orderId: o.id, method: 'RAZORPAY', providerOrderId: `order_demo${Date.now().toString(36)}`, amountPaise: o.totalPaise, currency: 'INR', status: 'CREATED', createdAt: Date.now() };
      db.payments.push(p);
    }
    return ok({ providerOrderId: p.providerOrderId, keyId: 'rzp_test_demo_public', amountPaise: p.amountPaise, currency: 'INR' });
  })),
  // Browser fast path. It never marks the order paid on its own.
  http.post(`${API}/payments/verify`, withDb(async ({ request, db }) => {
    const g = guard(request, ['customer']);
    if (g.res) return g.res;
    const b = await request.json();
    const p = db.payments.find((x) => x.providerOrderId === b.providerOrderId);
    if (!p) return fail(404, 'NOT_FOUND', 'Payment not found');
    const valid = b.signature === `sig_${b.providerOrderId}_${b.providerPaymentId}`;
    if (!valid) return fail(400, 'SIGNATURE_INVALID', 'Signature check failed');
    p.providerPaymentId = b.providerPaymentId;
    p.verifiedAt = Date.now();
    // The simulated Razorpay webhook (source of truth) lands a moment later
    p.webhookDueAt = Date.now() + 2200;
    return ok({ verified: true, status: p.status });
  })),
  http.post(`${API}/payments/fail`, withDb(async ({ request, db }) => {
    const g = guard(request, ['customer']);
    if (g.res) return g.res;
    const b = await request.json();
    const p = db.payments.find((x) => x.providerOrderId === b.providerOrderId);
    if (p) p.lastFailure = { reason: b.reason, at: Date.now() };
    return ok({ status: 'FAILED_ATTEMPT' });
  })),
  http.get(`${API}/payments/by-order/:orderId`, withDb(({ request, params, db }) => {
    const g = guard(request, ['customer']);
    if (g.res) return g.res;
    const o = db.orders.find((x) => x.id === Number(params.orderId) && x.customerId === g.u.userId);
    if (!o) return fail(404, 'NOT_FOUND', 'Order not found');
    const p = db.payments.find((x) => x.orderId === o.id);
    // Process the simulated webhook: payment.captured moves the order to PLACED
    if (p && p.status === 'CREATED' && p.webhookDueAt && Date.now() >= p.webhookDueAt) {
      p.status = 'CAPTURED';
      p.capturedAt = Date.now();
      o.paymentStatus = 'CAPTURED';
      addEvent(db, o, 'PLACED', 'system');
      o.placedAt = Date.now();
      notify(db, o.customerId, o.id, 'payment.captured', 'Payment received. Your order is with the shop.');
    }
    return ok({ status: p?.status || 'NONE', orderStatus: o.status, lastFailure: p?.lastFailure || null });
  })),

  // ---------- seller console
  http.get(`${API}/seller/shop`, withDb(({ request, db }) => {
    const g = guard(request, ['seller']);
    if (g.res) return g.res;
    const user = db.users.find((u) => u.id === g.u.userId);
    const s = db.sellers.find((x) => x.id === user.sellerId);
    const mine = db.orders.filter((o) => o.sellerId === s.id && o.status !== 'PENDING_PAYMENT');
    const delivered = mine.filter((o) => o.status === 'DELIVERED');
    return ok({ ...s, stats: { ordersToday: mine.filter((o) => Date.now() - o.placedAt < 86400000).length, delivered: delivered.length, salesPaise: delivered.reduce((a, o) => a + o.subtotalPaise, 0) } });
  })),
  http.patch(`${API}/seller/shop`, withDb(async ({ request, db }) => {
    const g = guard(request, ['seller']);
    if (g.res) return g.res;
    const user = db.users.find((u) => u.id === g.u.userId);
    const s = db.sellers.find((x) => x.id === user.sellerId);
    const b = await request.json();
    ['busyExtraMin', 'paused', 'openHours', 'radiusKm'].forEach((k) => k in b && (s[k] = b[k]));
    return ok(s);
  })),
  http.get(`${API}/seller/products`, withDb(({ request, db }) => {
    const g = guard(request, ['seller']);
    if (g.res) return g.res;
    const user = db.users.find((u) => u.id === g.u.userId);
    return ok(db.products.filter((p) => p.sellerId === user.sellerId));
  })),
  http.patch(`${API}/seller/products/:id/stock`, withDb(async ({ request, params, db }) => {
    const g = guard(request, ['seller']);
    if (g.res) return g.res;
    const user = db.users.find((u) => u.id === g.u.userId);
    const p = db.products.find((x) => x.id === Number(params.id));
    // seller_id from the token and a join, never from the body
    if (!p || p.sellerId !== user.sellerId) return fail(404, 'NOT_FOUND', 'Product not found');
    const { delta, reason } = await request.json();
    // Edits are adjustments applied to the live row, not a replacement (doc 10.8)
    if (p.stock + delta < 0) return fail(422, 'NEGATIVE_STOCK', 'Stock cannot go below zero');
    p.stock += delta;
    p.lastAdjust = { delta, reason, at: Date.now() };
    return ok(p);
  })),
  http.patch(`${API}/seller/products/:id`, withDb(async ({ request, params, db }) => {
    const g = guard(request, ['seller']);
    if (g.res) return g.res;
    const user = db.users.find((u) => u.id === g.u.userId);
    const p = db.products.find((x) => x.id === Number(params.id));
    if (!p || p.sellerId !== user.sellerId) return fail(404, 'NOT_FOUND', 'Product not found');
    const b = await request.json();
    ['active', 'pricePaise', 'prepMinutes'].forEach((k) => k in b && (p[k] = b[k]));
    return ok(p);
  })),
  http.get(`${API}/seller/orders`, withDb(({ request, db }) => {
    const g = guard(request, ['seller']);
    if (g.res) return g.res;
    const user = db.users.find((u) => u.id === g.u.userId);
    return ok(db.orders.filter((o) => o.sellerId === user.sellerId && o.status !== 'PENDING_PAYMENT').sort((a, b) => b.placedAt - a.placedAt).slice(0, 40).map((o) => orderView(db, o, 'seller')));
  })),
  http.post(`${API}/seller/orders/:id/:action`, withDb(async ({ request, params, db }) => {
    const g = guard(request, ['seller']);
    if (g.res) return g.res;
    const user = db.users.find((u) => u.id === g.u.userId);
    const o = db.orders.find((x) => x.id === Number(params.id));
    if (!o || o.sellerId !== user.sellerId) return fail(404, 'NOT_FOUND', 'Order not found');
    o.simSeller = false;
    const to = { accept: 'ACCEPTED', reject: 'REJECTED', start: 'PACKING', packed: 'PACKED' }[params.action];
    if (!to || !canTransition(o.status, to, 'seller')) return fail(409, 'BAD_TRANSITION', `Cannot ${params.action} an order that is ${o.status}`);
    if (to === 'ACCEPTED') acceptOrder(db, o, 'seller');
    else if (to === 'PACKED') {
      addEvent(db, o, 'PACKED', 'seller');
      o.packedAt = Date.now();
      const prep = (o.tempClass === 'HOT' ? db.policy.hot.prepMin[1] : db.policy.ambient.prepMin[1]) * 60000;
      o.sellerDelayMin = Math.max(0, (o.packedAt - (o.acceptedAt + prep)) / 60000);
      notify(db, o.customerId, o.id, 'order.packed', 'Your snacks are packed');
    } else {
      addEvent(db, o, to, 'seller');
      if (to === 'REJECTED') {
        releaseStock(db, o);
        notify(db, o.customerId, o.id, 'order.rejected', 'The shop could not take your order. You were not charged.');
      }
    }
    return ok(orderView(db, o, 'seller'));
  })),

  // ---------- rider app
  http.get(`${API}/rider/me`, withDb(({ request, db }) => {
    const g = guard(request, ['rider']);
    if (g.res) return g.res;
    const user = db.users.find((u) => u.id === g.u.userId);
    return ok(db.riders.find((r) => r.id === user.riderId));
  })),
  http.put(`${API}/rider/status`, withDb(async ({ request, db }) => {
    const g = guard(request, ['rider']);
    if (g.res) return g.res;
    const user = db.users.find((u) => u.id === g.u.userId);
    const r = db.riders.find((x) => x.id === user.riderId);
    r.status = (await request.json()).status;
    return ok(r);
  })),
  http.get(`${API}/rider/offers`, withDb(({ request, db }) => {
    const g = guard(request, ['rider']);
    if (g.res) return g.res;
    const user = db.users.find((u) => u.id === g.u.userId);
    const r = db.riders.find((x) => x.id === user.riderId);
    if (r.status === 'OFFLINE') return ok([]);
    const offers = db.assignments.filter((a) => a.riderId === r.id && a.status === 'OFFERED').map((a) => {
      const o = db.orders.find((x) => x.id === a.orderId);
      const s = db.sellers.find((x) => x.id === o.sellerId);
      const e = computeEarning({ km: o.distanceM / 1000, lateMin: 0 }, db.policy);
      return { id: a.id, orderId: o.id, offeredAt: a.offeredAt, expiresAt: a.offeredAt + 20000, tempClass: o.tempClass, shop: s.shopName, pickupKm: +(distanceM(r, s) / 1000).toFixed(1), dropKm: +(o.distanceM / 1000).toFixed(1), estPayPaise: e.basePaise + e.distancePaise, items: o.items.reduce((n, i) => n + i.qty, 0) };
    });
    return ok(offers);
  })),
  http.post(`${API}/rider/offers/:id/:action`, withDb(({ request, params, db }) => {
    const g = guard(request, ['rider']);
    if (g.res) return g.res;
    const user = db.users.find((u) => u.id === g.u.userId);
    const a = db.assignments.find((x) => x.id === Number(params.id) && x.riderId === user.riderId);
    if (!a || a.status !== 'OFFERED') return fail(410, 'OFFER_GONE', 'This offer expired or went to another rider');
    const o = db.orders.find((x) => x.id === a.orderId);
    a.respondedAt = Date.now();
    if (params.action === 'decline') {
      a.status = 'DECLINED';
      o.simRider = true;
      return ok({ declined: true });
    }
    // Atomic: UPDATE orders SET rider_id = ? WHERE id = ? AND rider_id IS NULL
    if (o.riderId) {
      a.status = 'EXPIRED';
      return fail(409, 'ALREADY_ASSIGNED', 'Another rider took this order');
    }
    a.status = 'ACCEPTED';
    const r = db.riders.find((x) => x.id === user.riderId);
    assignRider(db, o, r);
    o.simRider = false;
    return ok({ accepted: true, orderId: o.id });
  })),
  http.get(`${API}/rider/active`, withDb(({ request, db }) => {
    const g = guard(request, ['rider']);
    if (g.res) return g.res;
    const user = db.users.find((u) => u.id === g.u.userId);
    const o = db.orders.find((x) => x.riderId === user.riderId && !x.simRider && ['ACCEPTED', 'PACKING', 'PACKED', 'PICKED_UP', 'ON_THE_WAY', 'ARRIVED'].includes(x.status));
    if (!o) return ok(null);
    const t = trackState(db, o);
    const holdMin = o.packedAt && o.status === 'PACKED' && o.tempClass === 'HOT' ? (Date.now() - o.packedAt) / 60000 : 0;
    return ok({ ...orderView(db, o, 'rider'), track: t, insideGeofence: t.distanceM <= db.policy.arrivalGeofenceM, hotHoldWarning: holdMin > 10 });
  })),
  http.post(`${API}/rider/location`, withDb(async ({ request, db }) => {
    const g = guard(request, ['rider']);
    if (g.res) return g.res;
    const user = db.users.find((u) => u.id === g.u.userId);
    const { lat, lng } = await request.json();
    const r = db.riders.find((x) => x.id === user.riderId);
    const o = db.orders.find((x) => x.riderId === r.id && !x.simRider && ['ACCEPTED', 'PACKING', 'PACKED', 'PICKED_UP', 'ON_THE_WAY'].includes(x.status));
    // Reject impossible jumps (over about 120 km/h) as spoofed GPS (doc 16.2)
    if (r.lastPingAt) {
      const v = distanceM(r, { lat, lng }) / ((Date.now() - r.lastPingAt) / 1000);
      if (v > 33 * 4) return fail(422, 'GPS_JUMP', 'Location jump rejected');
    }
    r.lat = lat;
    r.lng = lng;
    r.lastPingAt = Date.now();
    if (o) o.riderPos = { lat, lng };
    return ok({ ok: true });
  })),
  http.post(`${API}/rider/orders/:id/:step`, withDb(async ({ request, params, db }) => {
    const g = guard(request, ['rider']);
    if (g.res) return g.res;
    const user = db.users.find((u) => u.id === g.u.userId);
    const o = db.orders.find((x) => x.id === Number(params.id));
    // Only orders with rider_id = token user
    if (!o || o.riderId !== user.riderId) return fail(404, 'NOT_FOUND', 'Order not found');
    const b = await request.json().catch(() => ({}));
    const seller = db.sellers.find((s) => s.id === o.sellerId);
    if (params.step === 'picked-up') {
      if (!canTransition(o.status, 'PICKED_UP', 'rider')) return fail(409, 'BAD_TRANSITION', 'The order is not packed yet');
      if (!b.sealed) return fail(422, 'CHECKLIST_REQUIRED', 'Confirm the package is sealed and items are counted');
      addEvent(db, o, 'PICKED_UP', 'rider');
      o.pickedAt = Date.now();
      o.pickupSealed = true;
      o.riderPos = { lat: seller.lat, lng: seller.lng };
      addEvent(db, o, 'ON_THE_WAY', 'system');
      o.rideStartedAt = Date.now();
      notify(db, o.customerId, o.id, 'order.picked_up', 'Your rider is on the way');
      return ok(orderView(db, o, 'rider'));
    }
    if (params.step === 'deliver') {
      if (o.status !== 'ARRIVED') return fail(409, 'NOT_ARRIVED', 'The code works only inside 150 m of the drop point');
      if (o.otpLocked) return fail(423, 'OTP_LOCKED_ATTEMPTS', 'Too many wrong codes. An admin has been alerted.');
      if (String(b.code) !== db.otpPlain[o.id]) {
        o.otpAttempts += 1;
        if (o.otpAttempts >= db.policy.otpMaxAttempts) o.otpLocked = true;
        return fail(422, 'OTP_INVALID', `Wrong code. ${Math.max(0, db.policy.otpMaxAttempts - o.otpAttempts)} tries left.`);
      }
      if (o.paymentMode === 'COD') {
        o.collectedPaise = Number(b.collectedPaise || 0);
        o.paymentStatus = 'COD_COLLECTED';
        o.cashMismatch = o.collectedPaise !== o.totalPaise;
      }
      deliver(db, o, 'rider');
      return ok(orderView(db, o, 'rider'));
    }
    if (params.step === 'emergency') {
      o.emergency = { at: Date.now(), note: b.note || '' };
      audit(db, { userId: g.u.userId }, 'rider.emergency', null, { orderId: o.id });
      return ok({ alerted: true });
    }
    if (params.step === 'unreachable') {
      o.customerUnreachableAt = Date.now();
      return ok({ waitingMin: 5 });
    }
    return fail(404, 'NOT_FOUND', 'Unknown step');
  })),
  http.get(`${API}/rider/earnings`, withDb(({ request, db }) => {
    const g = guard(request, ['rider']);
    if (g.res) return g.res;
    const user = db.users.find((u) => u.id === g.u.userId);
    return ok(db.earnings.filter((e) => e.riderId === user.riderId).sort((a, b) => b.createdAt - a.createdAt));
  })),
  http.post(`${API}/rider/earnings/:id/dispute`, withDb(async ({ request, params, db }) => {
    const g = guard(request, ['rider']);
    if (g.res) return g.res;
    const user = db.users.find((u) => u.id === g.u.userId);
    const e = db.earnings.find((x) => x.id === Number(params.id) && x.riderId === user.riderId);
    if (!e) return fail(404, 'NOT_FOUND', 'Not found');
    if (Date.now() - e.createdAt > 48 * 3600000) return fail(409, 'APPEAL_WINDOW_CLOSED', 'Disputes close 48 hours after delivery');
    e.status = 'DISPUTED';
    e.dispute = { reason: (await request.json()).reason, at: Date.now() };
    return ok(e);
  })),

  // ---------- admin (private host, MFA)
  http.get(`${API}/admin/metrics/sla`, withDb(({ request, db }) => {
    const g = adminGuard(request);
    if (g.res) return g.res;
    const done = db.orders.filter((o) => o.status === 'DELIVERED');
    const onTime = done.filter((o) => o.deliveredAt <= o.promisedAt).length;
    const mins = done.map((o) => (o.deliveredAt - o.placedAt) / 60000).sort((a, b) => a - b);
    const p90 = mins.length ? mins[Math.floor(0.9 * (mins.length - 1))] : 0;
    return ok({
      activeOrders: db.orders.filter((o) => ['PLACED', 'ACCEPTED', 'PACKING', 'PACKED', 'PICKED_UP', 'ON_THE_WAY', 'ARRIVED'].includes(o.status)).length,
      deliveredToday: done.filter((o) => Date.now() - o.deliveredAt < 86400000).length,
      onTimeRate: done.length ? onTime / done.length : 1,
      p90DeliveryMin: Math.round(p90 * 10) / 10,
      lateOrders: done.length - onTime,
      ridersOnline: db.riders.filter((r) => r.status !== 'OFFLINE').length,
      pendingApplications: db.applications.filter((a) => ['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFO'].includes(a.status)).length,
      openComplaints: db.complaints.filter((c) => c.status === 'IN_REVIEW').length,
      cashMismatches: db.orders.filter((o) => o.cashMismatch).length,
    });
  })),
  http.get(`${API}/admin/orders`, withDb(({ request, db }) => {
    const g = adminGuard(request);
    if (g.res) return g.res;
    return ok(db.orders.slice().sort((a, b) => b.placedAt - a.placedAt).slice(0, 60).map((o) => ({ ...orderView(db, o, 'admin'), track: trackState(db, o), emergency: o.emergency || null, cashMismatch: Boolean(o.cashMismatch), collectedPaise: o.collectedPaise ?? null })));
  })),
  http.get(`${API}/admin/riders`, withDb(({ request, db }) => {
    const g = adminGuard(request);
    if (g.res) return g.res;
    return ok(db.riders);
  })),
  http.get(`${API}/admin/sellers`, withDb(({ request, db }) => {
    const g = adminGuard(request);
    if (g.res) return g.res;
    return ok(db.sellers);
  })),
  http.get(`${API}/admin/applications`, withDb(({ request, db }) => {
    const g = adminGuard(request);
    if (g.res) return g.res;
    return ok(db.applications);
  })),
  http.post(`${API}/admin/applications/:id/:action`, withDb(async ({ request, params, db }) => {
    const g = adminGuard(request, { stepUp: true });
    if (g.res) return g.res;
    const a = db.applications.find((x) => x.id === Number(params.id));
    if (!a) return fail(404, 'NOT_FOUND', 'Not found');
    const b = await request.json().catch(() => ({}));
    const before = a.status;
    if (params.action === 'approve') {
      if (a.kind === 'SELLER' && Object.values(a.checks).some((v) => !v)) return fail(422, 'CHECKS_INCOMPLETE', 'Every verification check must pass before approval');
      a.status = 'APPROVED';
      if (a.sellerId) {
        const s = db.sellers.find((x) => x.id === a.sellerId);
        s.status = 'probation';
        s.verified = true;
        s.isNew = true;
      }
    } else if (params.action === 'reject') {
      if (!b.reason) return fail(422, 'REASON_REQUIRED', 'A written reason is required');
      a.status = 'REJECTED';
    } else if (params.action === 'needs-info') a.status = 'NEEDS_INFO';
    else if (params.action === 'check') a.checks[b.check] = Boolean(b.value);
    a.decisionReason = b.reason || a.decisionReason;
    audit(db, g.u, `application.${params.action}`, { status: before }, { status: a.status, reason: b.reason });
    return ok(a);
  })),
  http.get(`${API}/admin/complaints`, withDb(({ request, db }) => {
    const g = adminGuard(request);
    if (g.res) return g.res;
    return ok(db.complaints.slice().sort((a, b) => b.createdAt - a.createdAt));
  })),
  http.post(`${API}/admin/complaints/:id/decide`, withDb(async ({ request, params, db }) => {
    const g = adminGuard(request, { stepUp: true });
    if (g.res) return g.res;
    const c = db.complaints.find((x) => x.id === Number(params.id));
    if (!c) return fail(404, 'NOT_FOUND', 'Not found');
    const b = await request.json();
    if (!b.reason) return fail(422, 'REASON_REQUIRED', 'A reason is required');
    const o = db.orders.find((x) => x.id === c.orderId);
    c.status = 'RESOLVED';
    c.resolution = b.resolution;
    c.reason = b.reason;
    if (b.resolution !== 'INVALID') {
      if (b.creditPaise) db.credits.push({ id: db.credits.length + 1, customerId: c.customerId, complaintId: c.id, amountPaise: b.creditPaise, expiresAt: Date.now() + 30 * 86400000, usedOrderId: null });
      // No second fine if the lateness penalty was already applied (doc 10.7)
      const lateAlreadyCut = c.subtype === 'LATE' && db.earnings.some((e) => e.orderId === o.id && e.penaltyPaise > 0);
      if (b.riderFinePaise && !lateAlreadyCut) db.fines.push({ id: nextId(db, 'fine'), complaintId: c.id, orderId: o.id, targetType: 'RIDER', targetId: c.riderId, reason: b.reason, amountPaise: b.riderFinePaise, status: 'APPLIED', decidedBy: g.u.userId, createdAt: Date.now() });
      if (b.sellerFinePaise) db.fines.push({ id: nextId(db, 'fine'), complaintId: c.id, orderId: o.id, targetType: 'SELLER', targetId: c.sellerId, reason: b.reason, amountPaise: b.sellerFinePaise, status: 'APPLIED', decidedBy: g.u.userId, createdAt: Date.now() });
      c.lateAlreadyCut = lateAlreadyCut;
    }
    audit(db, g.u, 'complaint.decide', { status: 'IN_REVIEW' }, { status: c.status, resolution: b.resolution });
    return ok(c);
  })),
  http.get(`${API}/admin/fines`, withDb(({ request, db }) => {
    const g = adminGuard(request);
    if (g.res) return g.res;
    return ok(db.fines);
  })),
  http.post(`${API}/admin/fines/:id/reverse`, withDb(({ request, params, db }) => {
    const g = adminGuard(request, { stepUp: true });
    if (g.res) return g.res;
    const f = db.fines.find((x) => x.id === Number(params.id));
    if (!f) return fail(404, 'NOT_FOUND', 'Not found');
    f.status = 'REVERSED';
    audit(db, g.u, 'fine.reverse', { status: 'APPLIED' }, { status: 'REVERSED' });
    return ok(f);
  })),
  http.get(`${API}/admin/policy`, withDb(({ request, db }) => {
    const g = adminGuard(request);
    if (g.res) return g.res;
    return ok({ current: db.policy, history: db.policyHistory });
  })),
  http.put(`${API}/admin/policy`, withDb(async ({ request, db }) => {
    const g = adminGuard(request, { stepUp: true });
    if (g.res) return g.res;
    const b = await request.json();
    const before = db.policy;
    // A policy change applies only to later orders: each order stores its policy version
    db.policy = { ...db.policy, ...b, version: db.policy.version + 1 };
    db.policyHistory.unshift({ ...db.policy, effectiveFrom: new Date().toISOString(), changedBy: `admin:${g.u.userId}` });
    audit(db, g.u, 'policy.update', { version: before.version }, { version: db.policy.version, changes: b });
    return ok(db.policy);
  })),
  http.get(`${API}/admin/earnings`, withDb(({ request, db }) => {
    const g = adminGuard(request);
    if (g.res) return g.res;
    return ok(db.earnings);
  })),
  http.post(`${API}/admin/earnings/:id/resolve`, withDb(async ({ request, params, db }) => {
    const g = adminGuard(request, { stepUp: true });
    if (g.res) return g.res;
    const e = db.earnings.find((x) => x.id === Number(params.id));
    const b = await request.json();
    e.status = b.reverse ? 'ADJUSTED' : 'OK';
    if (b.reverse) e.adjustment = { paise: e.penaltyPaise, reason: b.reason, at: Date.now() };
    audit(db, g.u, 'earning.resolve', null, { id: e.id, reverse: b.reverse });
    return ok(e);
  })),
  http.get(`${API}/admin/reconciliation`, withDb(({ request, db }) => {
    const g = adminGuard(request);
    if (g.res) return g.res;
    return ok(db.orders.filter((o) => o.paymentMode === 'COD' && o.status === 'DELIVERED').map((o) => ({ orderId: o.id, totalPaise: o.totalPaise, collectedPaise: o.collectedPaise ?? o.totalPaise, mismatch: Boolean(o.cashMismatch), riderId: o.riderId })));
  })),
  http.get(`${API}/admin/audit`, withDb(({ request, db }) => {
    const g = adminGuard(request);
    if (g.res) return g.res;
    return ok(db.audit.slice(0, 100));
  })),
];

function lev(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
