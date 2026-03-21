// ordering.carts and cart_items: the server cart (doc 11.1). One cart per customer and one
// shop per cart; a cart never holds stock, which is only reserved at checkout.
const CARTS = 'carts';
const ITEMS = 'cart_items';

export const cartModel = {
  /** { sellerId, items: [{ productId, qty }] }, or an empty cart. */
  get: async (db, customerId) => {
    const cart = await db(CARTS).where({ customer_id: customerId }).first();
    if (!cart) return { sellerId: null, items: [] };
    const items = await db(ITEMS).where({ customer_id: customerId }).orderBy('added_at').orderBy('product_id');
    return { sellerId: cart.seller_id, items: items.map((i) => ({ productId: i.product_id, qty: i.qty })) };
  },
  /** Sets one line (qty 0 removes it); switching shops empties the cart first. Runs in one transaction. */
  setLine: (db, customerId, { sellerId, productId, qty }) => {
    const run = async (trx) => {
      const now = new Date();
      const cart = await trx(CARTS).where({ customer_id: customerId }).forUpdate().first();
      if (cart && cart.seller_id !== sellerId) await trx(ITEMS).where({ customer_id: customerId }).delete();
      if (cart) await trx(CARTS).where({ customer_id: customerId }).update({ seller_id: sellerId, updated_at: now });
      else await trx(CARTS).insert({ customer_id: customerId, seller_id: sellerId, updated_at: now });
      if (qty > 0) await trx.raw(`INSERT INTO ${ITEMS} (customer_id, product_id, qty, added_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE qty = VALUES(qty)`, [customerId, productId, qty, now]);
      else await trx(ITEMS).where({ customer_id: customerId, product_id: productId }).delete();
      const [{ n }] = await trx(ITEMS).where({ customer_id: customerId }).count({ n: '*' });
      if (Number(n) === 0) await trx(CARTS).where({ customer_id: customerId }).delete();
    };
    return db.isTransaction ? run(db) : db.transaction(run);
  },
  clear: (db, customerId) => db(CARTS).where({ customer_id: customerId }).delete(),
};
