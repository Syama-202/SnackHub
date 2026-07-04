/**
 * Deleting your own account (India's DPDP Act: the right to erasure). A customer can do it
 * from their profile. Seller, rider and staff accounts hold payouts, documents and duties that
 * someone has to close properly, so those go through support instead. An order that is still
 * on its way must finish first. Orders, payments and refunds are kept, as the law requires,
 * but the account itself (name, email, mobile, addresses, sign-in) is erased.
 */
import { ACTIVE_STATES } from './orderStates.js';

/** What the person types to confirm. */
export const DELETE_CONFIRM = 'DELETE';

/** Order states that stop a deletion: anything not yet delivered, cancelled or rejected. */
export const BLOCKING_ORDER_STATES = ['PENDING_PAYMENT', ...ACTIVE_STATES];

/** The reason an account cannot be deleted now, or null. roles: the active role names. */
export function deletionBlocker({ roles, openOrders }) {
  const other = roles.filter((r) => r !== 'customer');
  if (other.length) return { code: 'ACCOUNT_HAS_OTHER_ROLES', message: `This account is also a ${other.join(' and ')} account. Contact support to close it.` };
  if (openOrders > 0) return { code: 'ORDER_IN_PROGRESS', message: 'You have an order in progress. You can delete your account once it is delivered or cancelled.' };
  return null;
}

/** The email an erased account keeps, so the address is free to sign up again. */
export const erasedEmail = (userId) => `deleted-${userId}@deleted.invalid`;

/** Whether an account was erased by its owner. */
export const isErased = (email) => /^deleted-\d+@deleted\.invalid$/.test(String(email));
