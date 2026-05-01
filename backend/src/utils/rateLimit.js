// Fixed-window rate limits (doc 13). With Redis the counters are shared by every API process:
// one Lua script increments the key and sets its expiry together, so concurrent requests on
// several servers can never both get the last try. Keys are SHA-256 hashes of what is counted,
// so no email or IP address is stored. If Redis fails or is slow, that try is counted in this
// process's memory instead: the limits keep working, per process, rather than switching off,
// and requests never wait more than a quarter second on Redis.
import { createHash } from 'node:crypto';

const HIT = `
local n = redis.call('INCR', KEYS[1])
local t = redis.call('PTTL', KEYS[1])
if n == 1 or t < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  t = tonumber(ARGV[1])
end
return {n, t}`;
const REDIS_TIMEOUT_MS = 250;

/** Counters in this process only: tests, and the fallback while Redis is down. */
export function memoryCounter() {
  const hits = new Map();
  let sweptAt = Date.now();
  return {
    kind: 'memory',
    async hit(key, windowMs) {
      const now = Date.now();
      if (now - sweptAt > 60_000) {
        for (const [k, v] of hits) if (v.until <= now) hits.delete(k);
        sweptAt = now;
      }
      let entry = hits.get(key);
      if (!entry || entry.until <= now) {
        entry = { count: 0, until: now + windowMs };
        hits.set(key, entry);
      }
      entry.count += 1;
      return { count: entry.count, ttlMs: entry.until - now };
    },
    async reset(key) {
      hits.delete(key);
    },
  };
}

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('redis timeout'), { code: 'ETIMEDOUT' })), ms).unref?.())]);

/** Counters in Redis, shared by every process; falls back to memory for a failed try. */
export function redisCounter(redis, { logger, fallback = memoryCounter() } = {}) {
  if (!redis.snackhubHit) redis.defineCommand('snackhubHit', { numberOfKeys: 1, lua: HIT });
  let warnedAt = 0;
  const warn = (err) => {
    if (Date.now() - warnedAt < 60_000) return;
    warnedAt = Date.now();
    logger?.warn({ reason: err.code ?? err.name }, 'rate limit counted in memory: redis unavailable');
  };
  return {
    kind: 'redis',
    async hit(key, windowMs) {
      try {
        const [count, ttlMs] = await withTimeout(redis.snackhubHit(key, windowMs), REDIS_TIMEOUT_MS);
        return { count: Number(count), ttlMs: Number(ttlMs) };
      } catch (err) {
        warn(err);
        return fallback.hit(key, windowMs);
      }
    },
    async reset(key) {
      await fallback.reset(key);
      await withTimeout(redis.del(key), REDIS_TIMEOUT_MS).catch(warn);
    },
  };
}

const hash = (value) => createHash('sha256').update(String(value)).digest('base64url');

/**
 * A named limit: at most `max` tries per key in each window. The name keeps limits apart in
 * the shared store (sign-in by IP and sign-in by email count separately).
 */
export function createLimiter({ name, windowMs, max, store = memoryCounter() }) {
  if (!name) throw new Error('A rate limit needs a name');
  const keyOf = (key) => `rl:${name}:${hash(key)}`;
  return {
    name,
    max,
    /** Counts one try for key; ok is false once max tries are used in this window. */
    async hit(key) {
      const { count, ttlMs } = await store.hit(keyOf(key), windowMs);
      return { ok: count <= max, remaining: Math.max(0, max - count), retryAfter: Math.max(1, Math.ceil(ttlMs / 1000)) };
    },
    reset: (key) => store.reset(keyOf(key)),
  };
}
