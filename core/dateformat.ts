/**
 * The store's date format (Settings → Store & region). Used for the order's
 * "Delivery date" attribute (packing slips, emails) and the shopper's summary.
 * Intl is needed for "auto" and "long" (browser and server only, not Functions).
 */
import type { DateFormat } from "./types";

const two = (n: string) => n.padStart(2, "0");

function intl(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC", calendar: "gregory", numberingSystem: "latn" });
  } catch {
    return new Intl.DateTimeFormat("en", { ...opts, timeZone: "UTC" });
  }
}

const utc = (iso: string) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))));

/** The date alone in the chosen format, e.g. "10/18/2026", "18 October 2026", "Friday, 18 October". */
export function formatDate(iso: string, format: DateFormat, locale: string): string {
  const [y, m, d] = [iso.slice(0, 4), two(iso.slice(5, 7)), two(iso.slice(8, 10))];
  switch (format) {
    case "mdy":
      return `${m}/${d}/${y}`;
    case "dmy":
      return `${d}/${m}/${y}`;
    case "ymd":
      return `${y}-${m}-${d}`;
    case "long":
      return intl(locale, { day: "numeric", month: "long", year: "numeric" }).format(utc(iso));
    default:
      return intl(locale, { weekday: "long", day: "numeric", month: "long" }).format(utc(iso));
  }
}

/** Shopper-facing label: weekday + date for the numeric formats ("Fri 10/18/2026"). */
export function formatShopperDate(iso: string, format: DateFormat, locale: string, short: () => string): string {
  if (format === "auto") return short();
  const wd = intl(locale, { weekday: "short" }).format(utc(iso));
  return `${wd} ${formatDate(iso, format, locale)}`;
}

/** Value of the readable "Delivery date" attribute: formatted date + ISO date in brackets (snippets parse the brackets). */
export function attributeDate(iso: string, format: DateFormat, locale: string): string {
  const text = formatDate(iso, format, locale);
  return text === iso ? iso : `${text} (${iso})`;
}

/** Example for the settings select. */
export const DATE_FORMATS: DateFormat[] = ["auto", "long", "mdy", "dmy", "ymd"];
