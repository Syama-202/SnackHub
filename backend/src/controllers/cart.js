// The customer's cart (doc 11.1): one shop per cart, prices and stock read from the catalogue
// every time, nothing reserved until checkout. customer_id comes from the token.
//   GET    /cart   the cart with today's prices
//   PUT    /cart   set one line { productId, qty, replace }; qty 0 removes it
//   DELETE /cart   empty it
import { AppError } from '../utils/AppError.js';
import { currentPolicy } from '../utils/orders.js';
import { cartModel } from '../models/ordering/cart.js';
import { productModel } from '../models/catalog/product.js';
import { sellerModel, isOpenForOrders } from '../models/catalog/seller.js';
import { assertOrderable } from '../utils/availability.js';
import { productView, sellerView } from './catalog.js';
import { cartTempClass } from '../../../shared/domain/promise.js';

/** The cart as the page shows it; lines whose snack left the menu are dropped. */
export async function cartView(dbs, customerId) {
  const cart = await cartModel.get(dbs.ordering, customerId);
  const [products, seller, { config: policy }] = await Promise.all([
    productModel.listWithStock(dbs.catalog, cart.items.map((i) => i.productId)),
    cart.sellerId ? sellerModel.findById(dbs.catalog, cart.sellerId) : null,
    currentPolicy(dbs),
  ]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const items = cart.items
    .map((i) => {
      const p = byId.get(i.productId);
      if (!p || !p.active || p.seller_id !== cart.sellerId) return null;
      const v = productView(p, seller);
      // a line can stop being orderable while it waits (its serving time ends, it sells out)
      return { productId: p.id, slug: v.slug, qty: i.qty, title: v.title, pricePaise: v.pricePaise, servingTemp: v.servingTemp, stock: v.stock, art: v.art, weight: v.weight, availability: v.availability };
    })
    .filter(Boolean);
  return {
    sellerId: items.length ? cart.sellerId : null,
    seller: items.length && seller ? sellerView(seller) : null,
    items,
    subtotalPaise: items.reduce((s, i) => s + i.pricePaise * i.qty, 0),
    deliveryFeePaise: items.length ? policy.deliveryFeePaise : 0,
    tempClass: items.length ? cartTempClass(items) : null,
    shopOpen: items.length ? isOpenForOrders(seller) : true,
    // lines that cannot be ordered right now: checkout refuses until they are removed or come back
    blocked: items.filter((i) => !i.availability.orderable).map((i) => ({ productId: i.productId, title: i.title, status: i.availability.status, label: i.availability.label, nextAt: i.availability.nextAt })),
  };
}

export function cartController({ dbs }) {
  async function show(req, res) {
    res.json(await cartView(dbs, req.user.userId));
  }

  async function setLine(req, res) {
    const customerId = req.user.userId;
    const { productId, qty, replace } = req.body;
    const product = await productModel.findWithStock(dbs.catalog, productId);
    if (!product || !product.active) throw new AppError(404, 'NOT_FOUND', 'This snack is not on the menu any more');
    const seller = await sellerModel.findById(dbs.catalog, product.seller_id);
    // the same rule as the listings and checkout; stock is reserved only at checkout
    if (qty > 0) assertOrderable(product, seller, { qty: 0 });
    const cart = await cartModel.get(dbs.ordering, customerId);
    if (qty > 0 && cart.sellerId && cart.sellerId !== product.seller_id && cart.items.length && !replace) {
      const other = await sellerModel.findById(dbs.catalog, cart.sellerId);
      throw new AppError(409, 'CART_OTHER_SELLER', `Your cart has snacks from ${other?.shop_name ?? 'another shop'}. One order comes from one shop.`, { currentSellerId: cart.sellerId });
    }
    // removing a line from another shop's cart changes nothing
    if (qty > 0 || cart.sellerId === product.seller_id) await cartModel.setLine(dbs.ordering, customerId, { sellerId: product.seller_id, productId, qty });
    res.json(await cartView(dbs, customerId));
  }

  async function clear(req, res) {
    await cartModel.clear(dbs.ordering, req.user.userId);
    res.json(await cartView(dbs, req.user.userId));
  }

  return { show, setLine, clear };
}
