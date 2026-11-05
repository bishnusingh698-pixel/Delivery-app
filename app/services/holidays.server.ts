/**
 * Public holidays from the bundled open-source `date-holidays` dataset
 * (no paid API). Names come in the merchant's admin language when the
 * dataset has them.
 */
import Holidays from "date-holidays";
import { addDays } from "../../core/civil";
import { allHolidayClosures } from "../../core/holidays";
import type { Closure, HolidayItem, HolidaySet } from "../../core/types";

export type { HolidayItem };

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

/** Does the dataset know this country? */
export function hasHolidayData(country: string): boolean {
  try {
    return !!(new Holidays().getCountries("en") as Record<string, string>)[country.toUpperCase()];
  } catch {
    return false;
  }
}

/**
 * Known mistakes in the dataset for countries Pickday sells in, by country: rules to drop
 * (not public holidays any more) and rules to add (official days the dataset misses).
 * UAE: Isra & Mi'raj stopped being a holiday in 2019 and the first day of Ramadan never was;
 * Arafat Day and the second National Day are official.
 */
const CORRECTIONS: Record<string, { drop: string[]; add: { rule: string; name: Record<string, string> }[] }> = {
  AE: {
    drop: ["27 Rajab", "1 Ramadan"],
    add: [
      { rule: "9 Dhu al-Hijjah", name: { en: "Arafat Day", ar: "يوم عرفة" } },
      { rule: "12-03", name: { en: "National Day (second day)", ar: "اليوم الوطني (اليوم الثاني)" } },
    ],
  },
};

/**
 * Holidays between `from` and `from + days` (default 12 months). Public holidays only: "bank"
 * days in the dataset (Christmas Eve and New Year's Eve in Germany, Austria and the Nordics,
 * Midsummer Eve…) are normal, often the busiest, trading days for shops.
 */
export function upcomingHolidays(country: string, region: string | null, lang: string, from: string, days = 366): HolidayItem[] {
  let h: Holidays;
  try {
    h = region ? new Holidays(country, region, { languages: [lang, "en"] }) : new Holidays(country, { languages: [lang, "en"] });
  } catch {
    return [];
  }
  const fix = CORRECTIONS[country.toUpperCase()];
  for (const a of fix?.add ?? []) h.setHoliday(a.rule, { name: a.name, type: "public" });
  const to = addDays(from, days);
  const y0 = Number(from.slice(0, 4));
  const y1 = Number(to.slice(0, 4));
  const out: HolidayItem[] = [];
  for (let year = y0; year <= y1; year++) {
    for (const x of (h.getHolidays(year, lang) ?? []) as any[]) {
      if (x.type !== "public") continue;
      if (fix?.drop.includes(String(x.rule))) continue;
      const date = String(x.date).slice(0, 10);
      if (date < from || date > to) continue;
      const spanDays = Math.max(1, Math.round((new Date(x.end).getTime() - new Date(x.start).getTime()) / 86400000));
      out.push({
        // The dataset's rule ("12-25", "easter 1") stays the same every year: skipping it skips it for good.
        key: String(x.rule ?? x.name).slice(0, 80),
        date,
        end: addDays(date, spanDays - 1),
        name: x.name,
        mayShift: LUNAR.test(String(x.rule ?? "")),
      });
    }
  }
  const seen = new Set<string>();
  return out.filter((x) => (seen.has(x.date + x.name) ? false : (seen.add(x.date + x.name), true))).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Closures for the store's holiday sets between `from` and `to` (names in `lang`). Never throws. */
export function holidayClosuresFor(sets: HolidaySet[], from: string, to: string, lang: string): Closure[] {
  const lists: Record<string, HolidayItem[]> = {};
  for (const set of sets) {
    try {
      lists[set.id] = upcomingHolidays(set.country, set.region, lang, from, Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000)));
    } catch (e) {
      console.error("[holidays]", set.country, (e as Error).message);
      lists[set.id] = [];
    }
  }
  return allHolidayClosures(sets, lists);
}

/** Each set's holidays for the next 400 days (admin preview and the Days off page). */
export function holidayItemsFor(sets: HolidaySet[], today: string, lang: string): Record<string, HolidayItem[]> {
  const out: Record<string, HolidayItem[]> = {};
  for (const set of sets) {
    try {
      out[set.id] = upcomingHolidays(set.country, set.region, lang, today, 400);
    } catch {
      out[set.id] = [];
    }
  }
  return out;
}
