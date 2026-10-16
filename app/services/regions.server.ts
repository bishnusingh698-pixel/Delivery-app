/**
 * Provinces / states per country for the Delivery areas page.
 * Uses the same bundled dataset as publishing (holidayRegions), so the codes
 * stored here get the same display names on the storefront. Codes are stored
 * without the country prefix ("CA", not "US-CA"); matching accepts both.
 */
import { holidayRegions } from "./holidays.server";

export interface Region {
  code: string;
  name: string;
}

export function regionsFor(country: string, lang: string): Region[] {
  if (!/^[A-Z]{2}$/.test(country)) return [];
  try {
    return holidayRegions(country, lang.split("-")[0] || "en").filter((r) => r.code && r.code.length <= 10);
  } catch {
    return [];
  }
}

/** Regions for several countries at once (skips countries without data). */
export function regionsByCountry(countries: string[], lang: string): Record<string, Region[]> {
  const out: Record<string, Region[]> = {};
  for (const c of new Set(countries)) out[c] = regionsFor(c, lang);
  return out;
}
