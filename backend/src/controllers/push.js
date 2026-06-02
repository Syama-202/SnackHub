// Push notifications for this device (shared/domain/push.js):
//   POST   /auth/push/status             { endpoint? } on or off on the server, the public key, and whether this device is subscribed
//   POST   /auth/push/subscriptions      { endpoint, keys: { p256dh, auth }, device } this device wants them
//   POST   /auth/push/unsubscribe        { endpoint } it no longer does
//   POST   /auth/push/test               a test message to this person's devices in this portal
// The portal is the token's; the session is this device's sign-in (the refresh cookie), so
// signing out of it stops its messages. Endpoints are never echoed back or logged.
import { AppError } from '../utils/AppError.js';
import { hashToken } from '../utils/tokens.js';
import { REFRESH_COOKIE } from './auth.js';
import { refreshTokenModel } from '../models/identity/refreshToken.js';
import { pushSubscriptionModel } from '../models/notify/pushSubscription.js';
import { pushToDevices } from '../utils/push.js';
import { auditLogModel } from '../models/identity/auditLog.js';

const PORTALS = ['customer', 'seller', 'rider'];

export function pushController({ dbs, push }) {
  const portalOf = (req) => {
    if (!PORTALS.includes(req.user.role)) throw new AppError(403, 'FORBIDDEN', 'Push messages are for customers, shops and riders');
    return req.user.role;
  };
  // this device's live sign-in session, from its refresh cookie
  const sessionOf = async (req) => {
    const raw = req.cookies?.[REFRESH_COOKIE];
    const row = raw && (await refreshTokenModel.findByHash(dbs.identity, hashToken(raw)));
    if (!row || row.user_id !== req.user.userId || row.revoked_at) throw new AppError(409, 'NO_SESSION', 'Sign in again on this device to turn on alerts');
    return row.family_id;
  };
  const mustBeOn = () => {
    if (!push?.enabled) throw new AppError(503, 'PUSH_OFF', 'Phone and desktop alerts are not set up on this server yet');
  };

  async function show(req, res) {
    const portal = portalOf(req);
    const endpoint = req.body.endpoint ?? null;
    const mine = endpoint ? await pushSubscriptionModel.findForUser(dbs.notify, req.user.userId, endpoint) : null;
    res.json({ enabled: Boolean(push?.enabled), publicKey: push?.publicKey ?? null, subscribed: Boolean(mine && mine.portal === portal), devices: await pushSubscriptionModel.countFor(dbs.notify, req.user.userId, portal) });
  }

  async function subscribe(req, res) {
    mustBeOn();
    const portal = portalOf(req);
    const familyId = await sessionOf(req);
    const { endpoint, keys, device } = req.body;
    await pushSubscriptionModel.save(dbs.notify, { userId: req.user.userId, portal, familyId, endpoint, p256dh: keys.p256dh, auth: keys.auth, device: device ?? null });
    await auditLogModel.append(dbs.identity, { actorId: req.user.userId, action: 'push.subscribe', target: `user:${req.user.userId}`, after: { portal, device: device ?? null } });
    res.status(201).json({ subscribed: true, devices: await pushSubscriptionModel.countFor(dbs.notify, req.user.userId, portal) });
  }

  async function unsubscribe(req, res) {
    const portal = portalOf(req);
    const removed = await pushSubscriptionModel.removeForUser(dbs.notify, req.user.userId, req.body.endpoint);
    if (removed) await auditLogModel.append(dbs.identity, { actorId: req.user.userId, action: 'push.unsubscribe', target: `user:${req.user.userId}`, after: { portal } });
    res.json({ subscribed: false, devices: await pushSubscriptionModel.countFor(dbs.notify, req.user.userId, portal) });
  }

  async function test(req, res) {
    mustBeOn();
    const portal = portalOf(req);
    const sent = await pushToDevices(dbs, push, { userId: req.user.userId, portal, message: { type: 'push.test', body: 'Alerts are on. This is how SnackHub messages will look.' } });
    if (!sent) throw new AppError(409, 'NO_DEVICES', 'No device with alerts on. Turn them on first.');
    res.json({ sent });
  }

  return { show, subscribe, unsubscribe, test };
}
