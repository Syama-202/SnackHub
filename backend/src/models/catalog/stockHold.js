// catalog.stock_holds: stock held for one checkout (doc 10.8). The hold and the stock
// decrement happen in one transaction, items in product id order so two checkouts never
// deadlock. A retry of the same checkout finds its hold already there.
import { stockModel } from './stock.js';

const TABLE = 'stock_holds';

class OutOfStock extends Error {
  constructor(result) {
    super('OUT_OF_STOCK');
    this.result = result;
  }
}

export const stockHoldModel = {
  /** Returns { ok: true }, or { ok: false, productId, available } for the first item short of stock. */
  reserve: async (db, orderKey, items, holdMinutes) => {
    try {
      await db.transaction(async (trx) => {
        const expires = new Date(Date.now() + holdMinutes * 60_000);
        for (const { productId, qty } of [...items].sort((a, b) => a.productId - b.productId)) {
          const [res] = await trx.raw(`INSERT IGNORE INTO ${TABLE} (order_key, product_id, qty, expires_at) VALUES (?, ?, ?, ?)`, [orderKey, productId, qty, expires]);
          if (res.affectedRows === 0) continue; // already held by an earlier try of this checkout
          if (!(await stockModel.take(trx, productId, qty))) throw new OutOfStock({ ok: false, productId, available: await stockModel.getQty(trx, productId) });
        }
      });
      return { ok: true };
    } catch (err) {
      if (err instanceof OutOfStock) return err.result;
      throw err;
    }
  },
  commit: (db, orderKey) => db(TABLE).where({ order_key: orderKey, status: 'HELD' }).update({ status: 'COMMITTED' }),
  /** Puts held units back (cancel, reject or expiry) and marks the hold released. */
  release: (db, orderKey) =>
    db.transaction(async (trx) => {
      const held = await trx(TABLE).where({ order_key: orderKey, status: 'HELD' }).forUpdate();
      for (const h of held) await stockModel.putBack(trx, h.product_id, h.qty);
      await trx(TABLE).where({ order_key: orderKey, status: 'HELD' }).update({ status: 'RELEASED' });
      return held.length;
    }),
  /**
   * A placed order that will not be delivered (cancelled or rejected before pickup): its
   * units go back on the shelf whether the hold was still held or already committed.
   */
  returnToShelf: (db, orderKey) => {
    const run = async (trx) => {
      const rows = await trx(TABLE).where({ order_key: orderKey }).whereIn('status', ['HELD', 'COMMITTED']).forUpdate();
      for (const h of rows) await stockModel.putBack(trx, h.product_id, h.qty);
      await trx(TABLE).where({ order_key: orderKey }).whereIn('status', ['HELD', 'COMMITTED']).update({ status: 'RELEASED' });
      return rows.length;
    };
    return db.isTransaction ? run(db) : db.transaction(run);
  },
  listExpiredKeys: (db, limit = 100) => db(TABLE).distinct('order_key').where({ status: 'HELD' }).andWhere('expires_at', '<', db.fn.now(3)).limit(limit).pluck('order_key'),
};
