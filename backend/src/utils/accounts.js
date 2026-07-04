// Your data (DPDP Act): a copy of everything SnackHub holds about a customer, and erasing the
// account. Each module's rows are read and changed through that module's own pool.
//
// Erasing keeps orders, payments, refunds, complaints and the audit log (needed by law and to
// settle disputes) but removes what identifies the person: name, email, mobile, Google link,
// password, two-step sign-in, saved addresses, sessions, cart, favourites, notifications and
// push devices. The user row stays as a suspended, nameless shell so old orders still point at
// something.
import { userModel } from '../models/identity/user.js';
import { userRoleModel } from '../models/identity/userRole.js';
import { auditLogModel } from '../models/identity/auditLog.js';
import { queueEmail } from './notify.js';
import { BLOCKING_ORDER_STATES, erasedEmail } from '../../../shared/domain/accounts.js';

const ORDER_FIELDS = ['id', 'seller_id', 'status', 'total_paise', 'payment_mode', 'address_text', 'note', 'placed_at', 'delivered_at'];
const ADDRESS_FIELDS = ['kind', 'label', 'line', 'house', 'floor', 'landmark', 'instructions', 'pincode', 'city', 'lat', 'lng', 'is_default', 'created_at'];

export const activeRoles = async (db, userId) => (await userRoleModel.listForUser(db, userId)).filter((r) => r.status === 'active').map((r) => r.role);

export const openOrderCount = (dbs, userId) =>
  dbs.ordering('orders').where({ customer_id: userId }).whereIn('status', BLOCKING_ORDER_STATES).count('* as n').first().then((r) => Number(r.n));

/** Everything held about one account, as plain JSON. */
export async function exportAccount(dbs, userId) {
  const user = await userModel.findById(dbs.identity, userId);
  const [roles, addresses, orders, favourites, notifications] = await Promise.all([
    userRoleModel.listForUser(dbs.identity, userId),
    dbs.identity('addresses').where({ user_id: userId }).select(ADDRESS_FIELDS).orderBy('id'),
    dbs.ordering('orders').where({ customer_id: userId }).select(ORDER_FIELDS).orderBy('placed_at', 'desc'),
    dbs.ordering('favourites').where({ customer_id: userId }).select('product_id', 'created_at').orderBy('created_at', 'desc'),
    dbs.notify('notifications').where({ user_id: userId }).select('type', 'body', 'created_at', 'read_at').orderBy('created_at', 'desc'),
  ]);
  const items = orders.length ? await dbs.ordering('order_items').whereIn('order_id', orders.map((o) => o.id)).select('order_id', 'title', 'unit_price_paise', 'qty') : [];
  return {
    exportedAt: new Date().toISOString(),
    note: 'Money is in paise (100 paise = 1 rupee). Order and payment records are kept as the law requires.',
    account: {
      name: user.name,
      email: user.email,
      emailVerified: Boolean(user.email_verified_at),
      mobile: user.mobile,
      mobileVerified: Boolean(user.mobile_verified_at),
      createdAt: user.created_at,
      roles: roles.map((r) => ({ role: r.role, status: r.status })),
    },
    addresses,
    orders: orders.map((o) => ({ ...o, items: items.filter((i) => Number(i.order_id) === Number(o.id)).map(({ order_id: _, ...i }) => i) })),
    favourites,
    notifications,
  };
}

/**
 * Erases a customer account. The caller has already checked the confirmation and that
 * nothing blocks it (shared/domain/accounts.js). Identity goes first, in one transaction, so
 * the person can no longer sign in even if a later step fails; the rest only removes rows.
 */
export async function eraseCustomerAccount({ env, dbs }, user) {
  const id = user.id;
  await dbs.identity.transaction(async (trx) => {
    // the goodbye email is queued with the address before it is erased
    await queueEmail(env, trx, { template: 'account_deleted', to: user.email, data: { name: user.name } });
    for (const table of ['credentials', 'account_tokens', 'mfa_totp', 'mfa_setups', 'mfa_challenges', 'recovery_codes', 'addresses', 'refresh_tokens']) {
      await trx(table).where({ user_id: id }).del();
    }
    await trx('users').where({ id }).update({
      email: erasedEmail(id),
      name: 'Deleted account',
      mobile: null,
      mobile_verified_at: null,
      google_sub: null,
      email_verified_at: null,
      status: 'suspended',
      status_reason: 'Deleted by the account holder',
    });
    await trx('user_roles').where({ user_id: id }).update({ status: 'suspended', status_reason: 'Account deleted' });
    await auditLogModel.append(trx, { actorId: id, action: 'account.deleted', target: `user:${id}` });
  });
  await dbs.ordering.transaction(async (trx) => {
    await trx('cart_items').where({ customer_id: id }).del();
    await trx('carts').where({ customer_id: id }).del();
    await trx('favourites').where({ customer_id: id }).del();
  });
  await dbs.notify.transaction(async (trx) => {
    await trx('push_subscriptions').where({ user_id: id }).del();
    await trx('notifications').where({ user_id: id }).del();
  });
}
