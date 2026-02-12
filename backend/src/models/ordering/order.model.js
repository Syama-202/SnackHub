// ordering.orders and their history. A status change goes only through canTransition()
// (doc 10.1) and only from the status the caller saw, so two actors racing on the same
// order cannot both win. Each change is recorded in order_events.
import { canTransition } from '../../../../shared/domain/orderStates.js';
import { AppError } from '../../utils/AppError.js';

const TABLE = 'orders';
const EVENTS = 'order_events';
// the delivery code hash and the idempotency key never leave this model in a read
const HIDDEN = ['otp_hash', 'idem_key'];
const strip = (row) => row && Object.fromEntries(Object.entries(row).filter(([k]) => !HIDDEN.includes(k)));

export const orderModel = {
  findById: (db, id) => db(TABLE).where({ id }).first().then(strip),
  findForCustomer: (db, id, customerId) => db(TABLE).where({ id, customer_id: customerId }).first().then(strip),
  /** Same customer, same Idempotency-Key: the order made the first time (doc 10.8). */
  findByIdempotencyKey: (db, customerId, idemKey) => db(TABLE).where({ customer_id: customerId, idem_key: idemKey }).first().then(strip),
  listForCustomer: (db, customerId, limit = 20) => db(TABLE).where({ customer_id: customerId }).orderBy('placed_at', 'desc').limit(limit).then((rows) => rows.map(strip)),
  listForSeller: (db, sellerId, statuses) => db(TABLE).where({ seller_id: sellerId }).whereIn('status', statuses).orderBy('placed_at').then((rows) => rows.map(strip)),
  otpHash: (db, id) => db(TABLE).where({ id }).first('otp_hash').then((r) => r?.otp_hash ?? null),
  create: (db, order) => db(TABLE).insert(order).then(([id]) => id),

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
};
