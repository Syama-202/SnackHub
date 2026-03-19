/**
 * Seller and rider applications (doc 11.2 to 11.4, 16.4). Google sign-in only ever makes a
 * customer; a customer applies, an admin works through the checks and decides. Nobody can
 * promote themselves, and an admin account is never changed by a decision.
 */
export const CHECKS = {
  SELLER: ['identity', 'licence', 'location', 'kitchen', 'menu', 'testOrder'],
  RIDER: ['identity', 'licence', 'vehicle'],
};

export const OPEN_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFO'];

export const emptyChecks = (kind) => Object.fromEntries(CHECKS[kind].map((c) => [c, false]));

/** Every check for the kind is ticked. */
export const allChecksPassed = (kind, checks) => CHECKS[kind].every((c) => checks?.[c] === true);

/** The role a successful applicant gets, and the only role they may hold before. */
export const ROLE_FOR = { SELLER: 'seller', RIDER: 'rider' };
export const ROLE_BEFORE_APPROVAL = 'customer';

/**
 * What an admin action does to an open application, or a refusal code.
 * approve needs every check; reject and needs-info need a written reason.
 */
export function decide(kind, app, action, reason) {
  if (!OPEN_STATUSES.includes(app.status)) return { error: 'ALREADY_DECIDED' };
  if (action === 'approve') {
    if (!allChecksPassed(kind, app.checks)) return { error: 'CHECKS_INCOMPLETE' };
    return { status: 'APPROVED', reason: reason || 'Every verification check passed' };
  }
  if (action === 'reject' || action === 'needs-info') {
    if (!reason) return { error: 'REASON_REQUIRED' };
    return { status: action === 'reject' ? 'REJECTED' : 'NEEDS_INFO', reason };
  }
  return { error: 'UNKNOWN_ACTION' };
}

/** Approved shops start on probation and are shown with a "new" label (doc 16.4). */
export const SELLER_STATUS_AFTER = { APPROVED: 'probation', REJECTED: 'rejected', NEEDS_INFO: 'pending' };
