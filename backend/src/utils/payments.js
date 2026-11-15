// Payments for orders (doc 10.9), the same for every provider. A provider has this shape
// (utils/razorpay.js and utils/phonepe.js are the real ones; tests pass fakes):
//   { name, enabled, createPayment, orderStatus, refund, refundStatus, verifyWebhook,
//     checkoutFor? }
// orderStatus, refund and refundStatus also get the provider's own order id (and refund id)
// as saved here; a provider that looks things up by our ids alone ignores them.
// Rules:
// - one payment per order (payments.uq_order), started only by the server, for the total the
//   server computed; the merchant order id is derived from the order, so a retry reuses it
// - "paid" comes only from the provider's status API (asked after a redirect, a webhook or a
//   timer), never from the browser or a webhook body; the amount must match to the paisa
// - every step is safe to repeat: statuses move only from the status the step expects, and
//   each ledger row is written in the same transaction as the status change it records
// - money that came in for an order that will not be delivered goes back automatically
// - cash on delivery has a payment row too: pending at checkout, collected at the door
import { createHash } from 'node:crypto';
import { AppError } from './AppError.js';
import { closeOrder, move, inbox } from './orders.js';
import { orderModel } from '../models/ordering/order.js';
import { sellerModel } from '../models/catalog/seller.js';
import { paymentModel } from '../models/payment/payment.js';
import { refundModel } from '../models/payment/refund.js';
import { ledgerEntryModel } from '../models/payment/ledgerEntry.js';
import { attempt, isUniqueViolation } from '../db/errors.js';
import { createRazorpay } from './razorpay.js';
import { createPhonePe } from './phonepe.js';

/**
 * The provider the settings name: Razorpay (test mode) when its key is set, otherwise
 * PhonePe's sandbox, which stays switched off without its own keys (pay on delivery only).
 */
export const createPaymentProvider = (env, options) => (env.RAZORPAY_KEY_ID ? createRazorpay(env, options) : createPhonePe(env, options));

/** The provider in use, set once by createApp (like realtime): closeOrder reaches it from anywhere. */
export const gateway = {
  provider: null,
  use(provider) {
    this.provider = provider;
  },
  get enabled() {
    return Boolean(this.provider?.enabled);
  },
};

// how long after a window ends a still-pending payment is given up on
const GRACE_MS = 10 * 60_000;

/** Our id for the order at the provider: stable per order, unique across databases. */
export const merchantOrderIdFor = (order) => `SH-${order.id}-${createHash('sha256').update(String(order.order_key)).digest('hex').slice(0, 10)}`;

const ledgerCharge = (trx, paymentId, amountPaise) => ledgerEntryModel.append(trx, { paymentId, entryType: 'CHARGE', amountPaise });

// ---------- cash on delivery

export async function recordCod(dbs, order) {
  try {
    await attempt(dbs.payment, (db) => paymentModel.create(db, { order_id: order.id, method: 'COD', amount_paise: order.total_paise, status: 'COD_PENDING' }));
  } catch (err) {
    if (!isUniqueViolation(err)) throw err; // already recorded
  }
}

/** The rider handed over the order and recorded the cash. */
export async function collectCod(dbs, order, collectedPaise) {
  const p = await paymentModel.findByOrder(dbs.payment, order.id);
  if (!p || p.method !== 'COD') return;
  await dbs.payment.transaction(async (trx) => {
    if (await paymentModel.moveStatus(trx, p.id, 'COD_PENDING', 'COD_COLLECTED')) if (collectedPaise > 0) await ledgerCharge(trx, p.id, collectedPaise);
  });
}

// ---------- online

/**
 * Starts the online payment for an order waiting for it. Returns { redirectUrl, expiresAt }
 * (redirectUrl is null for a provider that opens its own window on our page, like Razorpay).
 * If the provider cannot start it, the order is cancelled (stock back) and the error thrown.
 */
