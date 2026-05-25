// Checkout and the customer's orders (doc 10.1, 10.3, 10.8, 11.1). Pay on delivery only for
// now. The server re-prices the cart, re-runs serviceability, reserves stock all-or-nothing
// and keys the order on Idempotency-Key, so a double tap or a retry makes one order. Every
// read is scoped to the customer in the token: another customer's order is a 404.
//   POST /orders/quote         prices, fee and promise for an address
//   POST /orders               place the order (Idempotency-Key header)
//   GET  /orders, /orders/:id  history and one order
//   GET  /orders/:id/track     where the order is, from the server's own distances
//   GET  /orders/:id/otp       the delivery code, only once the rider is within 500 m
//   POST /orders/:id/cancel    free until the shop has packed it
//   POST /orders/:id/review    one rating after delivery
import { gateway, recordCod, settlePayment, startOnlinePayment } from '../utils/payments.js';
import { paymentModel } from '../models/payment/payment.js';
import { AppError } from '../utils/AppError.js';
import { addressSummary } from '../../../shared/domain/addresses.js';
import { cartView } from './cart.js';
import { addressDetail, announceOrder, closeOrder, codeForCustomer, currentPolicy, notifySeller, policyOf, trackState, viewOrder, viewOrders } from '../utils/orders.js';
import { deliveryCode, deliveryCodeHash, orderKeyFor } from '../utils/deliveryCode.js';
import { orderModel } from '../models/ordering/order.js';
import { orderItemModel } from '../models/ordering/orderItem.js';
import { orderReviewModel } from '../models/ordering/orderReview.js';
import { cartModel } from '../models/ordering/cart.js';
import { customerCreditModel } from '../models/ordering/customerCredit.js';
import { addressModel } from '../models/identity/address.js';
import { productModel } from '../models/catalog/product.js';
import { sellerModel, isOpenForOrders } from '../models/catalog/seller.js';
import { stockHoldModel } from '../models/catalog/stockHold.js';
import { riderModel } from '../models/dispatch/rider.js';
import { deliveryPromise } from '../../../shared/domain/promise.js';
import { canTransition } from '../../../shared/domain/orderStates.js';
import { distanceM } from '../../../shared/domain/geo.js';

const DUPLICATE = 1062;
// how long a checkout's stock hold lives if the order row is never written (crash, timeout)
const HOLD_MINUTES = 2;

