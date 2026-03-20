/**
 * Seller and rider verification: one application per applicant, moving through these
 * statuses only by the moves below. The API asks canMove() before every change, so neither
 * the applicant nor a reviewer can jump a step, and a decision always records who and why.
 *
 *   DRAFT -> SUBMITTED -> UNDER_REVIEW -> APPROVED
 *                 \             \-> ACTION_REQUIRED -> SUBMITTED (after corrections)
 *                  \-> REJECTED      \-> REJECTED
 *   APPROVED <-> SUSPENDED (admins only)        REJECTED -> DRAFT (after REAPPLY_AFTER_DAYS)
 */
export const STATUSES = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ACTION_REQUIRED', 'APPROVED', 'REJECTED', 'SUSPENDED'];

// the applicant may change details and documents only in these
export const EDITABLE = ['DRAFT', 'ACTION_REQUIRED'];
// in the reviewers' queue
export const OPEN_FOR_REVIEW = ['SUBMITTED', 'UNDER_REVIEW'];
export const IN_PROGRESS = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ACTION_REQUIRED'];

// a queue item older than this is overdue
export const OVERDUE_HOURS = 48;
// a rejected applicant may start a new draft after this many days
export const REAPPLY_AFTER_DAYS = 7;

// [from, to, who may make the move, a written reason is required]
const MOVES = [
  ['DRAFT', 'SUBMITTED', 'applicant', false],
  ['ACTION_REQUIRED', 'SUBMITTED', 'applicant', false],
  ['REJECTED', 'DRAFT', 'applicant', false],
  ['SUBMITTED', 'UNDER_REVIEW', 'reviewer', false],
  ['SUBMITTED', 'ACTION_REQUIRED', 'reviewer', true],
  ['UNDER_REVIEW', 'ACTION_REQUIRED', 'reviewer', true],
  ['SUBMITTED', 'REJECTED', 'reviewer', true],
  ['UNDER_REVIEW', 'REJECTED', 'reviewer', true],
  ['ACTION_REQUIRED', 'REJECTED', 'reviewer', true],
  ['UNDER_REVIEW', 'APPROVED', 'reviewer', false],
  ['APPROVED', 'SUSPENDED', 'admin', true],
  ['SUSPENDED', 'APPROVED', 'admin', true],
];

/** Admin console actions and the status each one moves to. */
export const ACTIONS = {
  'start-review': 'UNDER_REVIEW',
  'request-changes': 'ACTION_REQUIRED',
  reject: 'REJECTED',
  approve: 'APPROVED',
  suspend: 'SUSPENDED',
  reinstate: 'APPROVED',
};

/**
 * Whether `actor` ('applicant', 'reviewer' or 'admin') may move an application from one
 * status to another. Admins may make every reviewer move as well.
 */
export function canMove(from, to, actor) {
  const move = MOVES.find(([f, t]) => f === from && t === to);
  if (!move) return { ok: false, error: 'NOT_ALLOWED' };
  const [, , who, needsReason] = move;
  const allowed = who === actor || (who === 'reviewer' && actor === 'admin');
  return allowed ? { ok: true, needsReason } : { ok: false, error: 'FORBIDDEN_MOVE' };
}

/**
 * A reviewer or admin action on an application: the next status, or a refusal code.
 * `ready` says whether every required document is approved and every check ticked; an
 * approval or a reinstatement needs it.
 */
export function decide(app, action, { actor, reason, ready }) {
  const to = ACTIONS[action];
  if (!to) return { error: 'UNKNOWN_ACTION' };
  // reinstate is the only move back to APPROVED from SUSPENDED; approve is the one from review
  if (action === 'reinstate' && app.status !== 'SUSPENDED') return { error: 'NOT_ALLOWED' };
  if (action === 'approve' && app.status === 'SUSPENDED') return { error: 'NOT_ALLOWED' };
  const move = canMove(app.status, to, actor);
  if (!move.ok) return { error: move.error };
  const text = reason?.trim();
  if (move.needsReason && !text) return { error: 'REASON_REQUIRED' };
  if (to === 'APPROVED' && !ready) return { error: 'NOT_READY' };
  return { status: to, reason: text || (to === 'APPROVED' ? 'Every required document and check passed' : 'Review started') };
}

/** When a rejected applicant may start again. */
export const reapplyFrom = (decidedAt) => new Date(new Date(decidedAt).getTime() + REAPPLY_AFTER_DAYS * 86_400_000);

/** The queue item is waiting longer than the review target. */
export const isOverdue = (app, now = Date.now()) => OPEN_FOR_REVIEW.includes(app.status) && app.submittedAt && now - new Date(app.submittedAt).getTime() > OVERDUE_HOURS * 3_600_000;

/**
 * Checks a reviewer ticks by hand, on top of the documents: the shop really is where it
 * says, the kitchen is clean, the menu is real; a rider's background check came back clear.
 */
export const CHECKS = {
  SELLER: ['location', 'kitchen', 'menu'],
  RIDER: ['background'],
};
export const emptyChecks = (kind) => Object.fromEntries(CHECKS[kind].map((c) => [c, false]));
export const allChecksPassed = (kind, checks) => CHECKS[kind].every((c) => checks?.[c] === true);

/** What the public shop row shows for each application status (doc 16.4: new shops start on probation). */
export const SELLER_STATUS_AFTER = {
  SUBMITTED: 'pending',
  UNDER_REVIEW: 'pending',
  ACTION_REQUIRED: 'pending',
  APPROVED: 'probation',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended',
};
