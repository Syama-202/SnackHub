// Role-based access, enforced on the server whatever the frontend shows: each portal's token
// reaches only that portal's routes, a role claim the account does not hold is refused, tokens
// that were forged, edited or meant for something else are refused, and nobody can read or
// change another person's application or documents by changing an id.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { openHarness, beginTest, request, bearer, ADMIN } from './helpers/app.js';
import { readyRider, upload, saveProfile, RIDER_PROFILE, VEHICLES } from './helpers/onboarding.js';
import { signAccessToken } from '../src/utils/tokens.js';
import { ROLE_PERMISSIONS, can } from '../../shared/domain/permissions.js';

const h = await openHarness();
if (h.skip) console.warn(`access tests skipped: ${h.skip}`);
afterAll(() => h.close?.());

// [method, path, body] for one portal's routes
const SELLER_ROUTES = [
  ['get', '/api/v1/seller/onboarding'],
  ['put', '/api/v1/seller/onboarding/profile', { shopName: 'Not mine (demo)' }],
  ['post', '/api/v1/seller/onboarding/submit', {}],
  ['get', '/api/v1/seller/eligibility'],
  ['get', '/api/v1/seller/products'],
];
const RIDER_ROUTES = [
  ['get', '/api/v1/rider/onboarding'],
  ['put', '/api/v1/rider/onboarding/vehicle', { mode: 'bicycle' }],
  ['post', '/api/v1/rider/availability', { status: 'ONLINE' }],
  ['get', '/api/v1/rider/eligibility'],
];
const call = (app, [method, path, body], token, headers = {}) => {
  const r = request(app)[method](path).set(headers).set(bearer(token));
  return body ? r.send(body) : r;
};

