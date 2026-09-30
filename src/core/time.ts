/**
 * Calendar helpers shared by the SRS, tiers and planner.
 *
 * All functions are pure: the current time is always passed in (epoch ms).
 *
 * ## Learning days
 * A "learning day" starts at **04:00 local time** (like Anki): a review at 01:30 still
 * belongs to the previous evening's session. Days are numbered by an integer *day index*
 * equal to the number of days since 1970-01-01 of the local calendar date the learning day
 * belongs to, so `isoDate(dayIndex(t))` gives the familiar `YYYY-MM-DD`.
 *
 * ## Time zones
 * `tzOffsetMin` is the number of minutes to ADD to UTC to get local time
 * (Paris in summer = +120, New York in winter = −300). In a browser:
 * `tzOffsetMin = -new Date().getTimezoneOffset()` (note the sign flip).
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** Local hour at which a new learning day begins. */
export const DAY_START_HOUR = 4;

/** Learning-day index of an instant. */
export function dayIndex(t: number, tzOffsetMin = 0): number {
  return Math.floor((t + tzOffsetMin * MINUTE_MS - DAY_START_HOUR * HOUR_MS) / DAY_MS);
}

/** Epoch ms at which learning day `day` begins (04:00 local). Inverse of {@link dayIndex}. */
export function dayStart(day: number, tzOffsetMin = 0): number {
  return day * DAY_MS + DAY_START_HOUR * HOUR_MS - tzOffsetMin * MINUTE_MS;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Day index of a local calendar date `YYYY-MM-DD` (e.g. an exam date), or `null` if the string
 * is not a real date. The exam "day" is the learning day of that calendar date.
 */
export function parseIsoDate(s: string | undefined | null): number | null {
  if (typeof s !== 'string') return null;
  const m = ISO_DATE.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return t / DAY_MS;
}

/** `YYYY-MM-DD` of a day index. */
export function isoDate(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Whole learning days from `a` to `b` (positive if `b` is later). */
export function daysBetween(a: number, b: number, tzOffsetMin = 0): number {
  return dayIndex(b, tzOffsetMin) - dayIndex(a, tzOffsetMin);
}
