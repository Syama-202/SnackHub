// Who is calling (doc 16.1, 16.2). Role and user id come from the access token, never the
// body. requireRole also re-reads the role from MySQL, so a role taken away works at once
// on sensitive routes, not only at the next refresh.
import { AppError } from '../utils/AppError.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { userModel } from '../models/identity/user.js';

export function requireAuth(env) {
  return (req, res, next) => {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) return next(new AppError(401, 'UNAUTHENTICATED', 'Sign in first'));
    try {
      req.user = verifyAccessToken(env, token);
      next();
    } catch {
      next(new AppError(401, 'UNAUTHENTICATED', 'Your sign-in has expired'));
    }
  };
}

export function requireRole(dbs, ...roles) {
  return async (req, res, next) => {
    try {
      if (!req.user || !roles.includes(req.user.role)) throw new AppError(403, 'FORBIDDEN', 'Your role cannot do this');
      const current = await userModel.findById(dbs.identity, req.user.userId);
      if (!current || current.status !== 'active' || !roles.includes(current.role)) throw new AppError(403, 'FORBIDDEN', 'Your role cannot do this');
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Cookie-only routes (refresh, logout) also need this header. A form or link on another
 * site cannot add a custom header, so a forged cross-site request is refused (doc 16.2).
 */
export function requireClientHeader(req, res, next) {
  if (req.get('X-SnackHub-Client') !== 'web') return next(new AppError(403, 'CLIENT_HEADER_MISSING', 'Request refused'));
  next();
}