export async function startOnlinePayment(dbs, env, order) {
  const provider = gateway.provider;
  const merchantOrderId = merchantOrderIdFor(order);
  const windowSec = env.PAYMENT_WINDOW_MIN * 60;
  let p = await paymentModel.findByOrder(dbs.payment, order.id);
  if (!p) {
    try {
      await attempt(dbs.payment, (db) => paymentModel.create(db, { order_id: order.id, method: provider.name, provider_order_id: merchantOrderId, amount_paise: order.total_paise, status: 'CREATED', expires_at: new Date(Date.now() + windowSec * 1000) }));
    } catch (err) {
      if (!isUniqueViolation(err)) throw err; // the same checkout, twice at once
    }
    p = await paymentModel.findByOrder(dbs.payment, order.id);
  }
  // already started (a repeat): the same payment, never a second one at the provider
  if ((p.redirect_url || p.provider_payment_id) && p.status === 'CREATED') return { redirectUrl: p.redirect_url, expiresAt: p.expires_at?.getTime?.() ?? null };
  try {
    const started = await provider.createPayment({ merchantOrderId, amountPaise: order.total_paise, redirectUrl: `${env.APP_URL}/orders/${order.id}?payment=return`, expireAfterSec: windowSec });
    const expiresAt = started.expiresAt ? new Date(started.expiresAt) : new Date(Date.now() + windowSec * 1000);
    await dbs.payment('payments').where({ id: p.id, status: 'CREATED' }).update({ provider_payment_id: started.providerOrderId, redirect_url: started.redirectUrl, expires_at: expiresAt, updated_at: new Date() });
    return { redirectUrl: started.redirectUrl, expiresAt: expiresAt.getTime() };
  } catch (err) {
    await paymentModel.moveStatus(dbs.payment, p.id, 'CREATED', 'FAILED', { failure_code: String(err.providerCode ?? err.code ?? 'START_FAILED').slice(0, 60) });
    await closeOrder(dbs, order, 'CANCELLED', { role: 'system', reason: 'Online payment could not start', customerBody: 'Your payment could not start, so the order was cancelled. You were not charged.' });
    throw err;
  }
}

/** The paid order goes to the shop: a fresh 2-minute accept clock and a new promise from now. */
async function placePaid(dbs, order) {
  const now = new Date();
  const seller = await sellerModel.findById(dbs.catalog, order.seller_id);
  const notify = [{ userId: order.customer_id, type: 'order.paid', body: `Payment received for order #${order.id}. The shop has it now.` }];
  if (seller?.user_id) notify.push({ userId: seller.user_id, type: 'shop.order_new', body: `New order #${order.id}: accept it within 2 minutes.` });
  return move(dbs, order, 'PLACED', { role: 'system', set: { placed_at: now, promised_at: new Date(now.getTime() + order.promise_hi_min * 60_000) }, notify });
}

/**
 * Asks the provider about one payment and acts on the answer. Safe to call any number of
 * times, from anywhere. Returns PAID, FAILED, PENDING or EXPIRED.
 */
export async function settlePayment(dbs, payment) {
  const provider = gateway.provider;
  if (!provider || payment.method !== provider.name) return null;
  const st = await provider.orderStatus(payment.provider_order_id, { providerOrderId: payment.provider_payment_id });
  await dbs.payment('payments').where({ id: payment.id }).update({ checked_at: new Date(), ...(st.mode && { pay_mode: String(st.mode).slice(0, 30) }) });
  const order = await orderModel.findById(dbs.ordering, payment.order_id);

  if (st.state === 'PAID') {
    const matches = st.amountPaise === payment.amount_paise;
    await dbs.payment.transaction(async (trx) => {
      const captured = await paymentModel.moveStatus(trx, payment.id, ['CREATED', 'FAILED', 'EXPIRED'], 'CAPTURED', matches ? {} : { failure_code: 'AMOUNT_MISMATCH' });
      if (captured) await ledgerCharge(trx, payment.id, st.amountPaise);
    });
    if (order?.status === 'PENDING_PAYMENT' && matches) {
      await placePaid(dbs, order);
    } else if (order?.status === 'PENDING_PAYMENT') {
      // never place an order for a different amount: cancel it and give the money back
      await closeOrder(dbs, order, 'CANCELLED', { role: 'system', reason: 'Payment amount did not match', customerBody: 'Your payment did not match the order total, so the order was cancelled and the payment is being refunded.' });
    } else if (order && ['CANCELLED', 'REJECTED'].includes(order.status)) {
      // paid after the order closed (late payment, or cancelled while paying): refund it all
      await refundRemaining(dbs, payment.order_id, 'The order closed before the payment completed');
    }
    return 'PAID';
  }

  if (st.state === 'FAILED') {
    await paymentModel.moveStatus(dbs.payment, payment.id, 'CREATED', 'FAILED', { failure_code: String(st.errorCode ?? 'FAILED').slice(0, 60) });
    if (order?.status === 'PENDING_PAYMENT') await closeOrder(dbs, order, 'CANCELLED', { role: 'system', reason: 'Payment failed', customerBody: 'Your payment did not go through, so the order was cancelled. You were not charged.' });
    return 'FAILED';
  }

  // still pending: give up only well after the window, when it can no longer complete
  if (payment.expires_at && new Date(payment.expires_at).getTime() + GRACE_MS < Date.now()) {
    await paymentModel.moveStatus(dbs.payment, payment.id, 'CREATED', 'EXPIRED');
    if (order?.status === 'PENDING_PAYMENT') await closeOrder(dbs, order, 'CANCELLED', { role: 'system', reason: 'Payment window ended', customerBody: 'The payment was not completed in time, so the order was cancelled. You were not charged.' });
    return 'EXPIRED';
  }
  return 'PENDING';
}

