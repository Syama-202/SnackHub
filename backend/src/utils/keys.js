// Keys derived from the one server secret MFA_KEY with HKDF-SHA256, one per purpose, so a
// key that leaks through one feature (say, signed file links) unlocks nothing else.
//   seal/open: AES-256-GCM for document numbers, bank accounts and links waiting in the outbox
//   hmac:      one-time codes and link tokens (a 6-digit code is too small to store as a plain hash)
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

const cache = new Map();

export function subkey(env, purpose) {
  const id = `${env.MFA_KEY}:${purpose}`;
  if (!cache.has(id)) cache.set(id, Buffer.from(hkdfSync('sha256', Buffer.from(env.MFA_KEY, 'base64url'), Buffer.alloc(0), `snackhub:${purpose}`, 32)));
  return cache.get(id);
}

/** iv.tag.ciphertext, each base64url */
export function seal(env, purpose, plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', subkey(env, purpose), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function open(env, purpose, sealed) {
  const [iv, tag, data] = String(sealed).split('.').map((p) => Buffer.from(p, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', subkey(env, purpose), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export const hmac = (env, purpose, value) => createHmac('sha256', subkey(env, purpose)).update(String(value)).digest('hex');

/** Compares two hex digests in constant time. */
export function sameDigest(a, b) {
  const x = Buffer.from(String(a), 'hex');
  const y = Buffer.from(String(b), 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** A random six-digit code, without modulo bias. */
export function sixDigitCode() {
  for (;;) {
    const n = randomBytes(4).readUInt32BE(0);
    if (n < 4_294_000_000) return String(n % 1_000_000).padStart(6, '0');
  }
}
