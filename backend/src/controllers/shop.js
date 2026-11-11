// The seller console (doc 11.2): the order board, the menu and stock, busy mode and pause.
// seller_id always comes from the token's account, never from the body or the URL. Taking
// orders and listing snacks need an approved application with valid documents; hiding a
// snack, pausing the shop and finishing an order already accepted never do.
//   GET   /seller/shop                   the shop, today's numbers
//   PATCH /seller/shop                   { busyExtraMin, paused }
//   GET   /seller/orders                 the board
//   POST  /seller/orders/:id/:action     accept | reject | start | packed
//   GET   /seller/products               the whole menu with stock
//   POST  /seller/products               add a snack (unlisted until published)
//   PATCH /seller/products/:id           edit it, list it ({ active: true }) or hide it
//   PATCH /seller/products/:id/stock     { delta, reason }: an adjustment, never a replacement
//   GET   /seller/catalogue              the shared catalogue, with what shops in the city charge
//   POST  /seller/products/from-catalogue  { catalogItemId, pricePaise, ... } sell an entry at your price
import { hoursOf } from '../models/catalog/seller.js';
import { hoursView } from './catalog.js';
import { AppError } from '../utils/AppError.js';
import { loadApplicant, eligibilityOf } from '../utils/applicants.js';
import { closeOrder, move, policyOf, sellerDelayMin, viewOrder, viewOrders } from '../utils/orders.js';
import { offerNext } from '../utils/dispatch.js';
import { productView } from './catalog.js';
import { productModel } from '../models/catalog/product.js';
import { sellerModel } from '../models/catalog/seller.js';
import { stockModel } from '../models/catalog/stock.js';
import { stockAdjustmentModel } from '../models/catalog/stockAdjustment.js';
import { orderModel } from '../models/ordering/order.js';
import { auditLogModel } from '../models/identity/auditLog.js';
import { artFor, slugFor, MAX_STOCK } from '../../../shared/domain/menu.js';
import { ownedFieldsIn } from '../../../shared/domain/catalogue.js';
import { catalogItemModel } from '../models/catalog/catalogItem.js';
import { copyOfItem, itemView, spreadsFor } from './catalogue.js';
import { isUniqueViolation } from '../db/errors.js';

const refuse = (verdict) => new AppError(403, 'NOT_ELIGIBLE', verdict.reasons[0]?.message ?? 'Not allowed yet', { reasons: verdict.reasons });
const ACTIONS = { accept: 'ACCEPTED', reject: 'REJECTED', start: 'PACKING', packed: 'PACKED' };

