// Fixed-window rate limits held in memory: enough for one API process. With several
// processes the counters move to Redis (doc 13); the interface stays the same.
export function createLimiter({ windowMs, max }) {
  const hits = new Map();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.until <= now) hits.delete(k);
  }, Math.max(windowMs, 60_000));
  sweep.unref?.();
  return {
    /** Counts one try for key; ok is false once max tries are used in this window. */
    hit(key) {
      const now = Date.now();
      let entry = hits.get(key);
      if (!entry || entry.until <= now) {
        entry = { count: 0, until: now + windowMs };
        hits.set(key, entry);
      }
      entry.count += 1;
      return { ok: entry.count <= max, retryAfter: Math.ceil((entry.until - now) / 1000) };
    },
    reset: (key) => hits.delete(key),
  };
}
