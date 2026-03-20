/**
 * May this seller trade, or this rider take deliveries, right now? Signing in proves who
 * someone is; this decides what they may do. Every condition is separate, so the answer
 * says exactly what is missing:
 *
 *   account active  ·  role held and not suspended  ·  application APPROVED  ·
 *   every required document approved and not expired  ·  every manual check ticked
 *
 * An online rider is still refused when a mandatory licence or insurance has expired.
 */
import { requirementsFor, validApproved, expiryState, DOC_TYPES } from './documents.js';
import { allChecksPassed } from './verification.js';

const REASONS = {
  ACCOUNT_SUSPENDED: 'Your account is suspended',
  ROLE_SUSPENDED: 'This role is suspended on your account',
  NOT_APPLIED: 'Finish your application first',
  NOT_APPROVED: 'Your application has not been approved yet',
  APPLICATION_SUSPENDED: 'Your approval is suspended',
  CHECKS_INCOMPLETE: 'The verification team has not finished its checks',
};

/**
 * { ok, reasons: [{ code, message, docType? }], validUntil } for one applicant.
 * role: 'seller' or 'rider'; ctx: { type, state } for the requirement rows.
 */
export function eligibility(role, { account, membership, application, documents = [], requirementRows = [], ctx = {} }, now = Date.now()) {
  const reasons = [];
  const add = (code, extra = {}) => reasons.push({ code, message: extra.message ?? REASONS[code], ...extra });
  if (!account || account.status !== 'active') add('ACCOUNT_SUSPENDED');
  if (!membership || membership.status !== 'active') add('ROLE_SUSPENDED');
  if (!application) add('NOT_APPLIED');
  else if (application.status === 'SUSPENDED') add('APPLICATION_SUSPENDED');
  else if (application.status !== 'APPROVED') add('NOT_APPROVED');
  if (application && !allChecksPassed(role === 'seller' ? 'SELLER' : 'RIDER', application.checks)) add('CHECKS_INCOMPLETE');

  const { missing, expired, validUntil } = documentReadiness(role, documents, requirementRows, ctx, now);
  for (const t of missing) add('DOCUMENT_MISSING', { docType: t, message: `${DOC_TYPES[t].label} is not approved yet` });
  for (const t of expired) add('DOCUMENT_EXPIRED', { docType: t, message: `${DOC_TYPES[t].label} has expired; upload the renewed one` });
  return { ok: reasons.length === 0, reasons, validUntil };
}

/**
 * The required document types that have no approved version (missing) or whose newest
 * approved version has expired (expired), and the earliest expiry among the approved
 * required ones (validUntil, YYYY-MM-DD or null when none expire).
 */
export function documentReadiness(role, documents, requirementRows, ctx, now = Date.now()) {
  const missing = [];
  const expired = [];
  let validUntil = null;
  for (const { docType, required } of requirementsFor(role, requirementRows, ctx)) {
    if (!required) continue;
    const ok = validApproved(documents, docType, now);
    if (ok) {
      const e = ok.expiresOn ? String(ok.expiresOn).slice(0, 10) : null;
      if (e && (!validUntil || e < validUntil)) validUntil = e;
      continue;
    }
    const lapsed = documents.some((d) => d.docType === docType && d.status === 'APPROVED' && expiryState(d.expiresOn, now) === 'expired');
    (lapsed ? expired : missing).push(docType);
  }
  return { missing, expired, validUntil };
}

/** Ready for a reviewer to approve: every required document approved and valid, every check ticked. */
export function readyToApprove(role, application, documents, requirementRows, ctx, now = Date.now()) {
  const { missing, expired } = documentReadiness(role, documents, requirementRows, ctx, now);
  return missing.length === 0 && expired.length === 0 && allChecksPassed(role === 'seller' ? 'SELLER' : 'RIDER', application.checks);
}
