// The clocks of the order flow (doc 10.1, 10.2, 10.8), every few seconds:
// - a shop that has not accepted in 2 minutes: the order is cancelled and the stock returned
// - an offer nobody answered in 20 seconds: it closes and the next rider is asked
// - an accepted order with no rider and no open offer: ask again (nobody was free before)
// - a checkout's stock hold whose order was never written: the units go back on the shelf
// Every step is safe to run twice: changes go through the status the job saw.
import { closeOrder, policyOf } from '../utils/orders.js';
import { expireOffers, offerNext } from '../utils/dispatch.js';
import { orderModel } from '../models/ordering/order.js';
import { stockHoldModel } from '../models/catalog/stockHold.js';

export async function runOrderTimers({ dbs, logger }) {
  const out = { sellerTimeouts: 0, offersExpired: 0, offersMade: 0, holdsReleased: 0 };

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

  if (out.sellerTimeouts || out.offersExpired || out.holdsReleased) logger?.info(out, 'order timers');
  return out;
}

export function createOrderTimers(deps) {
  let timer = null;
  let running = false;
  return {
    runOnce: () => runOrderTimers(deps),
    start(everyMs = 5000) {
      timer = setInterval(async () => {
        if (running) return;
        running = true;
        try {
          await runOrderTimers(deps);
        } catch (err) {
          deps.logger?.error({ reason: err.code ?? err.message }, 'order timers pass failed');
        } finally {
          running = false;
        }
      }, everyMs);
      timer.unref?.();
    },
    stop: () => clearInterval(timer),
  };
}
