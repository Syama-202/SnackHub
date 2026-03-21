// The 4-digit delivery code (doc 10.3). It is never stored: the code is derived from the
// order's key with a server key, and the order keeps only an HMAC of it, so a database copy
// reveals neither. The customer sees it only once the rider is within 500 m; it is never
// logged, put in a notification or included in an order payload.
import { createHash } from 'node:crypto';
import { hmac, sameDigest } from './keys.js';

/** The checkout's key: one per customer and Idempotency-Key, 64 hex characters. */
export const orderKeyFor = (customerId, idemKey) => createHash('sha256').update(`${customerId}:${idemKey}`).digest('hex');

export function deliveryCode(env, orderKey) {
  const n = Number.parseInt(hmac(env, 'delivery-code', orderKey).slice(0, 12), 16);
  return String(1000 + (n % 9000));
}

export const deliveryCodeHash = (env, orderKey, code) => hmac(env, 'delivery-code-check', `${orderKey}:${code}`);

export const deliveryCodeMatches = (env, orderKey, storedHash, code) => /^\d{4}$/.test(String(code)) && sameDigest(deliveryCodeHash(env, orderKey, code), storedHash);
