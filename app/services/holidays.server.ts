/**
 * Public holidays from the bundled open-source `date-holidays` dataset
 * (no paid API). Names come in the merchant's admin language when the
 * dataset has them.
 */
import Holidays from "date-holidays";
import { addDays } from "../../core/civil";

export interface HolidayItem {
  id: string;
  date: string;
  end: string;
  name: string;
  type: string;
  /** Based on a lunar / moon-sighting calendar: may shift by a day. */
  mayShift: boolean;
}

const LUNAR = /(Muharram|Safar|Rabi|Jumada|Rajab|Sha'?ban|Ramadan|Shawwal|Dhu al|chinese|korean|vietnamese|hebrew|Nisan|Iyar|Sivan|Tamuz|Av |Elul|Tishrei|Cheshvan|Kislev|Tevet|Shvat|Adar|bengali|hindu|lunar|moon)/i;

export function holidayCountries(lang: string): { code: string; name: string }[] {
  const h = new Holidays();
  const list = h.getCountries(lang) as Record<string, string>;
  return Object.entries(list)
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, lang));
}

export function holidayRegions(country: string, lang: string): { code: string; name: string }[] {
  const h = new Holidays();
  const list = (h.getStates(country, lang) ?? {}) as Record<string, string>;
  return Object.entries(list)
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, lang));
}

/** Holidays between `from` and `from + days` (default 12 months). Public + bank holidays only. */
export function upcomingHolidays(country: string, region: string | null, lang: string, from: string, days = 366): HolidayItem[] {
  let h: Holidays;
  try {
    h = region ? new Holidays(country, region, { languages: [lang, "en"] }) : new Holidays(country, { languages: [lang, "en"] });
  } catch {
    return [];
  }
  const to = addDays(from, days);
  const y0 = Number(from.slice(0, 4));
  const out: HolidayItem[] = [];
  for (const year of [y0, y0 + 1]) {
    for (const x of (h.getHolidays(year, lang) ?? []) as any[]) {
      if (!["public", "bank"].includes(x.type)) continue;
      const date = String(x.date).slice(0, 10);
      if (date < from || date > to) continue;
      const spanDays = Math.max(1, Math.round((new Date(x.end).getTime() - new Date(x.start).getTime()) / 86400000));
      out.push({
        id: `${country}-${region ?? ""}-${date}-${x.name}`.replace(/\s+/g, "_").slice(0, 40),
        date,
        end: addDays(date, spanDays - 1),
        name: x.name,
        type: x.type,
        mayShift: LUNAR.test(String(x.rule ?? "")),
      });
    }
  }
  const seen = new Set<string>();
  return out.filter((x) => (seen.has(x.date + x.name) ? false : (seen.add(x.date + x.name), true))).sort((a, b) => (a.date < b.date ? -1 : 1));
}
