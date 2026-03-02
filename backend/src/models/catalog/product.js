// catalog.products: the menu of each shop. attrs is JSON (spice, weight, tags, ...).
const TABLE = 'products';

const parse = (row) => row && { ...row, attrs: typeof row.attrs === 'string' ? JSON.parse(row.attrs) : row.attrs };

export const productModel = {
  findById: (db, id) => db(TABLE).where({ id }).first().then(parse),
  listBySeller: (db, sellerId, { activeOnly = true } = {}) =>
    db(TABLE)
      .where({ seller_id: sellerId })
      .modify((q) => activeOnly && q.where({ active: true }))
      .orderBy('id')
      .then((rows) => rows.map(parse)),
  /** Active products of these shops with the units on hand (qty, 0 when no stock row). */
  listActiveForSellers: (db, sellerIds) =>
    db(TABLE)
      .leftJoin('stock', 'stock.product_id', `${TABLE}.id`)
      .select(`${TABLE}.*`, db.raw('COALESCE(stock.qty, 0) AS qty'))
      .whereIn(`${TABLE}.seller_id`, sellerIds)
      .andWhere(`${TABLE}.active`, true)
      .orderBy(`${TABLE}.id`)
      .then((rows) => rows.map(parse)),
  create: (db, sellerId, p) => db(TABLE).insert({ ...p, seller_id: sellerId, attrs: p.attrs ? JSON.stringify(p.attrs) : null }).then(([id]) => id),
  updateForSeller: (db, id, sellerId, changes) => db(TABLE).where({ id, seller_id: sellerId }).update(changes),
  setActive: (db, id, active) => db(TABLE).where({ id }).update({ active }),
};
