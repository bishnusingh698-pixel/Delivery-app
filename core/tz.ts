/**
 * Time-zone helpers built on Intl. Used by the browser widget, the admin and
 * the server. NOT imported by Shopify Functions (they have no Intl); the
 * Functions get "now" from Shopify's `shop.localTime` instead.
 */
import type { LocalNow } from "./types";

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    fmtCache.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    partsFormatter(tz);
    return true;
  } catch {
    return false;
  }
}

/** Current civil date and minutes-since-midnight in `timeZone`. */
export function nowInZone(timeZone: string, at: Date = new Date()): LocalNow {
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const parts = partsFormatter(tz).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = Number(get("hour")) % 24;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + Number(get("minute")),
  };
}

/**
 * Convert a civil date-time in `timeZone` to a UTC Date (handles DST gaps by
 * moving forward, overlaps by taking the first occurrence).
 */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Two iterations converge for every real-world zone.
  let ts = guess;
  for (let i = 0; i < 2; i++) {
    const local = nowInZone(timeZone, new Date(ts));
    const [ly, lm, ld] = local.date.split("-").map(Number);
    const localTs = Date.UTC(ly, lm - 1, ld, Math.floor(local.minutes / 60), local.minutes % 60);
    ts += guess - localTs;
  }
  return new Date(ts);
}

/** Does the browser's zone currently differ from `timeZone` (by offset)? */
export function zoneDiffersFromDevice(timeZone: string, at: Date = new Date()): boolean {
  let device: string | undefined;
  try {
    device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return false;
  }
  if (!device || device === timeZone) return false;
  const a = nowInZone(timeZone, at);
  const b = nowInZone(device, at);
  return a.date !== b.date || a.minutes !== b.minutes;
}

/** City part of an IANA zone, e.g. "America/New_York" -> "New York". */
export function zoneCity(timeZone: string): string {
  const last = timeZone.split("/").pop() ?? timeZone;
  return last.replace(/_/g, " ");
}

/**
 * Localised, human name for a zone, e.g. "Indische Normalzeit" (de) or
 * "heure de l’Inde" (fr), from the browser's own CLDR data.
 * Falls back to the city name.
 */
export function zoneDisplayName(timeZone: string, locale: string): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "longGeneric" }).formatToParts(new Date());
    const name = parts.find((p) => p.type === "timeZoneName")?.value;
    if (name && !/^GMT[+-]/.test(name)) return name;
  } catch {
    /* fall through */
  }
  return zoneCity(timeZone);
}
