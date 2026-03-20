// Short-lived links to private documents. The API checks who is asking, then signs
// { document, viewer, expiry } with an HMAC key used for nothing else. The link works for five
// minutes; it names no file path, and changing any part of it breaks the signature.
import { hmac, sameDigest } from './keys.js';

export const LINK_SECONDS = 300;

export function signFileLink(env, { ref, viewerId }, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ r: ref, v: viewerId, e: Math.floor(now / 1000) + LINK_SECONDS })).toString('base64url');
  return `${body}.${hmac(env, 'file-links', body)}`;
}

/** { ref, viewerId } for a good, unexpired link, or null. */
export function verifyFileLink(env, token, now = Date.now()) {
  const [body, sig] = String(token ?? '').split('.');
  if (!body || !sig || !sameDigest(sig, hmac(env, 'file-links', body))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (typeof p.e !== 'number' || p.e * 1000 < now) return null;
    return { ref: p.r, viewerId: p.v };
  } catch {
    return null;
  }
}
