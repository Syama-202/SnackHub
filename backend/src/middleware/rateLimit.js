// Refuses a caller who has used up their tries (429 with Retry-After). keyOf picks what is
// counted: the IP for sign-up, the IP and the email for sign-in, the challenge for MFA codes.
import { AppError } from '../utils/AppError.js';

export function rateLimit(limiter, keyOf, message = 'Too many attempts. Wait a few minutes and try again.') {
  return (req, res, next) => {
    const { ok, retryAfter } = limiter.hit(keyOf(req));
    if (ok) return next();
    res.set('Retry-After', String(retryAfter));
    next(new AppError(429, 'RATE_LIMITED', message));
  };
}

// lower-cased email from the body, so "A@x" and "a@x" share a counter
export const emailOf = (req) => String(req.body?.email ?? req.body?.identifier ?? '').trim().toLowerCase();
