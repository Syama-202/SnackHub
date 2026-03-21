// ordering.order_items: what was bought, with the title and price at the time of the order.
const TABLE = 'order_items';

export const orderItemModel = {
  listByOrder: (db, orderId) => db(TABLE).where({ order_id: orderId }).orderBy('product_id'),
  listForOrders: (db, orderIds) => (orderIds.length ? db(TABLE).whereIn('order_id', orderIds).orderBy('product_id') : Promise.resolve([])),
  createMany: (db, orderId, items) =>
    db(TABLE).insert(items.map((i) => ({ order_id: orderId, product_id: i.productId, title: i.title, unit_price_paise: i.unitPricePaise, qty: i.qty }))),
};
