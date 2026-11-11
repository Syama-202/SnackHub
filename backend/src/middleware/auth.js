// Who is calling and what they may do (doc 16.1, 16.2). The user id and role come from the
// signed access token, never the body, a URL or local storage. requireRole and
// requirePermission also re-read the account and the role membership from the database, so a
// suspension works at once, not only at the next refresh; a token whose role the account does
// not hold (a forged or stale claim) is refused.
import { AppError } from '../utils/AppError.js';
import { documented } from '../utils/apiDocs.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { userModel } from '../models/identity/user.js';
import { userRoleModel } from '../models/identity/userRole.js';
import { can, mfaRequiredFor } from '../../../shared/domain/permissions.js';

export function requireAuth(env) {
  return documented({ auth: true }, (req, res, next) => {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) return next(new AppError(401, 'UNAUTHENTICATED', 'Sign in first'));
    try {
      req.user = verifyAccessToken(env, token);
      next();
    } catch {
      next(new AppError(401, 'UNAUTHENTICATED', 'Your sign-in has expired'));
    }
  });
}

/** The account and the membership behind req.user, both active, or a 403. Cached per request. */
async function activeMembership(dbs, req) {
  if (req.membership) return req.membership;
  const [account, membership] = await Promise.all([userModel.findById(dbs.identity, req.user.userId), userRoleModel.find(dbs.identity, req.user.userId, req.user.role)]);
  if (!account || account.status !== 'active') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended');
  if (!membership || membership.status !== 'active') throw new AppError(403, 'FORBIDDEN', 'Your role cannot do this');
  req.account = account;
  req.membership = membership;
  return membership;
}

/** The token is for one of these portals, and the account still holds that role. */
export function requireRole(dbs, ...roles) {
  return documented({ roles }, async (req, res, next) => {
    try {
      if (!req.user || !roles.includes(req.user.role)) throw new AppError(403, 'FORBIDDEN', 'Your role cannot do this');
      await activeMembership(dbs, req);
      next();
    } catch (err) {
      next(err);
    }
  });
}

/**
 * The token's role grants this permission (shared/domain/permissions.js), the account holds
 * the role, and, where the MFA policy asks for it, the session passed a second factor.
 * Business actions additionally check eligibility in their controller.
 */
export function requirePermission(deps, permission) {
  const { dbs, env } = deps;
  return documented({ permission }, async (req, res, next) => {
    try {
      if (!req.user || !can(req.user.role, permission)) throw new AppError(403, 'FORBIDDEN', 'Your role cannot do this');
      await activeMembership(dbs, req);
      if (mfaRequiredFor(req.user.role, env.MFA_REQUIRED_ROLES) && !req.user.mfaAt) throw new AppError(401, 'MFA_REQUIRED', 'Set up two-step sign-in to continue');
      next();
    } catch (err) {
      next(err);
    }
  });
}

/**
 * Admin routes exist only on the admin host (doc 16.3, 15.0): anywhere else they answer 404,
 * so the public site does not even confirm them. Outside production the local console, which
 * shares the dev server, says so with X-SnackHub-Host: admin.
 */
export const adminHostOnly = (env) => documented({ adminHost: true }, (req, res, next) => {
  // the admin host by name, or a request the admin Netlify site signed (middleware/proxy.js)
  const onAdminHost = env.ADMIN_HOSTS.includes(req.get('host')) || req.viaSite === 'admin' || (env.NODE_ENV !== 'production' && req.get('X-SnackHub-Host') === 'admin');
  if (!onAdminHost) return next(new AppError(404, 'NOT_FOUND', 'Not found'));
  next();
});

/**
 * Staff routes need a recent second factor (doc 16.3): 8 hours for the console, 5 minutes
 * for decisions that grant, suspend or move money (step-up). The time comes from the token.
 */
export const requireFreshMfa = (maxMinutes) => documented({ freshMfaMinutes: maxMinutes }, (req, res, next) => {
  const at = req.user?.mfaAt;
  if (!at || Date.now() - at > maxMinutes * 60_000) {
    return next(new AppError(401, 'MFA_REQUIRED', maxMinutes <= 5 ? 'Confirm your code again for this action' : 'Second factor required'));
  }
  next();
});

/**
 * Cookie-only routes (refresh, logout) also need this header. A form or link on another
 * site cannot add a custom header, so a forged cross-site request is refused (doc 16.2).
 */
export const requireClientHeader = documented({ clientHeader: true }, (req, res, next) => {
  if (req.get('X-SnackHub-Client') !== 'web') return next(new AppError(403, 'CLIENT_HEADER_MISSING', 'Request refused'));
  next();
});
