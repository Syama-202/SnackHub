// Push notifications through the browsers' push services (Web Push with VAPID keys, the
// web-push library). Off until VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are set; the inbox works
// either way. A push is a copy of an inbox message: if it cannot be sent, the inbox still has
// it. Endpoints and keys are never logged.
import webpush from 'web-push';
import { pushSubscriptionModel } from '../models/notify/pushSubscription.js';
import { refreshTokenModel } from '../models/identity/refreshToken.js';
import { pushEndpointOk, pushPayload } from '../../../shared/domain/push.js';

// a device the push service no longer knows (unsubscribed, app removed): forget it
const GONE = [404, 410];
// a device that keeps failing for other reasons is dropped after this many sends in a row
const MAX_FAILURES = 5;

/**
 * The sender. `send` posts one encrypted message to one subscription; tests pass a fake with
 * the same shape. Messages live at the push service for at most an hour (an order update
 * older than that is stale) and are marked urgent only for the people who must act now.
 */
export function createPush(env, { logger, send } = {}) {
  const enabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
  const details = enabled ? { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY } : null;
  const post =
    send ??
    ((sub, body, { urgency }) =>
      webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, { vapidDetails: details, TTL: 3600, urgency, timeout: 5000 }));
  return { enabled, publicKey: enabled ? env.VAPID_PUBLIC_KEY : null, post, logger };
}

/**
 * Sends one inbox message to every device of the person in that portal whose sign-in session
 * is still live. Devices whose session ended, or that the push service no longer knows, are
 * removed. Never throws: the inbox row is already saved.
 */
export async function pushToDevices(dbs, push, { userId, portal, message }) {
  if (!push?.enabled) return 0;
  try {
    const subs = await pushSubscriptionModel.listFor(dbs.notify, userId, portal);
    if (!subs.length) return 0;
    const live = new Set((await refreshTokenModel.listLive(dbs.identity, userId)).map((s) => s.family_id));
    const ended = subs.filter((s) => !live.has(s.family_id) || !pushEndpointOk(s.endpoint));
    await pushSubscriptionModel.removeIds(dbs.notify, ended.map((s) => s.id));
    const body = JSON.stringify(pushPayload(portal, message));
    // new orders for shops and offers for riders cannot wait; the rest may be batched
    const urgency = portal === 'customer' ? 'normal' : 'high';
    let sent = 0;
    for (const s of subs.filter((x) => !ended.includes(x))) {
      try {
        await push.post(s, body, { urgency });
        await pushSubscriptionModel.sent(dbs.notify, s.id);
        sent += 1;
      } catch (err) {
        if (GONE.includes(err.statusCode) || s.failures + 1 >= MAX_FAILURES) await pushSubscriptionModel.removeIds(dbs.notify, [s.id]);
        else await pushSubscriptionModel.failed(dbs.notify, s.id);
        push.logger?.warn({ subscriptionId: s.id, status: err.statusCode ?? null, reason: err.code ?? 'PUSH_FAILED' }, 'push not delivered');
      }
    }
    return sent;
  } catch (err) {
    push.logger?.warn({ reason: err.code ?? err.message }, 'push pass failed');
    return 0;
  }
}
