// notify.notifications: the in-app inbox (doc 10.6, 12.1b). One row per order, type and
// person, so a re-delivered event adds nothing. Never put the delivery code in a body.
const TABLE = 'notifications';

// One account can hold several roles, so each portal shows its own messages: shop.* for the
// seller console, delivery.* for the rider app and everything else for the customer.
const PREFIX = { seller: 'shop.', rider: 'delivery.' };
const forPortal = (portal) => (q) => {
  if (PREFIX[portal]) q.where('type', 'like', `${PREFIX[portal]}%`);
  else if (portal) q.whereNot('type', 'like', 'shop.%').whereNot('type', 'like', 'delivery.%');
};

/** The portal whose inbox shows a message of this type. */
export const portalOfType = (type) => Object.keys(PREFIX).find((p) => type.startsWith(PREFIX[p])) ?? 'customer';

export const notificationModel = {
  /** Returns false when this notification was already sent. */
  create: (db, { userId, orderId = null, type, body }) =>
    db.raw(`INSERT IGNORE INTO ${TABLE} (user_id, order_id, type, body, created_at) VALUES (?, ?, ?, ?, ?)`, [userId, orderId, type, body, new Date()]).then(([r]) => r.affectedRows === 1),
  listForUser: (db, userId, limit = 50, portal = null) => db(TABLE).where({ user_id: userId }).modify(forPortal(portal)).orderBy('created_at', 'desc').limit(limit),
  unreadCount: (db, userId) => db(TABLE).where({ user_id: userId }).whereNull('read_at').count({ n: '*' }).first().then((r) => Number(r.n)),
  markAllRead: (db, userId, portal = null) => db(TABLE).where({ user_id: userId }).modify(forPortal(portal)).whereNull('read_at').update({ read_at: new Date() }),
  markRead: (db, id, userId) => db(TABLE).where({ id, user_id: userId }).whereNull('read_at').update({ read_at: new Date() }),
  purgeOlderThan: (db, days = 30, batch = 5000) => db.raw(`DELETE FROM ${TABLE} WHERE created_at < NOW() - INTERVAL ? DAY LIMIT ?`, [days, batch]).then(([r]) => r.affectedRows),
};
