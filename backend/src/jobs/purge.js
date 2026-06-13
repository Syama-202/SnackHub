// Clearing out short-lived rows, run with the document expiry (every six hours by the API, or
// `npm run jobs` from cron), so the tables that grow with every visit stay small:
// - refresh tokens past their expiry (a signed-out or abandoned session)
// - inbox notifications older than 30 days
// - rider GPS fixes older than 2 days (doc 12.1b: kept only that long, for rider privacy)
// Each delete removes at most a batch at a time and repeats until little is left, so it never
// holds a long lock. Safe to run twice at once: a second run finds nothing to delete.
import { refreshTokenModel } from '../models/identity/refreshToken.js';
import { notificationModel } from '../models/notify/notification.js';
import { riderTrailModel } from '../models/dispatch/riderTrail.js';

export const NOTIFICATION_DAYS = 30;
export const RIDER_TRAIL_DAYS = 2;
const BATCH = 5000;
const MAX_ROUNDS = 20;

async function drain(remove) {
  let total = 0;
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const n = await remove();
    total += n;
    if (n < BATCH) break;
  }
  return total;
}

export async function runPurge({ dbs }) {
  return {
    refreshTokens: await drain(() => refreshTokenModel.purgeExpired(dbs.identity, BATCH)),
    notifications: await drain(() => notificationModel.purgeOlderThan(dbs.notify, NOTIFICATION_DAYS, BATCH)),
    riderTrail: await drain(() => riderTrailModel.purgeOlderThan(dbs.dispatch, RIDER_TRAIL_DAYS, BATCH)),
  };
}