describe.skipIf(h.skip)('role-based access', () => {
  let t;
  beforeEach(async () => {
    t = await beginTest(h);
  });
  afterEach(() => t.end());

  it('every permission belongs to a role, and business permissions are not handed to everyone', () => {
    expect(can('customer', 'seller.products.publish')).toBe(false);
    expect(can('rider', 'verification.decide')).toBe(false);
    expect(can('reviewer', 'users.suspend')).toBe(false);
    expect(can('admin', 'verification.suspend')).toBe(true);
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(['admin', 'customer', 'reviewer', 'rider', 'seller']);
  });

  it('a customer reaches no seller, rider or admin route', async () => {
    const u = await t.makeUser({ roles: ['customer'] });
    const token = t.tokenFor(u, 'customer');
    for (const r of [...SELLER_ROUTES, ...RIDER_ROUTES]) expect((await call(t.app, r, token)).status).toBe(403);
    await call(t.app, ['get', '/api/v1/admin/verification/seller'], token).expect(404);
    await call(t.app, ['get', '/api/v1/admin/verification/seller'], token, ADMIN).expect(403);
  });

  it('a seller reaches no rider or admin route, and a rider no seller route', async () => {
    const seller = await t.makeUser({ roles: ['seller'], mfa: true });
    for (const r of RIDER_ROUTES) expect((await call(t.app, r, t.tokenFor(seller, 'seller'))).status).toBe(403);
    await call(t.app, ['get', '/api/v1/admin/users'], t.tokenFor(seller, 'seller'), ADMIN).expect(403);
    const rider = await t.makeUser({ roles: ['rider'] });
    for (const r of SELLER_ROUTES) expect((await call(t.app, r, t.tokenFor(rider, 'rider'))).status).toBe(403);
  });

  it('one account with two roles uses each only through its own token', async () => {
    const u = await t.makeUser({ roles: ['customer', 'rider'] });
    await call(t.app, RIDER_ROUTES[0], t.tokenFor(u, 'customer')).expect(403);
    await call(t.app, RIDER_ROUTES[0], t.tokenFor(u, 'rider', { mfa: false })).expect(200);
  });

  it('a role claim the account does not hold is refused, even when the token is properly signed', async () => {
    const u = await t.makeUser({ roles: ['customer'] });
    for (const role of ['seller', 'rider', 'admin', 'reviewer']) {
      const token = signAccessToken(h.env, { id: u.id }, { role, mfaAt: Date.now() });
      const route = role === 'seller' ? SELLER_ROUTES[0] : role === 'rider' ? RIDER_ROUTES[0] : ['get', '/api/v1/admin/verification/rider'];
      expect((await call(t.app, route, token, ADMIN)).status).toBe(403);
    }
  });

  it('forged, edited, expired or foreign tokens are refused', async () => {
    const u = await t.makeUser({ roles: ['seller'], mfa: true });
    const good = t.tokenFor(u, 'seller');
    await call(t.app, SELLER_ROUTES[0], good).expect(200);
    const [head, payload, sig] = good.split('.');
    const edited = JSON.parse(Buffer.from(payload, 'base64url').toString());
    edited.sub = '1';
    await call(t.app, SELLER_ROUTES[0], `${head}.${Buffer.from(JSON.stringify(edited)).toString('base64url')}.${sig}`).expect(401);
    const wrongKey = jwt.sign({ role: 'seller', mfa_at: Math.floor(Date.now() / 1000) }, 'a-completely-different-secret-of-32-chars', { subject: String(u.id), issuer: 'snackhub', audience: 'snackhub-web' });
    await call(t.app, SELLER_ROUTES[0], wrongKey).expect(401);
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${payload}.`;
    await call(t.app, SELLER_ROUTES[0], none).expect(401);
    const otherAudience = jwt.sign({ role: 'seller' }, h.env.JWT_SECRET, { subject: String(u.id), issuer: 'snackhub', audience: 'snackhub-admin-mfa' });
    await call(t.app, SELLER_ROUTES[0], otherAudience).expect(401);
    const expired = jwt.sign({ role: 'seller', mfa_at: 1 }, h.env.JWT_SECRET, { subject: String(u.id), issuer: 'snackhub', audience: 'snackhub-web', expiresIn: -10 });
    await call(t.app, SELLER_ROUTES[0], expired).expect(401);
  });

  it("a rider cannot read or change another rider's documents or application", async () => {
    const a = await readyRider(t, { mode: 'bicycle', submitted: false });
    const b = await t.makeUser({ roles: ['rider'] });
    const bToken = t.tokenFor(b, 'rider', { mfa: false });
    await saveProfile(t, bToken, 'rider', RIDER_PROFILE).expect(200);
    await request(t.app).put('/api/v1/rider/onboarding/vehicle').set(bearer(bToken)).send(VEHICLES.bicycle).expect(200);
    await upload(t, bToken, 'rider', 'PHOTO').expect(201);

    const aDoc = await t.trx.dispatch('rider_documents').where({ user_id: a.user.id }).first();
    await request(t.app).post(`/api/v1/rider/onboarding/documents/${aDoc.id}/link`).set(bearer(bToken)).expect(404);
    await request(t.app).delete(`/api/v1/rider/onboarding/documents/${aDoc.id}`).set(bearer(bToken)).expect(404);
    // B's own view never includes A's documents, whatever B sends
    const view = (await request(t.app).get('/api/v1/rider/onboarding').set(bearer(bToken)).query({ userId: a.user.id })).body;
    expect(view.documents.every((d) => d.id !== aDoc.id)).toBe(true);
    expect((await t.trx.dispatch('rider_documents').where({ id: aDoc.id }).first()).status).toBe('PENDING');
  });

  it('nobody can set their own status, role or checks through the API', async () => {
    const u = await t.makeUser({ roles: ['seller'], mfa: true });
    const token = t.tokenFor(u, 'seller');
    for (const body of [{ status: 'APPROVED' }, { role: 'admin' }, { checks: { location: true } }, { sellerId: 1 }, { userId: 1 }]) {
      await request(t.app).put('/api/v1/seller/onboarding/profile').set(bearer(token)).send(body).expect(400);
    }
    await request(t.app).post('/api/v1/seller/onboarding/submit').set(bearer(token)).send({ status: 'APPROVED' }).expect(400);
  });
});
