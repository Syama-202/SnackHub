// ordering.orders and their history. A status change goes only through canTransition()
// (doc 10.1) and only from the status the caller saw, so two actors racing on the same
// order cannot both win. Each change is recorded in order_events.
import { canTransition } from '../../../../shared/domain/orderStates.js';
import { AppError } from '../../utils/AppError.js';

const TABLE = 'orders';
const EVENTS = 'order_events';
// states in which an order still needs its rider or is with one
export const WITH_RIDER = ['ACCEPTED', 'PACKING', 'PACKED', 'PICKED_UP', 'ON_THE_WAY', 'ARRIVED'];
export const NEEDS_RIDER = ['ACCEPTED', 'PACKING', 'PACKED'];
// the delivery code hash and the idempotency key never leave this model in a read
const HIDDEN = ['otp_hash', 'idem_key'];
const strip = (row) => row && Object.fromEntries(Object.entries(row).filter(([k]) => !HIDDEN.includes(k)));

export const orderModel = {
  findById: (db, id) => db(TABLE).where({ id }).first().then(strip),
  findForCustomer: (db, id, customerId) => db(TABLE).where({ id, customer_id: customerId }).first().then(strip),
  /** Same customer, same Idempotency-Key: the order made the first time (doc 10.8). */
  findByIdempotencyKey: (db, customerId, idemKey) => db(TABLE).where({ customer_id: customerId, idem_key: idemKey }).first().then(strip),
  /** Newest first; with before ({ placedAt, id } of the last one shown), the page after it. */
  listForCustomer: (db, customerId, limit = 20, before = null) =>
    db(TABLE)
      .where({ customer_id: customerId })
      .modify((q) => before && q.andWhere((w) => w.where('placed_at', '<', before.placedAt).orWhere((x) => x.where('placed_at', before.placedAt).andWhere('id', '<', before.id))))
      .orderBy('placed_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
      .then((rows) => rows.map(strip)),
  listForSeller: (db, sellerId, statuses) => db(TABLE).where({ seller_id: sellerId }).whereIn('status', statuses).orderBy('placed_at').then((rows) => rows.map(strip)),
  /** The seller's board: the latest orders that reached the shop (unpaid ones never do). */
  listRecentForSeller: (db, sellerId, limit = 40) =>
    db(TABLE).where({ seller_id: sellerId }).whereNot('status', 'PENDING_PAYMENT').orderBy('placed_at', 'desc').limit(limit).then((rows) => rows.map(strip)),
  findForSeller: (db, id, sellerId) => db(TABLE).where({ id, seller_id: sellerId }).first().then(strip),
  findForRider: (db, id, riderId) => db(TABLE).where({ id, rider_id: riderId }).first().then(strip),
  listActiveForRider: (db, riderId) => db(TABLE).where({ rider_id: riderId }).whereIn('status', WITH_RIDER).orderBy('placed_at').then((rows) => rows.map(strip)),
  /** Deliveries each rider is on now, and whether any of them is hot (hot food rides alone). */
  loadByRider: async (db, riderIds) => {
    if (!riderIds.length) return new Map();
    const rows = await db(TABLE).whereIn('rider_id', riderIds).whereIn('status', WITH_RIDER).groupBy('rider_id').select('rider_id', db.raw('COUNT(*) AS n'), db.raw("COUNT(*) FILTER (WHERE temp_class = 'HOT') AS hot"));
    return new Map(rows.map((r) => [r.rider_id, { active: Number(r.n), hot: Number(r.hot) > 0 }]));
  },
  listNeedingRider: (db, limit = 50) => db(TABLE).whereNull('rider_id').whereIn('status', NEEDS_RIDER).orderBy('placed_at').limit(limit).then((rows) => rows.map(strip)),
  listPlacedBefore: (db, before, limit = 50) => db(TABLE).where({ status: 'PLACED' }).andWhere('placed_at', '<', before).orderBy('placed_at').limit(limit).then((rows) => rows.map(strip)),
  /** Today's numbers for the seller's board (UTC day). */
  sellerStats: async (db, sellerId) => {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const [today] = await db(TABLE).where({ seller_id: sellerId }).whereNot('status', 'PENDING_PAYMENT').andWhere('placed_at', '>=', since).count({ n: '*' });
    const [done] = await db(TABLE).where({ seller_id: sellerId, status: 'DELIVERED' }).count({ n: '*' }).sum({ sales: 'subtotal_paise' });
    // accepted out of every order that asked the shop to decide, over the last 30 days
    const [rate] = await db(TABLE)
      .where({ seller_id: sellerId })
      .andWhere('placed_at', '>=', new Date(Date.now() - 30 * 86_400_000))
      .whereNot('status', 'PENDING_PAYMENT')
      .select(db.raw('COUNT(*) FILTER (WHERE accepted_at IS NOT NULL) AS accepted'), db.raw("COUNT(*) FILTER (WHERE accepted_at IS NOT NULL OR status IN ('REJECTED','CANCELLED')) AS decided"));
    return {
      ordersToday: Number(today.n),
      delivered: Number(done.n),
      salesPaise: Number(done.sales ?? 0),
      acceptanceRate: Number(rate.decided) ? Number(rate.accepted) / Number(rate.decided) : null,
    };
  },
  otpHash: (db, id) => db(TABLE).where({ id }).first('otp_hash').then((r) => r?.otp_hash ?? null),
  create: (db, order) => db(TABLE).insert(order).returning('id').then(([r]) => r.id),
  /** Fields that are not the status (the delivery-code state, cash collected). */
  update: (db, id, changes) => db(TABLE).where({ id }).update(changes),
  /** The rider who accepted the offer, only while the order still needs one. */
  assignRider: (db, id, riderId) => db(TABLE).where({ id }).whereNull('rider_id').whereIn('status', NEEDS_RIDER).update({ rider_id: riderId }).then((n) => n === 1),
  /** One more wrong delivery code; returns the tries used so far. */
  addOtpAttempt: async (db, id) => {
    await db(TABLE).where({ id }).increment('otp_attempts', 1);
    return (await db(TABLE).where({ id }).first('otp_attempts')).otp_attempts;
  },

  /** Moves an order from `from` to `to` for an actor; returns false if someone else moved it first. */
  transition: async (db, id, { from, to, actorId = null, role, set = {} }) => {
    if (!canTransition(from, to, role)) throw new AppError(409, 'BAD_TRANSITION', `A ${role} cannot move an order from ${from} to ${to}`);
    // the status change and its history row commit together (inside the caller's transaction if given)
    const run = async (trx) => {
      const changed = await trx(TABLE).where({ id, status: from }).update({ ...set, status: to });
      if (changed !== 1) return false;
      await trx(EVENTS).insert({ order_id: id, from_status: from, to_status: to, actor_id: actorId, actor_role: role, at: new Date() });
      return true;
    };
    return db.isTransaction ? run(db) : db.transaction(run);
  },
  events: (db, id) => db(EVENTS).where({ order_id: id }).orderBy(['at', 'id']),
  eventsFor: (db, ids) => (ids.length ? db(EVENTS).whereIn('order_id', ids).orderBy(['at', 'id']) : Promise.resolve([])),
};
