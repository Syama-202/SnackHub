// Whether anyone is using SnackHub right now, so the background jobs can let the database sleep.
//
// The outbox relay and the order timers ask the database for work every few seconds. On a
// serverless database (Neon) that keeps the compute awake around the clock and uses up the
// free monthly allowance. So the jobs run at full speed while there is traffic, and for a while
// after it (covering the 2-minute shop timeout, the 20-second offers and the 15-minute
// payment window), then fall back to one pass every half hour, which is enough for email
// retries and late clean-up. Any API request or socket connection wakes them again at once.
//
// The state is per process: each API process judges by its own traffic.

export const IDLE_AFTER_MS = 20 * 60_000;
export const IDLE_PASS_EVERY_MS = 30 * 60_000;

let lastActivity = Date.now();

export const markActive = (now = Date.now()) => {
  lastActivity = now;
};

/** Whether a job's timed pass should run: always while the site is in use, else every half hour. */
export function shouldRunPass(lastPassAt, now = Date.now()) {
  return now - lastActivity < IDLE_AFTER_MS || now - lastPassAt >= IDLE_PASS_EVERY_MS;
}