// ---------- refunds

/**
 * What the provider actually took for a payment: its CHARGE ledger rows. Refunds are capped
 * by this, not by the order total, so a payment for a different amount is refunded exactly.
 */
async function capturedPaise(db, payment) {
  const [{ charged }] = await db('ledger_entries').where({ payment_id: payment.id, entry_type: 'CHARGE' }).sum({ charged: 'amount_paise' });
  return Number(charged ?? 0) || payment.amount_paise;
}

/**
 * Refunds part or all of an order's captured payment. The total of refunds never exceeds
 * what was captured: the payment row is locked while the new refund is added.
 * Returns the refund id, or null when there is nothing to refund.
 */
export async function refundOrder(dbs, orderId, amountPaise, reason, { complaintId = null } = {}) {
  const provider = gateway.provider;
  const created = await dbs.payment.transaction(async (trx) => {
    const p = await trx('payments').where({ order_id: orderId }).forUpdate().first();
    if (!p || p.method === 'COD' || !['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUND_PENDING'].includes(p.status)) return null;
    const [{ used }] = await trx('refunds').where({ payment_id: p.id }).whereNot({ status: 'FAILED' }).sum({ used: 'amount_paise' });
    const left = (await capturedPaise(trx, p)) - Number(used ?? 0);
    if (amountPaise > left) throw new AppError(409, 'REFUND_TOO_LARGE', `Only ${left} paise can still be refunded on this order`);
    if (amountPaise <= 0) return null;
    const [{ n }] = await trx('refunds').where({ payment_id: p.id }).count({ n: '*' });
    const id = await refundModel.create(trx, { paymentId: p.id, complaintId, amountPaise });
    const merchantRefundId = `SHR-${p.id}-${Number(n) + 1}-${p.provider_order_id.slice(-6)}`;
    await trx('refunds').where({ id }).update({ merchant_refund_id: merchantRefundId, reason: reason.slice(0, 200), updated_at: new Date() });
    await trx('payments').where({ id: p.id }).update({ status: 'REFUND_PENDING', updated_at: new Date() });
    return { id, merchantRefundId, payment: p };
  });
  if (!created) return null;
  await sendRefund(dbs, created.id);
  return created.id;
}

/** Whatever is left of the captured amount. */
export async function refundRemaining(dbs, orderId, reason) {
  const p = await paymentModel.findByOrder(dbs.payment, orderId);
  if (!p || p.method === 'COD' || !['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUND_PENDING'].includes(p.status)) return null;
  const [{ used }] = await dbs.payment('refunds').where({ payment_id: p.id }).whereNot({ status: 'FAILED' }).sum({ used: 'amount_paise' });
  return refundOrder(dbs, orderId, (await capturedPaise(dbs.payment, p)) - Number(used ?? 0), reason);
}

