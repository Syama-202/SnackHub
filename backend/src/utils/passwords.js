// Password hashing with Argon2id (OWASP settings: 19 MiB memory, 2 passes, 1 lane), and an
// optional breached-password check against Have I Been Pwned's range API: only the first five
// characters of the SHA-1 leave the server (k-anonymity), and if the service is down the
// check is skipped rather than blocking sign-up.
import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';

const OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (password) => argon2.hash(password, OPTIONS);
export const verifyPassword = (hash, password) => argon2.verify(hash, password).catch(() => false);
export const needsRehash = (hash) => argon2.needsRehash(hash, OPTIONS);

// verified against an unknown email, so "no such account" takes as long as "wrong password"
let dummy;
export async function verifyAgainstNothing(password) {
  dummy ??= await hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(dummy, password);
  return false;
}

/** True when the password appears in a public breach (only when PASSWORD_BREACH_CHECK is on). */
export async function isBreached(env, password, fetchImpl = fetch) {
  if (!env.PASSWORD_BREACH_CHECK) return false;
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
  try {
    const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`, { headers: { 'Add-Padding': 'true' }, signal: AbortSignal.timeout(2500) });
    if (!res.ok) return false;
    const suffix = sha1.slice(5);
    return (await res.text()).split('\n').some((line) => line.startsWith(suffix) && Number(line.split(':')[1]) > 0);
  } catch {
    return false;
  }
}
