// The background jobs slow down when nobody uses the site, so a serverless database can sleep
// (src/utils/activity.js): full speed during traffic and for 20 minutes after it, then one pass
// every half hour.
import { describe, expect, it } from 'vitest';
import { IDLE_AFTER_MS, IDLE_PASS_EVERY_MS, markActive, shouldRunPass } from '../src/utils/activity.js';

describe('job pacing', () => {
  it('runs every pass while the site is in use, and for a while after', () => {
    const t = Date.now();
    markActive(t);
    expect(shouldRunPass(t - 1000, t + 1000)).toBe(true);
    expect(shouldRunPass(t, t + IDLE_AFTER_MS - 1)).toBe(true);
  });

  it('then runs only every half hour, until someone comes back', () => {
    const t = Date.now();
    markActive(t);
    const quiet = t + IDLE_AFTER_MS + 1;
    expect(shouldRunPass(quiet - 5000, quiet)).toBe(false);
    expect(shouldRunPass(quiet - IDLE_PASS_EVERY_MS, quiet)).toBe(true);
    markActive(quiet);
    expect(shouldRunPass(quiet - 5000, quiet + 1000)).toBe(true);
  });
});