export function shopController({ dbs }) {
  async function ownShop(userId) {
    const shop = await sellerModel.findByUser(dbs.catalog, userId);
    if (!shop) throw new AppError(404, 'NO_SHOP', 'Submit your seller application first');
    return shop;
  }
  const mustBeEligible = async (userId) => {
    const verdict = eligibilityOf('seller', await loadApplicant(dbs, 'seller', userId));
    if (!verdict.ok) throw refuse(verdict);
  };
  const audit = (userId, action, target, before, after) => auditLogModel.append(dbs.identity, { actorId: userId, action, target, before, after });

  // ---------- the shop
  async function shopView(shop) {
    const stats = await orderModel.sellerStats(dbs.ordering, shop.id);
    return {
      id: shop.id,
      shopName: shop.shop_name,
      kind: shop.kind ?? 'shop',
      city: shop.city,
      region: shop.region,
      status: shop.status,
      verified: Boolean(shop.verified_at),
      paused: Boolean(shop.paused),
      busyExtraMin: shop.busy_extra_min,
      openHours: shop.open_hours,
      weeklyHours: hoursOf(shop).weeklyHours,
      closedDates: hoursOf(shop).closedDates,
      pincodes: hoursOf(shop).pincodes,
      hours: hoursView(shop),
      radiusKm: Number(shop.radius_km),
      licenceNo: shop.licence_no,
      licenceExpiresOn: shop.licence_expires_on ? new Date(shop.licence_expires_on).toISOString().slice(0, 10) : null,
      qualityScore: shop.quality_score == null ? null : Number(shop.quality_score),
      acceptanceRate: stats.acceptanceRate,
      stats: { ordersToday: stats.ordersToday, delivered: stats.delivered, salesPaise: stats.salesPaise },
    };
  }

  async function shop(req, res) {
    res.json(await shopView(await ownShop(req.user.userId)));
  }

  async function updateShop(req, res) {
    const userId = req.user.userId;
    const before = await ownShop(userId);
    if ('busyExtraMin' in req.body) await sellerModel.setBusyExtra(dbs.catalog, before.id, req.body.busyExtraMin);
    if ('paused' in req.body) await sellerModel.setPaused(dbs.catalog, before.id, req.body.paused);
    await sellerModel.setHoursAndArea(dbs.catalog, before.id, req.body);
    const was = hoursOf(before);
    await audit(userId, 'shop.settings', `seller:${before.id}`, { busyExtraMin: before.busy_extra_min, paused: Boolean(before.paused), weeklyHours: was.weeklyHours, closedDates: was.closedDates, pincodes: was.pincodes }, req.body);
    res.json(await shopView(await sellerModel.findById(dbs.catalog, before.id)));
  }

  // ---------- orders
  async function orders(req, res) {
    const s = await ownShop(req.user.userId);
    res.json(await viewOrders(dbs, await orderModel.listRecentForSeller(dbs.ordering, s.id), 'seller'));
  }

  async function orderAction(req, res) {
    const userId = req.user.userId;
    const s = await ownShop(userId);
    const order = await orderModel.findForSeller(dbs.ordering, req.params.id, s.id);
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found');
    const to = ACTIONS[req.params.action];
    // accepting is a business action; finishing what was accepted is always allowed
    if (to === 'ACCEPTED') await mustBeEligible(userId);
    let done;
    if (to === 'REJECTED') {
      done = await closeOrder(dbs, order, 'REJECTED', { role: 'seller', actorId: userId, reason: 'The shop could not take the order', customerBody: 'The shop could not take your order. You were not charged.' });
    } else if (to === 'ACCEPTED') {
      done = await move(dbs, order, to, { role: 'seller', actorId: userId, set: { accepted_at: new Date() }, notify: [{ userId: order.customer_id, type: 'order.accepted', body: 'The shop accepted your order' }] });
    } else if (to === 'PACKED') {
      const packedAt = new Date();
      done = await move(dbs, order, to, { role: 'seller', actorId: userId, set: { packed_at: packedAt, seller_delay_min: sellerDelayMin(order, await policyOf(dbs, order), packedAt) }, notify: [{ userId: order.customer_id, type: 'order.packed', body: 'Your snacks are packed' }] });
    } else {
      done = await move(dbs, order, to, { role: 'seller', actorId: userId });
    }
    if (!done) throw new AppError(409, 'ORDER_CHANGED', 'This order changed a moment ago. The board has its latest status.');
    const now = await orderModel.findById(dbs.ordering, order.id);
    // from acceptance on, the order looks for a rider (and keeps looking on the timer)
    if (['ACCEPTED', 'PACKED'].includes(to)) await offerNext(dbs, now);
    res.json(await viewOrder(dbs, now, 'seller'));
  }

  // ---------- menu and stock
  async function menuView(shop, rows) {
    const last = await stockAdjustmentModel.latestFor(dbs.catalog, rows.map((r) => r.id));
    return rows.map((r) => ({ ...productView(r, shop), lastAdjust: last.get(r.id) ?? null }));
  }
  const productOf = async (shop, id) => {
    const p = await productModel.findWithStock(dbs.catalog, id);
    // the product id is only accepted together with the caller's own shop id
    if (!p || p.seller_id !== shop.id) throw new AppError(404, 'NOT_FOUND', 'No such product in your shop');
    return p;
  };

  async function products(req, res) {
    const s = await ownShop(req.user.userId);
    res.json(await menuView(s, await productModel.listBySellerWithStock(dbs.catalog, s.id)));
  }

  const columns = (b, attrs) => ({
    ...(b.title !== undefined && { title: b.title }),
    ...(b.description !== undefined && { description: b.description || null }),
    ...(b.category !== undefined && { category: b.category }),
    ...(b.servingTemp !== undefined && { serving_temp: b.servingTemp }),
    ...(b.prepMinutes !== undefined && { prep_minutes: b.prepMinutes }),
    ...(b.pricePaise !== undefined && { price_paise: b.pricePaise }),
    ...(b.mrpPaise !== undefined && { mrp_paise: b.mrpPaise }),
    ...(attrs && { attrs }),
  });
  const attrsOf = (b, prev = {}) => {
    const next = { ...prev };
    if (b.weight !== undefined) next.weight = b.weight || undefined;
    if (b.spice !== undefined) next.spice = b.spice;
    if (b.vegetarian !== undefined) next.vegetarian = b.vegetarian;
    if (b.allergens !== undefined) next.allergens = b.allergens;
    if (b.category !== undefined || b.shape !== undefined) next.art = artFor(b.category ?? prev.category, b.shape ?? prev.art?.shape);
    return next;
  };

  async function createProduct(req, res) {
    const userId = req.user.userId;
    const s = await ownShop(userId);
    const b = req.body;
    const slug = slugFor(b.title, await productModel.slugsForSeller(dbs.catalog, s.id));
    const id = await dbs.catalog.transaction(async (trx) => {
      const pid = await productModel.create(trx, s.id, { slug, region: s.region, active: false, ...columns(b), attrs: { ...attrsOf(b), art: artFor(b.category, b.shape) } });
      await stockModel.set(trx, pid, 0);
      return pid;
    });
    await audit(userId, 'product.create', `product:${id}`, null, { title: b.title, pricePaise: b.pricePaise });
    res.status(201).json((await menuView(s, [await productModel.findWithStock(dbs.catalog, id)]))[0]);
  }

  async function updateProduct(req, res) {
    const userId = req.user.userId;
    const s = await ownShop(userId);
    const p = await productOf(s, req.params.id);
    const b = req.body;
    // a catalogue snack's name and details are the catalogue's; the shop sets price, prep and words
    const owned = p.catalog_item_id ? ownedFieldsIn(b) : [];
    if (owned.length) throw new AppError(422, 'CATALOGUE_OWNED', 'The name and details of a catalogue snack come from the SnackHub catalogue. Change the price, prep time, MRP or description instead.', { fields: owned });
    if (b.active === true && !p.active) await mustBeEligible(userId);
    const mrp = b.mrpPaise !== undefined ? b.mrpPaise : p.mrp_paise;
    const price = b.pricePaise ?? p.price_paise;
    if (mrp != null && mrp < price) throw new AppError(422, 'MRP_BELOW_PRICE', 'The MRP cannot be below the price');
    const touchesAttrs = ['weight', 'spice', 'vegetarian', 'allergens', 'shape', 'category'].some((k) => b[k] !== undefined);
    const changes = { ...columns(b, touchesAttrs ? attrsOf({ ...b, category: b.category ?? p.category }, p.attrs ?? {}) : null), ...(b.active !== undefined && { active: b.active }) };
    await productModel.updateForSeller(dbs.catalog, p.id, s.id, changes);
    if (b.active !== undefined && b.active !== Boolean(p.active)) await audit(userId, b.active ? 'product.publish' : 'product.unpublish', `product:${p.id}`);
    else await audit(userId, 'product.update', `product:${p.id}`, null, Object.keys(b));
    res.json((await menuView(s, [await productModel.findWithStock(dbs.catalog, p.id)]))[0]);
  }

  // ---------- the shared catalogue
  async function catalogue(req, res) {
    const s = await ownShop(req.user.userId);
    const items = await catalogItemModel.search(dbs.catalog, { q: req.query.q });
    const spreads = await spreadsFor(dbs.catalog, items.map((i) => i.id), { city: s.city });
    const mine = new Map((await productModel.listBySeller(dbs.catalog, s.id, { activeOnly: false })).filter((p) => p.catalog_item_id).map((p) => [Number(p.catalog_item_id), p.id]));
    res.json(items.map((i) => itemView(i, { pricesInCity: spreads.get(i.id), onMenu: mine.get(i.id) ?? null })));
  }

  async function addFromCatalogue(req, res) {
    const userId = req.user.userId;
    const s = await ownShop(userId);
    const b = req.body;
    const item = await catalogItemModel.findById(dbs.catalog, b.catalogItemId);
    if (!item || !item.active) throw new AppError(404, 'NOT_FOUND', 'That snack is not in the catalogue');
    if (await productModel.findForSellerItem(dbs.catalog, s.id, item.id)) throw new AppError(409, 'ALREADY_ON_MENU', `${item.title} is already on your menu`);
    // the catalogue's slug (and so its picture) when the shop has no snack by that slug yet
    const taken = await productModel.slugsForSeller(dbs.catalog, s.id);
    const slug = taken.includes(item.slug) ? slugFor(item.title, taken) : item.slug;
    const c = copyOfItem(item);
    const id = await dbs.catalog
      .transaction(async (trx) => {
        const pid = await productModel.create(trx, s.id, {
          ...c,
          catalog_item_id: item.id,
          slug,
          region: s.region,
          active: false,
          description: b.description || item.description,
          prep_minutes: b.prepMinutes,
          price_paise: b.pricePaise,
          mrp_paise: b.mrpPaise ?? null,
        });
        await stockModel.set(trx, pid, 0);
        return pid;
      })
      // the unique (shop, entry) key settles two adds racing
      .catch((e) => {
        throw isUniqueViolation(e) ? new AppError(409, 'ALREADY_ON_MENU', `${item.title} is already on your menu`) : e;
      });
    await audit(userId, 'product.create', `product:${id}`, null, { catalogueId: item.id, title: item.title, pricePaise: b.pricePaise });
    res.status(201).json((await menuView(s, [await productModel.findWithStock(dbs.catalog, id)]))[0]);
  }

  async function adjustStock(req, res) {
    const userId = req.user.userId;
    const s = await ownShop(userId);
    const p = await productOf(s, req.params.id);
    const { delta, reason } = req.body;
    const ok = await dbs.catalog.transaction(async (trx) => {
      if (!(await stockModel.adjust(trx, p.id, delta, MAX_STOCK))) return false;
      await stockAdjustmentModel.add(trx, { productId: p.id, delta, reason, actorId: userId });
      return true;
    });
    if (!ok) throw new AppError(422, delta < 0 ? 'NEGATIVE_STOCK' : 'STOCK_LIMIT', delta < 0 ? 'Stock cannot go below zero' : `Keep at most ${MAX_STOCK} in stock`);
    res.json((await menuView(s, [await productModel.findWithStock(dbs.catalog, p.id)]))[0]);
  }

  return { shop, updateShop, orders, orderAction, products, createProduct, updateProduct, adjustStock, catalogue, addFromCatalogue };
}
