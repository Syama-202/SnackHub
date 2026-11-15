// Keeping the search index in step with PostgreSQL (doc 12.3). A change to a snack or a shop
// writes a 'search.sync' row to the catalog outbox in the same transaction (queueSearchSync);
// the outbox relay hands it to syncSearch, which reads the rows as they are now and indexes or
// removes them. A failed sync is retried by the relay (1, 2, 4 ... minutes); a full reindex
// (npm run search:reindex) rebuilds everything from scratch, for a mapping change or after an
// outage. Stock is not indexed: it is always read from PostgreSQL when results are shown.
import { outboxModel } from '../models/outbox.js';
import { productDoc } from './elastic.js';
import { isListed } from '../models/catalog/seller.js';
import { slotOf } from './availability.js';

/** Queue an index update for some products and/or every product of one shop. */
export const queueSearchSync = (trx, { productIds = [], sellerId = null, reason = 'change' }) =>
  outboxModel.add(trx, 'search.sync', { productIds: productIds.map(Number), sellerId: sellerId == null ? null : Number(sellerId), reason });

const parse = (p) => ({ ...p, attrs: typeof p.attrs === 'string' ? JSON.parse(p.attrs) : (p.attrs ?? {}) });

/** The documents to index and the ids to remove for these products (all of them: null). */
export async function searchDocs(db, { productIds = null, sellerId = null } = {}) {
  const q = db('products').select('*');
  if (productIds?.length && sellerId) q.where((w) => w.whereIn('id', productIds).orWhere('seller_id', sellerId));
  else if (productIds?.length) q.whereIn('id', productIds);
  else if (sellerId) q.where({ seller_id: sellerId });
  const products = (await q).map(parse);
  const shops = new Map((await db('sellers').whereIn('id', [...new Set(products.map((p) => p.seller_id))])).map((s) => [s.id, s]));
  const docs = [];
  const deleteIds = [];
  for (const p of products) {
    const shop = shops.get(p.seller_id);
    // off the menu or the shop is not listed: not searchable at all
    if (!shop || !p.active || !isListed(shop)) deleteIds.push(Number(p.id));
    else docs.push(productDoc(p, shop, { listed: true, slot: slotOf(p) }));
  }
  // products asked for by id that no longer exist
  for (const id of productIds ?? []) if (!products.some((p) => Number(p.id) === Number(id))) deleteIds.push(Number(id));
  return { docs, deleteIds };
}

/** Applies one outbox 'search.sync' row; throws (so the relay retries) when indexing fails. */
export async function syncSearch({ dbs, elastic }, payload) {
  if (!elastic?.enabled) return; // the live site on PostgreSQL search: nothing to keep in step
  const { docs, deleteIds } = await searchDocs(dbs.catalog, payload);
  const failed = await elastic.bulk({ docs, deleteIds });
  if (failed.length) throw new Error(`${failed.length} search documents not indexed`);
}
