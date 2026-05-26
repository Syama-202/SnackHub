/**
 * Shop opening hours and delivery pincodes (doc 12.1), shared by the API and the app.
 *
 * A schedule is a week of windows in India time (IST, UTC+05:30, no daylight saving):
 *   { mon: [['07:00', '11:00'], ['16:00', '22:00']], tue: [...], ..., sun: [] }
 * Up to two windows a day, each opening before it closes on the same day ('24:00' is
 * midnight); an empty day is closed. Closed dates ('2026-11-14') are holidays on top.
 * A shop with no schedule at all is open whenever it is not paused.
 */
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_LABEL = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
export const MAX_WINDOWS = 2;
export const MAX_CLOSED_DATES = 30;
export const MAX_PINCODES = 50;
export const PINCODE = /^[1-9][0-9]{5}$/;
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$/;
const IST_MS = 330 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Why a schedule is not valid, or null when it is. */
export function scheduleProblem(schedule) {
  if (schedule == null) return null;
  if (typeof schedule !== 'object') return 'Hours must be a week of windows';
  for (const day of Object.keys(schedule)) if (!DAYS.includes(day)) return `Unknown day ${day}`;
  for (const day of DAYS) {
    const windows = schedule[day] ?? [];
    if (!Array.isArray(windows) || windows.length > MAX_WINDOWS) return `${DAY_LABEL[day]}: up to ${MAX_WINDOWS} opening windows`;
    let last = -1;
    for (const w of windows) {
      if (!Array.isArray(w) || w.length !== 2 || !TIME.test(w[0]) || !TIME.test(w[1])) return `${DAY_LABEL[day]}: use HH:MM times`;
      const [a, b] = w.map(minutesOf);
      if (a >= b) return `${DAY_LABEL[day]}: a window must close after it opens, on the same day`;
      if (a < last) return `${DAY_LABEL[day]}: windows must not overlap`;
      last = b;
    }
  }
  return null;
}

/** The week a shop keeps: its weekly hours, else the old single daily window, else null (always open). */
export function scheduleOf({ weeklyHours, openHours } = {}) {
  if (weeklyHours && typeof weeklyHours === 'object') return weeklyHours;
  const m = typeof openHours === 'string' && openHours.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
  if (m && minutesOf(m[1]) < minutesOf(m[2])) return Object.fromEntries(DAYS.map((d) => [d, [[m[1], m[2]]]]));
  return null;
}

/** The IST calendar date ('YYYY-MM-DD') and weekday of a moment. */
export function istDate(ms) {
  const d = new Date(ms + IST_MS);
  return { date: d.toISOString().slice(0, 10), day: DAYS[(d.getUTCDay() + 6) % 7], midnight: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - IST_MS };
}

/**
 * Whether the shop is open at `now`, and when that changes:
 *   { open: true, closesAt } or { open: false, opensAt } (opensAt null: not within a week)
 */
export function openState(schedule, closedDates = [], now = Date.now()) {
  if (!schedule) return { open: true, closesAt: null, opensAt: null };
  const closed = new Set(closedDates ?? []);
  for (let i = 0; i < 8; i += 1) {
    const { date, day, midnight } = istDate(now + i * DAY_MS);
    if (closed.has(date)) continue;
    for (const [a, b] of schedule[day] ?? []) {
      const from = midnight + minutesOf(a) * 60_000;
      const to = midnight + minutesOf(b) * 60_000;
      if (i === 0 && now >= from && now < to) return { open: true, closesAt: to, opensAt: null };
      if (from > now) return { open: false, closesAt: null, opensAt: from };
    }
  }
  return { open: false, closesAt: null, opensAt: null };
}

const clock = (ms) => new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/** "Open till 10:00 pm", "Open till midnight", "Opens today 4:00 pm", "Opens Monday 8:00 am", "Not open this week". */
export function hoursLabel(state, now = Date.now()) {
  if (state.open) return !state.closesAt ? 'Open' : state.closesAt === istDate(state.closesAt - 1).midnight + DAY_MS ? 'Open till midnight' : `Open till ${clock(state.closesAt)}`;
  if (!state.opensAt) return 'Not open this week';
  const days = Math.round((istDate(state.opensAt).midnight - istDate(now).midnight) / DAY_MS);
  const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : DAY_LABEL[istDate(state.opensAt).day];
  return `Opens ${when} ${clock(state.opensAt)}`;
}

/** A shop with no pincode list delivers by distance alone; with one, only to those pincodes. */
export function pincodeServed(pincodes, pincode) {
  if (!Array.isArray(pincodes) || pincodes.length === 0) return true;
  return Boolean(pincode) && pincodes.includes(pincode);
}
