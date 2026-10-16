/**
 * Civil-date arithmetic on "YYYY-MM-DD" strings.
 *
 * No Date objects with local time and no Intl, so this works the same in
 * browsers, Node and Shopify Functions (which run without Intl), and is
 * immune to the server's or shopper's time zone.
 */

/** Days since 1970-01-01 for a civil date (proleptic Gregorian). */
export function toDays(iso: string): number {
  const y0 = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  // Algorithm from Howard Hinnant's "days_from_civil".
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Civil date for a day number (inverse of toDays). */
export function fromDays(z0: number): string {
  const z = z0 + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const year = m <= 2 ? y + 1 : y;
  return `${pad(year, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

function pad(n: number, w: number): string {
  let s = String(n);
  while (s.length < w) s = "0" + s;
  return s;
}

export function addDays(iso: string, n: number): string {
  return fromDays(toDays(iso) + n);
}

export function diffDays(a: string, b: string): number {
  return toDays(a) - toDays(b);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(iso: string): number {
  // 1970-01-01 was a Thursday (4).
  return (((toDays(iso) + 4) % 7) + 7) % 7;
}

export function isValidDate(iso: unknown): iso is string {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return fromDays(toDays(iso)) === iso;
}

export function isValidTime(t: unknown): t is string {
  return typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

/** "HH:MM" -> minutes since midnight. */
export function toMinutes(t: string): number {
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

export function fromMinutes(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60), 2)}:${pad(m % 60, 2)}`;
}

/** "MM-DD" part of a civil date. */
export function monthDay(iso: string): string {
  return iso.slice(5, 10);
}

export function year(iso: string): number {
  return Number(iso.slice(0, 4));
}

export function month(iso: string): number {
  return Number(iso.slice(5, 7));
}

export function daysInMonth(y: number, m: number): number {
  const next = m === 12 ? `${pad(y + 1, 4)}-01-01` : `${pad(y, 4)}-${pad(m + 1, 2)}-01`;
  return toDays(next) - toDays(`${pad(y, 4)}-${pad(m, 2)}-01`);
}

export function firstOfMonth(iso: string): string {
  return iso.slice(0, 8) + "01";
}

export function addMonths(iso: string, n: number): string {
  const total = year(iso) * 12 + (month(iso) - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const d = Math.min(Number(iso.slice(8, 10)), daysInMonth(y, m));
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

/**
 * Is `iso` inside [start, end]? Supports yearly ranges ("MM-DD" compare),
 * including ranges that wrap the year end (e.g. 12-24 … 01-02).
 */
export function inRange(iso: string, start: string, end: string, yearly: boolean): boolean {
  if (!yearly) return iso >= start && iso <= end;
  const md = monthDay(iso);
  const a = start.length > 5 ? monthDay(start) : start;
  const b = end.length > 5 ? monthDay(end) : end;
  if (a <= b) return md >= a && md <= b;
  return md >= a || md <= b;
}

/** Leap-day handling for yearly rules: a 02-29 rule also matches 02-28 in non-leap years. */
export function yearlyMatches(iso: string, md: string): boolean {
  if (monthDay(iso) === md) return true;
  if (md === "02-29" && monthDay(iso) === "02-28") {
    return daysInMonth(year(iso), 2) === 28;
  }
  return false;
}
