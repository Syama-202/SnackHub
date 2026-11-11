// The clocks of the order flow (doc 10.1, 10.2, 10.8), every few seconds:
// - a shop that has not accepted in 2 minutes: the order is cancelled and the stock returned
// - an offer nobody answered in 20 seconds: it closes and the next rider is asked
// - an accepted order with no rider and no open offer: ask again (nobody was free before)
// - a checkout's stock hold whose order was never written: the units go back on the shelf
// - a rider holding an order who has sent no position for 5 minutes: staff get one alert
// - online payments: lost redirects and webhooks settled from the provider's status API,
//   abandoned payments expired (the order cancelled, stock back), refunds asked about again
// Every step is safe to run twice: changes go through the status the job saw.
import { closeOrder, policyOf } from '../utils/orders.js';
import { describeError, recordError } from '../utils/errors.js';
import { expireOffers, offerNext } from '../utils/dispatch.js';
import { orderModel } from '../models/ordering/order.js';
import { stockHoldModel } from '../models/catalog/stockHold.js';
import { reconcilePayments } from '../utils/payments.js';
import { outboxModel } from '../models/outbox.js';
import { riderModel } from '../models/dispatch/rider.js';
import { RIDER_EXPECTED_STATES, riderSilent } from '../../../shared/domain/riderSilence.js';
import { shouldRunPass } from '../utils/activity.js';

export async function runOrderTimers({ dbs, logger }) {
  const out = { sellerTimeouts: 0, offersExpired: 0, offersMade: 0, holdsReleased: 0, silentRiders: 0 };

  for (const order of await orderModel.listPlacedBefore(dbs.ordering, new Date(Date.now() - 60_000))) {
    const policy = await policyOf(dbs, order);
    if (Date.now() - new Date(order.placed_at).getTime() < policy.sellerAcceptTimeoutSec * 1000) continue;
    const done = await closeOrder(dbs, order, 'CANCELLED', {
      role: 'system',
      reason: 'The shop did not accept in 2 minutes',
      customerBody: 'The shop did not respond, so your order was cancelled. You were not charged.',
    });
    if (done) out.sellerTimeouts += 1;
  }

  out.offersExpired = await expireOffers(dbs);

  for (const order of await orderModel.listNeedingRider(dbs.ordering)) if (await offerNext(dbs, order)) out.offersMade += 1;

  for (const key of await stockHoldModel.listExpiredKeys(dbs.catalog)) {
    // the order may exist after all (the commit step was cut short): then the hold stands
    const order = await dbs.ordering('orders').where({ order_key: key }).first('id', 'status');
    if (order && !['CANCELLED', 'REJECTED'].includes(order.status)) await stockHoldModel.commit(dbs.catalog, key);
    else out.holdsReleased += await stockHoldModel.release(dbs.catalog, key);
  }

  // one alert per order, however long the silence lasts (the dedupe key)
  const held = await dbs.ordering('orders').whereNotNull('rider_id').whereIn('status', RIDER_EXPECTED_STATES).andWhere('placed_at', '>', new Date(Date.now() - 86_400_000)).select('id', 'status', 'rider_id').limit(200);
  const riders = new Map((await riderModel.listByIds(dbs.dispatch, [...new Set(held.map((o) => o.rider_id))])).map((r) => [r.id, r]));
  for (const o of held) {
    const r = riders.get(o.rider_id);
    if (!r || !riderSilent({ status: o.status, hasRider: true, lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at).getTime() : null })) continue;
    if (await dbs.ordering.transaction((trx) => outboxModel.addOnce(trx, 'admin.alert', `rider-silent:${o.id}`, { type: 'rider_silent', userId: r.user_id, orderId: o.id }))) out.silentRiders += 1;
  }

  if (dbs.payment) out.payments = await reconcilePayments(dbs);

  if (out.sellerTimeouts || out.offersExpired || out.holdsReleased || out.silentRiders || out.payments?.checked || out.payments?.refunds) logger?.info(out, 'order timers');
  return out;
}

export function createOrderTimers(deps) {
  let timer = null;
  let running = false;
  let lastPassAt = 0;
  return {
    runOnce: () => runOrderTimers(deps),
    start(everyMs = 5000) {
      timer = setInterval(async () => {
        // a quiet site checks every half hour instead, so the database can sleep (utils/activity.js)
        if (running || !shouldRunPass(lastPassAt)) return;
        lastPassAt = Date.now();
        running = true;
        try {
          await runOrderTimers(deps);
        } catch (err) {
          deps.logger?.error({ reason: err.code ?? err.message }, 'order timers pass failed');
          recordError(deps.dbs, { source: 'job', ...describeError(err), where: 'order timers' }, deps);
        } finally {
          running = false;
        }
      }, everyMs);
      timer.unref?.();
    },
    /** Stops the clock and waits for a pass that is under way. */
    async stop() {
      clearInterval(timer);
      while (running) await new Promise((r) => setTimeout(r, 50));
    },
  };
}