/** Refunds the provider refused that no admin has sent again yet, oldest first. */
export async function failedRefunds(dbs, { limit = 100 } = {}) {
  const rows = await dbs.payment('refunds as r').join('payments as p', 'p.id', 'r.payment_id').where({ 'r.status': 'FAILED' }).whereNull('r.retried_by').orderBy('r.id').limit(limit)
    .select('r.id', 'r.amount_paise', 'r.reason', 'r.failure_code', 'r.created_at', 'r.updated_at', 'r.complaint_id', 'p.order_id', 'p.amount_paise as paid_paise', 'p.status as payment_status');
  return rows.map((r) => ({ id: r.id, orderId: Number(r.order_id), amountPaise: r.amount_paise, paidPaise: r.paid_paise, paymentStatus: r.payment_status, reason: r.reason, failureCode: r.failure_code, complaintId: r.complaint_id, createdAt: new Date(r.created_at).getTime(), failedAt: r.updated_at ? new Date(r.updated_at).getTime() : null }));
}

/**
 * An admin sends a refused refund again: a new refund for the same amount (or whatever can
 * still be refunded, if less), with a new refund id, linked from the failed one so it leaves
 * the queue. Returns the new refund's id, or null when nothing is left to refund.
 */
export async function retryRefund(dbs, refundId) {
  const r = await dbs.payment('refunds').where({ id: refundId }).first();
  if (!r) throw new AppError(404, 'NOT_FOUND', 'Refund not found');
  if (r.status !== 'FAILED' || r.retried_by) throw new AppError(409, 'REFUND_NOT_FAILED', 'This refund is not waiting for a retry');
  const p = await dbs.payment('payments').where({ id: r.payment_id }).first();
  const [{ used }] = await dbs.payment('refunds').where({ payment_id: p.id }).whereNot({ status: 'FAILED' }).sum({ used: 'amount_paise' });
  const amount = Math.min(r.amount_paise, (await capturedPaise(dbs.payment, p)) - Number(used ?? 0));
  const newId = amount > 0 ? await refundOrder(dbs, p.order_id, amount, `Sent again by an admin: ${r.reason ?? 'refund'}`, { complaintId: r.complaint_id }) : null;
  // nothing left to refund still clears it from the queue (it is linked to itself)
  await dbs.payment('refunds').where({ id: r.id, status: 'FAILED' }).whereNull('retried_by').update({ retried_by: newId ?? r.id, updated_at: new Date() });
  return newId;
}

/** Sends a pending refund to the provider (again, if a send was lost) and records the answer. */
async function sendRefund(dbs, refundId) {
  const provider = gateway.provider;
  const r = await dbs.payment('refunds').where({ id: refundId }).first();
  const p = await dbs.payment('payments').where({ id: r.payment_id }).first();
  if (r.status !== 'PENDING' || !provider) return;
  const ids = { providerOrderId: p.provider_payment_id, providerRefundId: r.provider_refund_id };
  try {
    const sent = r.provider_refund_id
      ? await provider.refundStatus(r.merchant_refund_id, ids)
      : await provider.refund({ merchantRefundId: r.merchant_refund_id, merchantOrderId: p.provider_order_id, amountPaise: r.amount_paise, providerOrderId: p.provider_payment_id });
    if (sent.providerRefundId && !r.provider_refund_id) await dbs.payment('refunds').where({ id: r.id }).update({ provider_refund_id: sent.providerRefundId, updated_at: new Date() });
    await finishRefund(dbs, r.id, sent.state, sent.errorCode);
  } catch (err) {
    // refused: the first send may have reached the provider and only its answer was lost,
    // so ask about this refund id before anything else; otherwise it stays PENDING
    if (err.code !== 'PAYMENT_PROVIDER_REFUSED' || r.provider_refund_id) return;
    try {
      const known = await provider.refundStatus(r.merchant_refund_id, ids);
      if (known.providerRefundId) await dbs.payment('refunds').where({ id: r.id }).update({ provider_refund_id: known.providerRefundId, updated_at: new Date() });
      await finishRefund(dbs, r.id, known.state, known.errorCode);
    } catch {
      // the reconciler asks again
    }
  }
}

