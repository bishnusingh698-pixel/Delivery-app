/**
 * Storefront text + Intl formatting. Built-in strings for the active locale
 * are loaded as a separate small asset (pickday-i18n-<locale>.js) which sets
 * window.PickdayI18n[locale]; merchant overrides come from the config.
 */
import { format, type Values } from "../../core/i18n/format";
import { isRtl, matchLocale, type StorefrontLocale } from "../../core/i18n/locales";

declare global {
  interface Window {
    PickdayI18n?: Record<string, Record<string, string>>;
  }
}

export interface Texts {
  /** Locale for Intl (the storefront's request locale, e.g. "de", "pt-BR"). */
  locale: string;
  textLocale: StorefrontLocale;
  rtl: boolean;
  t: (key: string, values?: Values) => string;
  date: (iso: string, style?: "short" | "long") => string;
  time: (hm: string) => string;
  range: (a: string, b: string) => string;
  money: (amount: number, currency: string) => string;
  num: (n: number) => string;
  monthTitle: (iso: string) => string;
  weekdayNarrow: (wd: number) => string;
  weekdayLong: (wd: number) => string;
}

const utc = (iso: string) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))));

function safeFormatter(locale: string, opts: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" });
  } catch {
    return new Intl.DateTimeFormat("en", { ...opts, timeZone: "UTC" });
  }
}

export function makeTexts(requestLocale: string, overrides: Record<string, Record<string, string>> | undefined, pseudo = false): Texts {
  const textLocale = matchLocale(requestLocale);
  const locale = requestLocale || "en";
  const builtIn = window.PickdayI18n?.[textLocale] ?? window.PickdayI18n?.en ?? {};
  const english = window.PickdayI18n?.en ?? builtIn;
  const ov = overrides?.[requestLocale] ?? overrides?.[textLocale] ?? overrides?.[requestLocale.split("-")[0]] ?? {};
  const rtl = isRtl(locale);
  const dShort = safeFormatter(locale, { weekday: "short", day: "numeric", month: "short" });
  const dLong = safeFormatter(locale, { weekday: "long", day: "numeric", month: "long" });
  const tFmt = safeFormatter(locale, { hour: "numeric", minute: "2-digit" });
  const mFmt = safeFormatter(locale, { month: "long", year: "numeric" });
  const wNarrow = safeFormatter(locale, { weekday: "narrow" });
  const wLong = safeFormatter(locale, { weekday: "long" });
  let nf: Intl.NumberFormat;
  try {
    nf = new Intl.NumberFormat(locale);
  } catch {
    nf = new Intl.NumberFormat("en");
  }
  const t = (key: string, values?: Values) => {
    const msg = ov[key] ?? builtIn[key] ?? english[key] ?? key;
    const out = format(msg, values ?? {}, { locale, isolate: rtl });
    return pseudo ? pseudoize(out) : out;
  };
  const time = (hm: string) => tFmt.format(new Date(Date.UTC(2000, 0, 1, Number(hm.slice(0, 2)), Number(hm.slice(3, 5)))));
  return {
    locale,
    textLocale,
    rtl,
    t,
    date: (iso, style = "short") => (style === "long" ? dLong : dShort).format(utc(iso)),
    time,
    range: (a, b) => `${time(a)}–${time(b)}`,
    money: (amount, currency) => {
      try {
        return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
      } catch {
        return `${amount.toFixed(2)} ${currency}`;
      }
    },
    num: (n) => nf.format(n),
    monthTitle: (iso) => mFmt.format(utc(iso)),
    // 2023-01-01 was a Sunday.
    weekdayNarrow: (wd) => wNarrow.format(new Date(Date.UTC(2023, 0, 1 + wd))),
    weekdayLong: (wd) => wLong.format(new Date(Date.UTC(2023, 0, 1 + wd))),
  };
}

/** Pseudo-localisation: accented and ~40% longer, to test layout. */
export function pseudoize(s: string): string {
  const map: Record<string, string> = { a: "á", e: "ë", i: "ï", o: "ö", u: "ü", A: "Å", E: "É", O: "Ø", c: "ç", n: "ñ", s: "š", y: "ý" };
  const body = s.replace(/[aeiouAEOcnsy]/g, (c) => map[c] ?? c);
  const pad = "~".repeat(Math.ceil(s.length * 0.4));
  return `[${body}${pad}]`;
}
