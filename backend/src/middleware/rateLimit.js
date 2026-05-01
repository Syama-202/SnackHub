// Refuses a caller who has used up their tries: 429 RATE_LIMITED with Retry-After (seconds)
// and the same number in error.details.retryAfter, so every limit answers alike. keyOf picks
// what is counted: the IP for public reads and sign-up, the IP and the email for sign-in, the
// signed-in user for everything behind a token (role and ownership come from the token).
import { AppError } from '../utils/AppError.js';
import { createLimiter } from '../utils/rateLimit.js';

export function rateLimit(limiter, keyOf, message = 'Too many attempts. Wait a few minutes and try again.') {
  return async (req, res, next) => {
    try {
      const { ok, remaining, retryAfter } = await limiter.hit(keyOf(req));
      res.set({ 'RateLimit-Limit': String(limiter.max), 'RateLimit-Remaining': String(remaining), 'RateLimit-Reset': String(retryAfter) });
      if (ok) return next();
      res.set('Retry-After', String(retryAfter));
      next(new AppError(429, 'RATE_LIMITED', message, { retryAfter }));
    } catch (err) {
      next(err);
    }
  };
}

/** A limit on the app's shared store (deps.rateStore): limit(deps, 'name', { minutes, max }, keyOf). */
export const limit = (deps, name, { minutes = 1, max }, keyOf, message) => rateLimit(createLimiter({ name, windowMs: minutes * 60_000, max, store: deps.rateStore }), keyOf, message);

// what limits are keyed on
export const byIp = (req) => req.ip;
export const byUser = (req) => req.user.userId;

// lower-cased email from the body, so "A@x" and "a@x" share a counter
export const emailOf = (req) => String(req.body?.email ?? req.body?.identifier ?? '').trim().toLowerCase();
