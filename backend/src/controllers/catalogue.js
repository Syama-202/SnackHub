// The shared product catalogue, admin side (shared/domain/catalogue.js):
//   GET   /admin/catalogue                  entries with how many shops sell each and the price spread
//   POST  /admin/catalogue                  add an entry
//   PATCH /admin/catalogue/:id              edit or retire it; the change reaches every shop's copy
//   POST  /admin/catalogue/:id/link         { productId } a shop's own recipe becomes this entry
// Sellers pick from it in the seller console (controllers/shop.js), customers compare shops'
// prices for one entry (controllers/catalog.js).
import { AppError } from '../utils/AppError.js';
import { catalogItemModel } from '../models/catalog/catalogItem.js';
import { productModel } from '../models/catalog/product.js';
import { sellerModel } from '../models/catalog/seller.js';
import { auditLogModel } from '../models/identity/auditLog.js';
import { priceSpread } from '../../../shared/domain/catalogue.js';
import { artFor, slugFor } from '../../../shared/domain/menu.js';
import { isUniqueViolation } from '../db/errors.js';
import { queueSearchSync } from '../utils/searchSync.js';

export function itemView(row, extra = {}) {
  const a = row.attrs || {};
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    category: row.category,
    servingTemp: row.serving_temp,
    weight: a.weight ?? null,
    spice: a.spice ?? 0,
    vegetarian: a.vegetarian ?? true,
    allergens: a.allergens ?? [],
    art: a.art ?? null,
    active: Boolean(row.active),
    ...extra,
  };
}

/** The entry's fields as a menu row's columns; the row keeps its other attrs (ratings, tags). */
export const copyOfItem = (item, prevAttrs = {}) => {
  const a = item.attrs || {};
  return {
    title: item.title,
    category: item.category,
    serving_temp: item.serving_temp,
    attrs: { ...prevAttrs, weight: a.weight, spice: a.spice ?? 0, vegetarian: a.vegetarian ?? true, allergens: a.allergens ?? [], art: a.art, ...(a.tags && !prevAttrs.tags && { tags: a.tags }) },
  };
};

/** Price spread per entry from listed menu rows, one city when given. */
export async function spreadsFor(db, itemIds, opts) {
  const rows = await productModel.pricesForItems(db, itemIds, opts);
  const by = new Map(itemIds.map((id) => [id, []]));
  for (const r of rows) by.get(Number(r.catalog_item_id))?.push(r.price_paise);
  return new Map([...by].map(([id, prices]) => [id, priceSpread(prices)]));
}

const columns = (b) => ({
  ...(b.title !== undefined && { title: b.title }),
  ...(b.description !== undefined && { description: b.description || null }),
  ...(b.category !== undefined && { category: b.category }),
  ...(b.servingTemp !== undefined && { serving_temp: b.servingTemp }),
  ...(b.active !== undefined && { active: b.active }),
});
const attrsOf = (b, prev = {}) => ({
  ...prev,
  ...(b.weight !== undefined && { weight: b.weight || undefined }),
  ...(b.spice !== undefined && { spice: b.spice }),
  ...(b.vegetarian !== undefined && { vegetarian: b.vegetarian }),
  ...(b.allergens !== undefined && { allergens: b.allergens }),
  ...((b.category !== undefined || b.shape !== undefined) && { art: artFor(b.category ?? prev.category, b.shape ?? prev.art?.shape) }),
});

