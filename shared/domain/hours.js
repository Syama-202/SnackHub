/**
 * Opening hours and delivery pincodes (doc 12.1), shared by the API and the app. The same
 * week-of-windows shape serves a shop's hours and a snack's own serving times.
 *
 * A schedule is a week of windows in the shop's own time zone (India: IST, UTC+05:30, no
 * daylight saving):
 *   { mon: [['07:00', '11:00'], ['16:00', '22:00']], tue: [...], ..., sun: [] }
 * A window that closes at or before its opening time runs past midnight into the next day
 * (['20:00', '01:00'] is 8 pm to 1 am); '24:00' is midnight. An empty day has no window.
 * Closed dates ('2026-11-14') are holidays on top: a window that starts on one is skipped.
 * A shop with no schedule at all is open whenever it is not paused.
 */
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_LABEL = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
export const MAX_WINDOWS = 2;
export const MAX_CLOSED_DATES = 30;
export const MAX_PINCODES = 50;
export const PINCODE = /^[1-9][0-9]{5}$/;
export const DEFAULT_TZ = 'Asia/Kolkata';
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$/;
const DAY_MS = 24 * 60 * 60_000;
const WEEK_MIN = 7 * 1440;

const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** Minutes a window lasts: past midnight when it closes at or before it opens. */
const lengthOf = (a, b) => (b > a ? b - a : b + 1440 - a);

/** Why a schedule is not valid, or null when it is. maxWindows: per day (shops 2, snacks 3). */
export function scheduleProblem(schedule, { maxWindows = MAX_WINDOWS } = {}) {
  if (schedule == null) return null;
  if (typeof schedule !== 'object' || Array.isArray(schedule)) return 'Hours must be a week of windows';
  for (const day of Object.keys(schedule)) if (!DAYS.includes(day)) return `Unknown day ${day}`;
  const spans = [];
  for (const [i, day] of DAYS.entries()) {
    const windows = schedule[day] ?? [];
    if (!Array.isArray(windows) || windows.length > maxWindows) return `${DAY_LABEL[day]}: up to ${maxWindows} windows`;
    for (const w of windows) {
      if (!Array.isArray(w) || w.length !== 2 || !TIME.test(w[0]) || !TIME.test(w[1])) return `${DAY_LABEL[day]}: use HH:MM times`;
      const [a, b] = w.map(minutesOf);
      if (a === b || (a === 1440 && b === 0)) return `${DAY_LABEL[day]}: a window must not open and close at the same time`;
      if (a === 1440) return `${DAY_LABEL[day]}: a window cannot open at 24:00`;
      spans.push({ day, from: i * 1440 + a, to: i * 1440 + a + lengthOf(a, b) });
    }
  }
  // no two windows may overlap, including one that runs past midnight into the next day's,
  // and Sunday night into Monday
  spans.sort((x, y) => x.from - y.from);
  for (let k = 0; k < spans.length; k += 1) {
    const next = spans[k + 1] ?? (spans.length > 1 ? { ...spans[0], from: spans[0].from + WEEK_MIN } : null);
    if (next && next.from < spans[k].to) return `${DAY_LABEL[spans[k].day]}: windows must not overlap`;
  }
  return null;
}

/** The week a shop keeps: its weekly hours, else the old single daily window, else null (always open). */
export function scheduleOf({ weeklyHours, openHours } = {}) {
  if (weeklyHours && typeof weeklyHours === 'object') return weeklyHours;
  const m = typeof openHours === 'string' && openHours.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
  if (m && minutesOf(m[1]) !== minutesOf(m[2])) return Object.fromEntries(DAYS.map((d) => [d, [[m[1], m[2]]]]));
  return null;
}

// ---------- time zones

const FIXED = { 'Asia/Kolkata': 330 * 60_000, 'Asia/Calcutta': 330 * 60_000 };
const formats = new Map();
function partsIn(ms, tz) {
  let f = formats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    formats.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, ss: +p.second };
}

