// notify.push_subscriptions: devices that asked for push messages (shared/domain/push.js).
// The endpoint is a secret address: looked up by its hash, never logged or sent to a client.
import { createHash } from 'node:crypto';
import { MAX_DEVICES } from '../../../../shared/domain/push.js';

const TABLE = 'push_subscriptions';
export const endpointHash = (endpoint) => createHash('sha256').update(endpoint).digest('hex');

export const pushSubscriptionModel = {
  /**
   * Saves this device for the person and portal (a device that subscribed before under
   * another account or session is taken over), and drops the oldest past the device limit.
   */
  save: (db, { userId, portal, familyId, endpoint, p256dh, auth, device }) =>
    db.transaction(async (trx) => {
      const row = { user_id: userId, portal, family_id: familyId, endpoint, endpoint_hash: endpointHash(endpoint), p256dh, auth, device, failures: 0 };
      await trx(TABLE).insert(row).onConflict('endpoint_hash').merge({ ...row, created_at: new Date() });
      const keep = await trx(TABLE).where({ user_id: userId, portal }).orderBy('created_at', 'desc').limit(MAX_DEVICES).pluck('id');
      await trx(TABLE).where({ user_id: userId, portal }).whereNotIn('id', keep).del();
    }),
  removeForUser: (db, userId, endpoint) => db(TABLE).where({ user_id: userId, endpoint_hash: endpointHash(endpoint) }).del(),
  findForUser: (db, userId, endpoint) => db(TABLE).where({ user_id: userId, endpoint_hash: endpointHash(endpoint) }).first(),
  listFor: (db, userId, portal) => db(TABLE).where({ user_id: userId, portal }),
  countFor: (db, userId, portal) => db(TABLE).where({ user_id: userId, portal }).count({ n: '*' }).first().then((r) => Number(r.n)),
  removeIds: (db, ids) => (ids.length ? db(TABLE).whereIn('id', ids).del() : Promise.resolve(0)),
  sent: (db, id) => db(TABLE).where({ id }).update({ last_sent_at: new Date(), failures: 0 }),
  failed: (db, id) => db(TABLE).where({ id }).increment('failures', 1),
};
