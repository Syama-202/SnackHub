// One Redis connection for rate-limit counters and Socket.IO (doc 13). Commands fail at once
// while Redis is down instead of queueing (enableOfflineQueue: false), so a request never waits
// on it; ioredis keeps reconnecting in the background. A short-lived worker that only publishes
// asks for queueing (queue: true), so what it sends before the connection is up still goes out.
// The URL may carry a password, so only the state is logged, never the URL.
import { Redis } from 'ioredis';

export function createRedis(env, logger, { name = 'api', queue = false } = {}) {
  if (!env.REDIS_URL) return null;
  const redis = new Redis(env.REDIS_URL, {
    connectionName: `snackhub-${name}`,
    enableOfflineQueue: queue,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy: (times) => Math.min(times * 500, 5000),
  });
  let up = null;
  redis.on('ready', () => {
    if (up !== true) logger?.info({ redis: 'ready' }, 'redis connected');
    up = true;
  });
  redis.on('error', (err) => {
    if (up !== false) logger?.warn({ redis: 'down', reason: err.code ?? err.name }, 'redis unreachable; limits count per process until it is back');
    up = false;
  });
  return redis;
}

/** Closes a client without throwing when it never connected. */
export async function closeRedis(redis) {
  if (!redis) return;
  try {
    await redis.quit();
  } catch {
    redis.disconnect();
  }
}

/**
 * A client whose publish never rejects: Socket.IO's Redis adapter and emitter do not catch a
 * failed command, so one would crash the process. Without `queue` a message is dropped while
 * Redis is away (each process still serves its own sockets); with it, it waits briefly.
 */
export function safePublisher(client, { queue = false } = {}) {
  return new Proxy(client, {
    get(target, key) {
      if (key === 'publish') return (...args) => (queue || target.status === 'ready' ? target.publish(...args).catch(() => 0) : Promise.resolve(0));
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/**
 * The adapter's own two connections. The subscriber waits for Redis however long it is down
 * and subscribes again on reconnect; the publisher never fails a request (safePublisher).
 */
export function adapterClients(redis) {
  const sub = redis.duplicate({ enableOfflineQueue: true, maxRetriesPerRequest: null, connectionName: 'snackhub-socket-sub' });
  const pub = redis.duplicate({ enableOfflineQueue: false, connectionName: 'snackhub-socket-pub' });
  for (const c of [sub, pub]) c.on('error', () => {});
  return {
    sub,
    pub: safePublisher(pub),
    close() {
      sub.disconnect();
      pub.disconnect();
    },
  };
}