/** The zone's offset from UTC at a moment, in ms (India: always +5:30). */
export function offsetAt(ms, tz = DEFAULT_TZ) {
  if (FIXED[tz] != null) return FIXED[tz];
  const p = partsIn(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(ms / 1000) * 1000;
}

/** The local calendar date ('YYYY-MM-DD'), weekday and the moment of local midnight. */
export function localDay(ms, tz = DEFAULT_TZ) {
  const wall = new Date(ms + offsetAt(ms, tz));
  const utcMidnight = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  // the offset at midnight itself, which differs on a daylight-saving change day
  const midnight = utcMidnight - offsetAt(utcMidnight - offsetAt(ms, tz), tz);
  return { date: wall.toISOString().slice(0, 10), day: DAYS[(wall.getUTCDay() + 6) % 7], midnight };
}

/** The IST calendar date and weekday of a moment (India time; kept for the seller pages). */
export const istDate = (ms) => localDay(ms, DEFAULT_TZ);

/** The local time of a moment, "4:00 pm". */
export const clockIn = (ms, tz = DEFAULT_TZ) => new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: tz });

/**
 * The moments a schedule is open, from the day before `from` to `days` days after it, as
 * merged [start, end) pairs in ms. A window past midnight ends the next day; a holiday drops
 * the windows that start on it.
 */
export function openIntervals(schedule, { tz = DEFAULT_TZ, closedDates = [], from = Date.now(), days = 8 } = {}) {
  const closed = new Set(closedDates ?? []);
  const out = [];
  // local noon of each day, so a daylight-saving hour never lands on the wrong date
  const noon = localDay(from, tz).midnight + 12 * 3600_000;
  for (let i = -1; i <= days; i += 1) {
    const { date, day, midnight } = localDay(noon + i * DAY_MS, tz);
    if (closed.has(date)) continue;
    for (const [a, b] of schedule?.[day] ?? []) {
      const [x, y] = [minutesOf(a), minutesOf(b)];
      out.push([midnight + x * 60_000, midnight + (x + lengthOf(x, y)) * 60_000]);
    }
  }
  out.sort((p, q) => p[0] - q[0]);
  const merged = [];
  for (const iv of out) {
    const last = merged.at(-1);
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else merged.push([...iv]);
  }
  return merged;
}

/**
 * Whether the shop is open at `now`, and when that changes:
 *   { open: true, closesAt } or { open: false, opensAt } (opensAt null: not within a week)
 */
export function openState(schedule, closedDates = [], now = Date.now(), tz = DEFAULT_TZ) {
  if (!schedule) return { open: true, closesAt: null, opensAt: null };
  for (const [from, to] of openIntervals(schedule, { tz, closedDates, from: now })) {
    if (now >= from && now < to) return { open: true, closesAt: to, opensAt: null };
    if (from > now) return { open: false, closesAt: null, opensAt: from };
  }
  return { open: false, closesAt: null, opensAt: null };
}

/** "today", "tomorrow" or the weekday of a moment, seen from `now`. */
export function dayWord(ms, now = Date.now(), tz = DEFAULT_TZ) {
  const days = Math.round((localDay(ms, tz).midnight - localDay(now, tz).midnight) / DAY_MS);
  return days === 0 ? 'today' : days === 1 ? 'tomorrow' : DAY_LABEL[localDay(ms, tz).day];
}

/** "Open till 10:00 pm", "Open till midnight", "Opens today 4:00 pm", "Opens Monday 8:00 am", "Not open this week". */
export function hoursLabel(state, now = Date.now(), tz = DEFAULT_TZ) {
  if (state.open) return !state.closesAt ? 'Open' : state.closesAt === localDay(state.closesAt - 1, tz).midnight + DAY_MS ? 'Open till midnight' : `Open till ${clockIn(state.closesAt, tz)}`;
  if (!state.opensAt) return 'Not open this week';
  return `Opens ${dayWord(state.opensAt, now, tz)} ${clockIn(state.opensAt, tz)}`;
}

/** A shop with no pincode list delivers by distance alone; with one, only to those pincodes. */
export function pincodeServed(pincodes, pincode) {
  if (!Array.isArray(pincodes) || pincodes.length === 0) return true;
  return Boolean(pincode) && pincodes.includes(pincode);
}