async function finishRefund(dbs, refundId, state, errorCode = null) {
  if (state === 'PENDING') return;
  await dbs.payment.transaction(async (trx) => {
    const r = await trx('refunds').where({ id: refundId }).first();
    const p = await trx('payments').where({ id: r.payment_id }).forUpdate().first();
    if (state === 'DONE') {
      if (!(await refundModel.markProcessed(trx, r.id, r.provider_refund_id))) return;
      await ledgerEntryModel.append(trx, { paymentId: p.id, entryType: 'REFUND', amountPaise: r.amount_paise });
    } else if (!(await trx('refunds').where({ id: r.id, status: 'PENDING' }).update({ status: 'FAILED', failure_code: String(errorCode ?? 'FAILED').slice(0, 60), updated_at: new Date() }))) return;
    // the payment's status follows what is done and what is still in flight
    const rows = await trx('refunds').where({ payment_id: p.id });
    const done = rows.filter((x) => x.status === 'PROCESSED').reduce((s, x) => s + x.amount_paise, 0);
    const pending = rows.some((x) => x.status === 'PENDING');
    const status = pending ? 'REFUND_PENDING' : done >= p.amount_paise ? 'REFUNDED' : done > 0 ? 'PARTIALLY_REFUNDED' : 'CAPTURED';
    await trx('payments').where({ id: p.id }).update({ status, updated_at: new Date() });
  });
  if (state === 'FAILED') {
    const r = await dbs.payment('refunds').where({ id: refundId }).first();
    const p = await dbs.payment('payments').where({ id: r.payment_id }).first();
    // an admin settles a refund the provider refused; the customer is told it is being looked at
    const order = await orderModel.findById(dbs.ordering, p.order_id);
    if (order) await dbs.ordering.transaction((trx) => inbox(trx, { userId: order.customer_id, orderId: order.id, type: 'refund.delayed', body: `Your refund for order #${order.id} is delayed. Our team is on it.` }));
  }
}

/** A refund the provider reported on (webhook or status): asks the status API and records it. */
export async function settleRefund(dbs, merchantRefundId, providerRefundId = null) {
  const r = merchantRefundId
    ? await dbs.payment('refunds').where({ merchant_refund_id: merchantRefundId }).first()
    : providerRefundId
      ? await dbs.payment('refunds').where({ provider_refund_id: providerRefundId }).first()
      : null;
  if (r) await sendRefund(dbs, r.id);
}

// ---------- the order closes

/** Called by closeOrder: prepaid money goes back, cash that will never be collected is closed. */
export async function onOrderClosed(dbs, order) {
  if (order.payment_mode === 'COD') {
    const p = await paymentModel.findByOrder(dbs.payment, order.id);
    if (p) await paymentModel.moveStatus(dbs.payment, p.id, 'COD_PENDING', 'FAILED', { failure_code: 'ORDER_CLOSED' });
    return;
  }
  await refundRemaining(dbs, order.id, 'The order was cancelled or rejected');
}

// ---------- the reconciler (orderTimers): lost redirects, lost webhooks, lost refund answers

