// catalog.stock_adjustments: every stock change a seller makes, with its reason (doc 10.8).
const TABLE = 'stock_adjustments';

export const stockAdjustmentModel = {
  add: (db, { productId, delta, reason, actorId }) => db(TABLE).insert({ product_id: productId, delta, reason, actor_id: actorId, at: new Date() }),
  /** The latest adjustment of each of these products. */
  latestFor: async (db, productIds) => {
    if (!productIds.length) return new Map();
    const rows = await db(TABLE)
      .whereIn('id', db(TABLE).max('id').whereIn('product_id', productIds).groupBy('product_id'))
      .select('product_id', 'delta', 'reason', 'at');
    return new Map(rows.map((r) => [r.product_id, { delta: r.delta, reason: r.reason, at: new Date(r.at).getTime() }]));
  },
};
