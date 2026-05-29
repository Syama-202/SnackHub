// Favourites and "order again" (doc 11.1), for the customer in the token only.
//   GET    /me/favourites                 saved snacks, newest first, each with whether it can be ordered now
//   PUT    /me/favourites/:productId      save one (idempotent)
//   DELETE /me/favourites/:productId      forget one
//   POST   /orders/:id/reorder            the cart refilled from a past order, with what was left out and why
import { AppError } from '../utils/AppError.js';
import { favouriteModel } from '../models/ordering/favourite.js';
import { cartModel } from '../models/ordering/cart.js';
import { orderModel } from '../models/ordering/order.js';
import { orderItemModel } from '../models/ordering/orderItem.js';
import { productModel } from '../models/catalog/product.js';
import { sellerModel, isOpenForOrders, closedReason } from '../models/catalog/seller.js';
import { productView } from './catalog.js';
import { cartView } from './cart.js';

export const MAX_FAVOURITES = 200;

/** Why a product cannot go in the cart now, or null. */
const unavailable = (p, shop) => {
  if (!p || !p.active) return 'No longer on the menu';
  if (!shop || shop.is_demo) return 'This shop takes no orders';
  if (!isOpenForOrders(shop)) return closedReason(shop);
  if (Number(p.qty ?? 0) <= 0) return 'Sold out today';
  return null;
};

export function favouritesController({ dbs }) {
  async function list(req, res) {
    const ids = await favouriteModel.listIds(dbs.ordering, req.user.userId);
    const products = ids.length ? await productModel.listWithStock(dbs.catalog, ids) : [];
    const shops = new Map((await sellerModel.listByIds(dbs.catalog, [...new Set(products.map((p) => p.seller_id))])).map((s) => [s.id, s]));
    const byId = new Map(products.map((p) => [p.id, p]));
    res.json(
      ids
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((p) => {
          const shop = shops.get(p.seller_id);
          return { ...productView(p, shop), shopName: shop?.shop_name ?? null, shopKind: shop?.kind ?? 'shop', unavailable: unavailable(p, shop) };
        }),
    );
  }

  async function add(req, res) {
    const userId = req.user.userId;
    const p = await productModel.findById(dbs.catalog, req.params.productId);
    if (!p) throw new AppError(404, 'NOT_FOUND', 'Snack not found');
    if ((await favouriteModel.count(dbs.ordering, userId)) >= MAX_FAVOURITES) throw new AppError(409, 'TOO_MANY_FAVOURITES', `Keep up to ${MAX_FAVOURITES} favourites; remove one first`);
    await favouriteModel.add(dbs.ordering, userId, p.id);
    res.json({ ids: await favouriteModel.listIds(dbs.ordering, userId) });
  }

  async function remove(req, res) {
    await favouriteModel.remove(dbs.ordering, req.user.userId, req.params.productId);
    res.json({ ids: await favouriteModel.listIds(dbs.ordering, req.user.userId) });
  }

  /**
   * The cart gets the past order's snacks again, from today's menu at today's prices. A snack
   * that is gone, sold out or whose shop is closed is left out and named; if there is less
   * stock than before, the quantity is lowered and said so. The old cart is replaced.
   */
  async function reorder(req, res) {
    const userId = req.user.userId;
    const order = await orderModel.findById(dbs.ordering, req.params.id);
    if (!order || order.customer_id !== userId) throw new AppError(404, 'NOT_FOUND', 'Order not found');
    const items = await orderItemModel.listForOrders(dbs.ordering, [order.id]);
    const shop = await sellerModel.findById(dbs.catalog, order.seller_id);
    const fresh = new Map((await productModel.listWithStock(dbs.catalog, items.map((i) => i.product_id))).map((p) => [p.id, p]));
    const skipped = [];
    const lines = [];
    for (const i of items) {
      const p = fresh.get(i.product_id);
      const why = unavailable(p, shop);
      if (why) {
        skipped.push({ productId: i.product_id, title: i.title, reason: why });
        continue;
      }
      const qty = Math.min(i.qty, Number(p.qty));
      if (qty < i.qty) skipped.push({ productId: p.id, title: p.title, reason: `Only ${qty} left, so ${qty} went in` });
      lines.push({ productId: p.id, qty });
    }
    if (!lines.length) throw new AppError(409, 'NOTHING_TO_REORDER', 'None of these snacks can be ordered right now', { skipped });
    await dbs.ordering.transaction(async (trx) => {
      await cartModel.clear(trx, userId);
      for (const l of lines) await cartModel.setLine(trx, userId, { sellerId: order.seller_id, ...l });
    });
    res.json({ cart: await cartView(dbs, userId), skipped });
  }

  return { list, add, remove, reorder };
}