export function catalogueController({ dbs }) {
  const audit = (req, action, target, before, after) => auditLogModel.append(dbs.identity, { actorId: req.user.userId, action, target, before, after });
  const entry = async (id) => {
    const item = await catalogItemModel.findById(dbs.catalog, id);
    if (!item) throw new AppError(404, 'NOT_FOUND', 'No such catalogue entry');
    return item;
  };
  const view = async (item) => itemView(item, { prices: (await spreadsFor(dbs.catalog, [item.id])).get(item.id) });

  async function list(req, res) {
    const items = await catalogItemModel.search(dbs.catalog, { q: req.query.q, activeOnly: !req.query.all, limit: 100 });
    const spreads = await spreadsFor(dbs.catalog, items.map((i) => i.id));
    res.json(items.map((i) => itemView(i, { prices: spreads.get(i.id) })));
  }

  async function create(req, res) {
    const b = req.body;
    const same = await dbs.catalog('catalog_items').whereRaw('LOWER(title) = ?', [b.title.toLowerCase()]).first('id');
    if (same) throw new AppError(409, 'DUPLICATE_ENTRY', `"${b.title}" is already in the catalogue`, { id: same.id });
    const slug = slugFor(b.title, await catalogItemModel.slugs(dbs.catalog));
    const id = await catalogItemModel.create(dbs.catalog, { slug, ...columns(b), attrs: { ...attrsOf(b), art: artFor(b.category, b.shape) } });
    await audit(req, 'catalogue.create', `catalogue:${id}`, null, { title: b.title });
    res.status(201).json(await view(await entry(id)));
  }

  async function update(req, res) {
    const before = await entry(req.params.id);
    const b = req.body;
    const touchesAttrs = ['weight', 'spice', 'vegetarian', 'allergens', 'shape', 'category'].some((k) => b[k] !== undefined);
    const changes = { ...columns(b), ...(touchesAttrs && { attrs: attrsOf({ ...b, category: b.category ?? before.category }, before.attrs) }) };
    // the entry and every shop's copy change together
    const copies = await dbs.catalog.transaction(async (trx) => {
      await catalogItemModel.update(trx, before.id, changes);
      const after = await catalogItemModel.findById(trx, before.id);
      const linked = await productModel.linkedTo(trx, before.id);
      if (['title', 'category', 'servingTemp'].some((k) => b[k] !== undefined) || touchesAttrs) {
        for (const p of linked) {
          const c = copyOfItem(after, p.attrs ?? {});
          await trx('products').where({ id: p.id }).update({ ...c, attrs: JSON.stringify(c.attrs) });
        }
      }
      if (linked.length) await queueSearchSync(trx, { productIds: linked.map((p) => p.id), reason: 'catalogue.update' });
      return linked.length;
    });
    await audit(req, b.active === false ? 'catalogue.retire' : 'catalogue.update', `catalogue:${before.id}`, { title: before.title, active: Boolean(before.active) }, { ...b, copies });
    res.json(await view(await entry(before.id)));
  }

  async function link(req, res) {
    const item = await entry(req.params.id);
    const p = await productModel.findById(dbs.catalog, req.body.productId);
    if (!p) throw new AppError(404, 'NOT_FOUND', 'No such product');
    if (p.catalog_item_id === item.id) return res.json(await view(item));
    if (p.catalog_item_id) throw new AppError(409, 'ALREADY_LINKED', 'That product already belongs to another catalogue entry');
    if (await productModel.findForSellerItem(dbs.catalog, p.seller_id, item.id)) throw new AppError(409, 'ALREADY_ON_MENU', 'That shop already sells this entry');
    const c = copyOfItem(item, p.attrs ?? {});
    // the unique (shop, entry) key settles two links racing for the same shop
    await dbs.catalog
      .transaction(async (trx) => {
        await trx('products').where({ id: p.id, catalog_item_id: null }).update({ ...c, attrs: JSON.stringify(c.attrs), catalog_item_id: item.id });
        await queueSearchSync(trx, { productIds: [p.id], reason: 'catalogue.link' });
      })
      .catch((e) => {
        throw isUniqueViolation(e) ? new AppError(409, 'ALREADY_ON_MENU', 'That shop already sells this entry') : e;
      });
    const shop = await sellerModel.findById(dbs.catalog, p.seller_id);
    await audit(req, 'catalogue.link', `product:${p.id}`, { title: p.title }, { catalogueId: item.id, shop: shop?.shop_name });
    res.json(await view(item));
  }

  return { list, create, update, link };
}