export async function reconcilePayments(dbs, { limit = 20 } = {}) {
  const out = { checked: 0, placed: 0, closed: 0, refunds: 0 };
  if (!gateway.enabled) return out;
  // orders still waiting for their payment, oldest first
  const waiting = await dbs.ordering('orders').where({ status: 'PENDING_PAYMENT' }).andWhere('placed_at', '<', new Date(Date.now() - 15_000)).orderBy('placed_at').limit(limit);
  for (const order of waiting) {
    const p = await paymentModel.findByOrder(dbs.payment, order.id);
    if (!p) {
      // the payment row was never written (a crash at checkout): the order cannot be paid
      if (Date.now() - new Date(order.placed_at).getTime() > 2 * 60_000 && (await closeOrder(dbs, order, 'CANCELLED', { role: 'system', reason: 'Payment never started', customerBody: 'The payment did not start, so the order was cancelled. You were not charged.' }))) out.closed += 1;
      continue;
    }
    if (p.checked_at && Date.now() - new Date(p.checked_at).getTime() < 20_000) continue;
    try {
      const state = await settlePayment(dbs, p);
      out.checked += 1;
      if (state === 'PAID') out.placed += 1;
      if (state === 'FAILED' || state === 'EXPIRED') out.closed += 1;
    } catch {
      // the provider is down: next pass
    }
  }
  // payments still open whose order has moved on (cancelled while paying): a late success is refunded
  const open = await dbs.payment('payments').where({ status: 'CREATED', method: gateway.provider.name }).andWhere('created_at', '<', new Date(Date.now() - 60_000))
    .andWhere((q) => q.whereNull('checked_at').orWhere('checked_at', '<', new Date(Date.now() - 60_000))).orderBy('id').limit(limit);
  for (const p of open) {
    try {
      await settlePayment(dbs, p);
      out.checked += 1;
    } catch {
      // next pass
    }
  }
  // payments given up on in the last day, asked again every half hour: a provider whose
  // orders never expire by themselves (Razorpay) could still take a late payment, which is
  // then refunded in full. Usually the webhook says so first.
  const lapsed = await dbs.payment('payments').where({ status: 'EXPIRED', method: gateway.provider.name }).andWhere('updated_at', '>', new Date(Date.now() - 86_400_000))
    .andWhere((q) => q.whereNull('checked_at').orWhere('checked_at', '<', new Date(Date.now() - 30 * 60_000))).orderBy('id').limit(limit);
  for (const p of lapsed) {
    try {
      await settlePayment(dbs, p);
      out.checked += 1;
    } catch {
      // next pass
    }
  }
  for (const r of await dbs.payment('refunds').where({ status: 'PENDING' }).andWhere('created_at', '<', new Date(Date.now() - 30_000)).orderBy('id').limit(limit)) {
    await sendRefund(dbs, r.id);
    out.refunds += 1;
  }
  // paid orders that closed but whose refund never started (the process stopped between
  // closing the order and starting the refund): closed online orders of the last week whose
  // payment is still fully captured with no refund at all. A refused refund is left to the
  // admins (the failed-refunds queue), never resent here.
  const closed = await dbs.ordering('orders').whereIn('status', ['CANCELLED', 'REJECTED']).where({ payment_mode: 'ONLINE' })
    .andWhere('placed_at', '>', new Date(Date.now() - 7 * 86_400_000)).andWhere('closed_at', '<', new Date(Date.now() - 2 * 60_000)).orderBy('placed_at', 'desc').limit(200).pluck('id');
  if (closed.length) {
    const stuck = await dbs.payment('payments as p').whereIn('p.order_id', closed).where({ 'p.status': 'CAPTURED' })
      .whereNotExists((q) => q.select(dbs.payment.raw('1')).from('refunds as r').whereRaw('r.payment_id = p.id')).limit(limit).pluck('p.order_id');
    for (const orderId of stuck) {
      try {
        if (await refundRemaining(dbs, orderId, 'The order was cancelled or rejected')) out.refunds += 1;
      } catch {
        // next pass
      }
    }
  }
  return out;
}

/** The order's payment as the apps show it. */
export async function paymentViews(dbs, orderIds) {
  if (!orderIds.length) return new Map();
  const rows = await dbs.payment('payments').whereIn('order_id', orderIds);
  const refunds = rows.length ? await dbs.payment('refunds').whereIn('payment_id', rows.map((p) => p.id)) : [];
  return new Map(
    rows.map((p) => {
      const mine = refunds.filter((r) => r.payment_id === p.id);
      return [
        p.order_id,
        {
          status: p.status,
          method: p.method,
          payMode: p.pay_mode,
          refundedPaise: mine.filter((r) => r.status === 'PROCESSED').reduce((s, r) => s + r.amount_paise, 0),
          refundPendingPaise: mine.filter((r) => r.status === 'PENDING').reduce((s, r) => s + r.amount_paise, 0),
          redirectUrl: p.status === 'CREATED' ? p.redirect_url : null,
          // a provider that opens its window on our page (Razorpay): what the browser needs
          checkout: gateway.provider?.checkoutFor?.(p) ?? null,
          expiresAt: p.expires_at ? new Date(p.expires_at).getTime() : null,
        },
      ];
    }),
  );
}
