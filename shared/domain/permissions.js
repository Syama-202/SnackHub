/**
 * Who may do what. One account (one email) can hold several roles; each portal signs in
 * separately and its token carries only that portal's role. A permission comes from the
 * role in the token, which the server re-reads from MySQL on every protected route, never
 * from the body, a URL or local storage.
 *
 * Holding the seller or rider role is not the same as being approved: the business
 * permissions marked VERIFIED_ONLY also need an approved application and valid documents
 * (shared/domain/eligibility.js).
 */
export const ROLES = ['customer', 'seller', 'rider', 'reviewer', 'admin'];

export const STAFF_ROLES = ['reviewer', 'admin'];

export const ROLE_PERMISSIONS = {
  customer: ['profile.self', 'addresses.self', 'cart.self', 'orders.self', 'complaints.self', 'credits.self', 'payments.self', 'security.self', 'notifications.self'],
  seller: [
    'profile.self',
    'security.self',
    'notifications.self',
    'seller.onboarding',
    'seller.profile.self',
    'seller.shop.manage',
    'seller.products.read',
    'seller.products.write',
    'seller.products.publish',
    'seller.orders.read',
    'seller.orders.accept',
    'seller.settlements.receive',
  ],
  rider: ['profile.self', 'security.self', 'notifications.self', 'rider.onboarding', 'rider.profile.self', 'rider.availability', 'rider.location.write', 'rider.deliveries.read', 'rider.deliveries.accept', 'rider.earnings.read', 'rider.earnings.dispute'],
  // the verification team: reads applications and documents, reviews them, decides
  reviewer: ['security.self', 'verification.read', 'verification.documents.read', 'verification.review', 'verification.decide'],
  admin: [
    'security.self',
    'verification.read',
    'verification.documents.read',
    'verification.review',
    'verification.decide',
    'verification.suspend',
    'verification.requirements.write',
    'users.read',
    'users.suspend',
    'users.mfa.reset',
    'audit.read',
    'operations.read',
    'complaints.read',
    'complaints.decide',
    'fines.reverse',
    'earnings.resolve',
    'policy.write',
  ],
};

export const can = (role, permission) => Boolean(ROLE_PERMISSIONS[role]?.includes(permission));

/**
 * MFA policy: the roles that must enrol an authenticator app before reaching any protected
 * route. The server's MFA_REQUIRED_ROLES setting overrides it; admins and reviewers are
 * always included whatever the setting says.
 */
export const DEFAULT_MFA_REQUIRED = ['admin', 'reviewer', 'seller'];
export const mfaRequiredFor = (role, configured = DEFAULT_MFA_REQUIRED) => STAFF_ROLES.includes(role) || configured.includes(role);
