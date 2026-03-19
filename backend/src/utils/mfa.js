// Admin second factor helpers (doc 16.3): TOTP (RFC 6238) with otplib, secrets encrypted at
// rest with AES-256-GCM, and single-use recovery codes stored as SHA-256 hashes.
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import otplib from 'otplib';

const { authenticator } = otplib;
// accept the current 30 second step and one either side, for clock drift
authenticator.options = { step: 30, window: 1, digits: 6 };

const key = (env) => Buffer.from(env.MFA_KEY, 'base64url');

/** iv.tag.ciphertext, each base64url */
export function encryptSecret(env, plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(env), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(env, stored) {
  const [iv, tag, data] = stored.split('.').map((p) => Buffer.from(p, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key(env), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export const newTotpSecret = () => authenticator.generateSecret(20);
export const otpauthUrl = (email, secret) => authenticator.keyuri(email, 'SnackHub admin', secret);

/** The 30 second time step a code belongs to, or null if it is not valid now. */
export function totpStep(secret, code, now = Date.now()) {
  const delta = authenticator.checkDelta(code, secret);
  return delta === null ? null : Math.floor(now / 30_000) + delta;
}

/** The code for a moment (now by default); tests use the neighbouring 30 second steps. */
export const totpNow = (secret, at = Date.now()) => authenticator.clone({ epoch: at }).generate(secret);

// recovery codes look like k7qm-2xpd: easy to read out, 40 bits each
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export function newRecoveryCodes(n = 10) {
  return Array.from({ length: n }, () => {
    const bytes = randomBytes(8);
    const s = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}
export const hashCode = (code) => createHash('sha256').update(code.trim().toLowerCase()).digest('hex');
export const hashToken = (raw) => createHash('sha256').update(raw).digest('hex');
export const newLinkToken = () => randomBytes(32).toString('base64url');
