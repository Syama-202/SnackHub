// catalog.stock: units on hand. qty can never go below zero (CHECK in the table).
const TABLE = 'stock';

export const stockModel = {
  getQty: (db, productId) => db(TABLE).where({ product_id: productId }).first('qty').then((r) => r?.qty ?? 0),
  /**
   * Take units only if enough are left (doc 12.1, query 1). The row lock makes a second
   * buyer wait and re-check, so for the last units exactly one buyer wins. Returns false
   * when out of stock.
   */
  take: (db, productId, qty) =>
    db.raw(`UPDATE ${TABLE} SET qty = qty - ? WHERE product_id = ? AND qty >= ?`, [qty, productId, qty]).then(([r]) => r.affectedRows === 1),
  putBack: (db, productId, qty) => db(TABLE).where({ product_id: productId }).increment('qty', qty),
  /**
   * A seller's adjustment applied to the live count (doc 10.8): plus or minus, never a
   * replacement, so an order taking stock at the same moment is not overwritten. False when
   * it would go below zero or above the cap.
   */
  adjust: async (db, productId, delta, max) => {
    await db.raw(`INSERT IGNORE INTO ${TABLE} (product_id, qty) VALUES (?, 0)`, [productId]);
    const [r] = await db.raw(`UPDATE ${TABLE} SET qty = qty + ? WHERE product_id = ? AND qty + ? BETWEEN 0 AND ?`, [delta, productId, delta, max]);
    return r.affectedRows === 1;
  },
  set: (db, productId, qty) => db(TABLE).insert({ product_id: productId, qty }).onConflict('product_id').merge(),
};
