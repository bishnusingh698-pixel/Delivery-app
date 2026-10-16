/**
 * First day of the week per locale. Uses Intl.Locale week info where the
 * browser supports it, otherwise a small CLDR-derived table.
 * Returns 0 = Sunday, 1 = Monday, 6 = Saturday.
 */

const SUNDAY = new Set(["US", "CA", "MX", "BR", "JP", "KR", "TW", "HK", "MO", "IL", "IN", "PH", "TH", "ZA", "SA", "PE", "CO", "VE", "GT", "HN", "NI", "PA", "DO", "PR", "SV", "ZW", "KE", "ET", "BT", "NP", "KH", "LA", "MM", "ID", "PK", "BD", "YE", "BS", "BZ", "JM", "TT", "AS", "GU", "UM", "VI", "WS", "MT", "AG", "DM", "BW", "MZ", "PY", "SG"]);
const SATURDAY = new Set(["AE", "AF", "BH", "DJ", "DZ", "EG", "IQ", "IR", "JO", "KW", "LY", "OM", "QA", "SD", "SY"]);

/** Likely region when a locale has none (only where week start differs from Monday). */
const LANG_REGION: Record<string, string> = {
  en: "US", ja: "JP", ko: "KR", he: "IL", hi: "IN", th: "TH", ar: "EG", fa: "IR", id: "ID", ms: "MY", pt: "BR", zh: "CN", vi: "VN", ur: "PK",
};

export function firstDayOfWeek(locale: string): number {
  try {
    const loc = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const info = loc.getWeekInfo?.() ?? loc.weekInfo;
    if (info && typeof info.firstDay === "number") return info.firstDay % 7; // 7 = Sunday
  } catch {
    /* fall through to table */
  }
  const [lang, regionRaw] = locale.replace("_", "-").split("-");
  const region = (regionRaw && regionRaw.length === 2 ? regionRaw : LANG_REGION[lang.toLowerCase()] ?? "").toUpperCase();
  if (SUNDAY.has(region)) return 0;
  if (SATURDAY.has(region)) return 6;
  return 1;
}

/** Weekday indexes (0–6) in display order for a locale. */
export function weekOrder(locale: string): number[] {
  const first = firstDayOfWeek(locale);
  return Array.from({ length: 7 }, (_, i) => (first + i) % 7);
}