export function ordersController({ env, dbs }) {
  const ownOrder = async (req) => {
    const order = await orderModel.findForCustomer(dbs.ordering, req.params.id, req.user.userId);
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found');
    return order;
  };

  /** The cart, the address and the shop, checked the same way for a quote and an order. */
  async function prepare(customerId, addressId) {
    const cart = await cartView(dbs, customerId);
    if (!cart.items.length) throw new AppError(400, 'CART_EMPTY', 'Your cart is empty');
    const address = await addressModel.findForUser(dbs.identity, addressId, customerId);
    if (!address) throw new AppError(422, 'ADDRESS_REQUIRED', 'Choose one of your delivery addresses');
    const seller = await sellerModel.findById(dbs.catalog, cart.sellerId);
    if (seller.is_demo) throw new AppError(409, 'DEMO_SHOP', `${seller.shop_name} is a demo shop and takes no real orders`);
    if (!isOpenForOrders(seller)) throw new AppError(409, 'SHOP_UNAVAILABLE', 'This shop is not taking orders right now');
    const policy = await currentPolicy(dbs);
    const drop = { lat: Number(address.lat), lng: Number(address.lng) };
    const km = distanceM({ lat: Number(seller.lat), lng: Number(seller.lng) }, drop) / 1000;
    const promise = { ...deliveryPromise({ straightKm: km, temp: cart.tempClass, busyExtraMin: seller.busy_extra_min, sellerRadiusKm: Number(seller.radius_km) }, policy.config), distanceKm: +km.toFixed(2) };
    return { cart, address, seller, policy, promise, drop };
  }

  async function quote(req, res) {
    const { cart, policy, promise } = await prepare(req.user.userId, req.body.addressId);
    // the oldest usable credit from a resolved complaint, applied to a pay-on-delivery order
    const [credit] = await customerCreditModel.listUsable(dbs.ordering, req.user.userId);
    const modes = [...(gateway.enabled ? ['ONLINE'] : []), ...(policy.config.codEnabled ? ['COD'] : [])];
    res.json({ ...cart, promise, codEnabled: policy.config.codEnabled, creditPaise: credit?.amount_paise ?? 0, paymentModes: modes, onlineProvider: gateway.enabled ? gateway.provider.name : null });
  }

  async function replay(customerId, idemKey) {
    const prev = await orderModel.findByIdempotencyKey(dbs.ordering, customerId, idemKey);
    return prev ? { order: await viewOrder(dbs, prev, 'customer'), replayed: true } : null;
  }

  async function place(req, res) {
    const customerId = req.user.userId;
    const idemKey = req.idempotencyKey;
    const again = await replay(customerId, idemKey);
    if (again) return res.json(again);
    const online = req.body.paymentMode === 'ONLINE';
    if (online && !gateway.enabled) throw new AppError(409, 'ONLINE_PAYMENT_UNAVAILABLE', 'Online payment is not available right now. Choose pay on delivery.');

    const { cart, address, seller, policy, promise, drop } = await prepare(customerId, req.body.addressId);
    if (!online && !policy.config.codEnabled) throw new AppError(409, 'COD_DISABLED', 'Pay on delivery is switched off right now');
    // serviceability is run again at checkout (doc 10.8); the client's prices are never used
    if (!promise.serviceable) throw new AppError(409, 'NOT_SERVICEABLE', promise.reasons[0] ?? 'This address is out of range', { reasons: promise.reasons });
    const fresh = new Map((await productModel.listWithStock(dbs.catalog, cart.items.map((i) => i.productId))).map((p) => [p.id, p]));
    for (const i of cart.items) {
      const p = fresh.get(i.productId);
      if (!p?.active || p.seller_id !== seller.id) throw new AppError(409, 'PRODUCT_UNAVAILABLE', `${i.title} is no longer available. Remove it from your cart to continue.`, { productId: i.productId, title: i.title });
    }

    const orderKey = orderKeyFor(customerId, idemKey);
    const held = await stockHoldModel.reserve(dbs.catalog, orderKey, cart.items.map((i) => ({ productId: i.productId, qty: i.qty })), HOLD_MINUTES);
    if (!held.ok) {
      const title = fresh.get(held.productId)?.title ?? 'A snack';
      throw new AppError(409, 'OUT_OF_STOCK', held.available ? `Only ${held.available} ${title} left` : `${title} just sold out`, { productId: held.productId, title, available: held.available });
    }

    const items = cart.items.map((i) => ({ productId: i.productId, title: fresh.get(i.productId).title, unitPricePaise: fresh.get(i.productId).price_paise, qty: i.qty }));
    const subtotal = items.reduce((s, i) => s + i.unitPricePaise * i.qty, 0);
    const fee = policy.config.deliveryFeePaise;
    // app credit applies to pay-on-delivery orders
    const [credit] = online ? [] : await customerCreditModel.listUsable(dbs.ordering, customerId);
    const creditPaise = credit ? Math.min(credit.amount_paise, subtotal) : 0;
    const now = new Date();
    let orderId;
    try {
      orderId = await dbs.ordering.transaction(async (trx) => {
        const id = await orderModel.create(trx, {
          customer_id: customerId,
          seller_id: seller.id,
          // an online order reaches the shop only once its payment is confirmed
          status: online ? 'PENDING_PAYMENT' : 'PLACED',
          temp_class: cart.tempClass,
          subtotal_paise: subtotal,
          delivery_fee_paise: fee,
          credit_paise: creditPaise,
          total_paise: subtotal + fee - creditPaise,
          payment_mode: online ? 'ONLINE' : 'COD',
          // the address as it is now; later edits to the saved address never reach this order
          address_text: addressSummary(address).slice(0, 255),
          address_detail: JSON.stringify(addressDetail(address)),
          drop_lat: drop.lat,
          drop_lng: drop.lng,
          distance_m: Math.round(promise.distanceKm * 1000),
          otp_hash: deliveryCodeHash(env, orderKey, deliveryCode(env, orderKey)),
          idem_key: idemKey,
          order_key: orderKey,
          policy_id: policy.id,
          placed_at: now,
          promised_at: new Date(now.getTime() + promise.window[1] * 60_000),
          promise_lo_min: promise.window[0],
          promise_hi_min: promise.window[1],
        });
        await orderItemModel.createMany(trx, id, items);
        // spent with the order, or not at all (a second checkout racing for it fails here)
        if (credit && !(await customerCreditModel.use(trx, credit.id, id))) throw new AppError(409, 'CREDIT_USED', 'Your credit was just used on another order. Check out again.');
        await trx('order_events').insert({ order_id: id, from_status: null, to_status: online ? 'PENDING_PAYMENT' : 'PLACED', actor_id: customerId, actor_role: 'customer', at: now });
        if (!online) await notifySeller(dbs, trx, { id, seller_id: seller.id }, 'shop.order_new', `New order #${id}: accept it within 2 minutes.`);
        await cartModel.clear(trx, customerId);
        return id;
      });
    } catch (err) {
      // the same checkout sent twice at once: the first one made the order and owns the hold
      if (err.errno === DUPLICATE) {
        const twin = await replay(customerId, idemKey);
        if (twin) return res.json(twin);
      }
      await stockHoldModel.release(dbs.catalog, orderKey);
      throw err;
    }
    await stockHoldModel.commit(dbs.catalog, orderKey);
    const placed = await orderModel.findById(dbs.ordering, orderId);
    // online: the payment page; if it cannot start, the order is cancelled and the stock returned
    if (online) await startOnlinePayment(dbs, env, placed);
    else await recordCod(dbs, placed);
    // the shop's board hears about it at once
    announceOrder(dbs, orderId);
    res.status(201).json({ order: await viewOrder(dbs, await orderModel.findById(dbs.ordering, orderId), 'customer') });
  }

  async function list(req, res) {
    res.json(await viewOrders(dbs, await orderModel.listForCustomer(dbs.ordering, req.user.userId, 30), 'customer'));
  }

  async function show(req, res) {
    res.json(await viewOrder(dbs, await ownOrder(req), 'customer'));
  }

  async function track(req, res) {
    const order = await ownOrder(req);
    const [seller, rider, policy] = await Promise.all([sellerModel.findById(dbs.catalog, order.seller_id), order.rider_id ? riderModel.findById(dbs.dispatch, order.rider_id) : null, policyOf(dbs, order)]);
    res.json({ ...trackState(order, { seller, rider, policy }), order: await viewOrder(dbs, order, 'customer'), simulated: false });
  }

  async function otp(req, res) {
    const code = codeForCustomer(env, await ownOrder(req));
    res.set('Cache-Control', 'no-store').json({ code });
  }

  async function cancel(req, res) {
    const order = await ownOrder(req);
    if (!canTransition(order.status, 'CANCELLED', 'customer')) throw new AppError(409, 'CANNOT_CANCEL', 'Cancelling is free until the order is packed. After that, contact support.');
    const done = await closeOrder(dbs, order, 'CANCELLED', { role: 'customer', actorId: req.user.userId, reason: 'Cancelled by you', customerBody: 'Your order was cancelled. You were not charged.' });
    if (!done) throw new AppError(409, 'ORDER_CHANGED', 'The order moved on while you were cancelling. Check its status.');
    res.json(await viewOrder(dbs, await orderModel.findById(dbs.ordering, order.id), 'customer'));
  }

  async function review(req, res) {
    const order = await ownOrder(req);
    if (order.status !== 'DELIVERED') throw new AppError(409, 'NOT_DELIVERED', 'You can rate an order after it is delivered');
    if (await orderReviewModel.findByOrder(dbs.ordering, order.id)) throw new AppError(409, 'ALREADY_REVIEWED', 'You already rated this order');
    try {
      await orderReviewModel.create(dbs.ordering, { orderId: order.id, customerId: req.user.userId, ...req.body });
    } catch (err) {
      if (err.errno === DUPLICATE) throw new AppError(409, 'ALREADY_REVIEWED', 'You already rated this order');
      throw err;
    }
    res.status(201).json({ ok: true, rating: req.body.rating });
  }

  /** After the pay page sends the customer back: ask the provider, never trust the redirect. */
  async function checkPayment(req, res) {
    const order = await ownOrder(req);
    const p = order.payment_mode === 'ONLINE' ? await paymentModel.findByOrder(dbs.payment, order.id) : null;
    // the page asks every few seconds: PhonePe is asked at most once every 3 seconds per order
    const fresh = p?.checked_at && Date.now() - new Date(p.checked_at).getTime() < 3000;
    if (p && !fresh && ['CREATED', 'EXPIRED', 'FAILED'].includes(p.status)) await settlePayment(dbs, p);
    res.set('Cache-Control', 'no-store').json(await viewOrder(dbs, await orderModel.findById(dbs.ordering, order.id), 'customer'));
  }

  return { quote, place, list, show, track, otp, cancel, review, checkPayment };
}
