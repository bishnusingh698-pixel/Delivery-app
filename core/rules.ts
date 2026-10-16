/**
 * Product rules, country rules and delivery-area matching.
 * Pure functions shared by the widget, the admin preview and the Functions.
 */
import { inRange, weekday, yearlyMatches } from "./civil";
import { matchesAny } from "./postcode";
import type {
  CartLine,
  CountryAreas,
  DateRestriction,
  MethodId,
  ProductRules,
  StorefrontConfig,
  Target,
  Zone,
  Location,
} from "./types";

const lc = (s: string) => s.trim().toLowerCase();

export function targetIsEmpty(t: Target | null | undefined): boolean {
  return !t || (!t.products.length && !t.variants.length && !t.collections.length && !t.tags.length);
}

/** Does a cart line match a rule target? */
export function lineMatches(line: CartLine, t: Target, rules?: Pick<ProductRules, "collectionProducts">): boolean {
  if (targetIsEmpty(t)) return false;
  if (t.products.includes(line.productId)) return true;
  if (t.variants.includes(line.variantId)) return true;
  if (t.tags.length && line.tags?.length) {
    const tags = line.tags.map(lc);
    if (t.tags.some((g) => tags.includes(lc(g)))) return true;
  }
  if (t.collections.length) {
    if (line.collections?.some((c) => t.collections.includes(c))) return true;
    const map = rules?.collectionProducts ?? {};
    if (t.collections.some((c) => map[c]?.includes(line.productId))) return true;
  }
  return false;
}

/** Does this line need a date? Gift cards and non-shipping items never do. */
export function lineNeedsDate(line: CartLine, rules: ProductRules): boolean {
  if (line.giftCard) return false;
  if (line.requiresShipping === false) return false;
  return !lineMatches(line, rules.exclude, rules);
}

/** Lines that need a date, honouring the mixed-cart setting. */
export function datedLines(lines: CartLine[], rules: ProductRules): CartLine[] {
  const needing = lines.filter((l) => lineNeedsDate(l, rules));
  if (!needing.length) return [];
  if (rules.mixedCart === "all") {
    const counted = lines.filter((l) => !l.giftCard && l.requiresShipping !== false);
    if (needing.length !== counted.length) return [];
  }
  return needing;
}

export function countryAllowed(countries: "all" | string[], country: string | null | undefined): boolean {
  if (countries === "all") return true;
  if (!country) return true; // unknown country: never block
  return countries.map((c) => c.toUpperCase()).includes(country.toUpperCase());
}

/**
 * Methods the shopper can use for this cart in this country.
 * Method-only product rules intersect (a cake that is pickup-only removes delivery).
 */
export function methodsFor(
  config: Pick<StorefrontConfig, "methods" | "productRules">,
  country: string | null | undefined,
  lines: CartLine[],
): MethodId[] {
  let ids = config.methods.filter((m) => m.enabled && countryAllowed(m.countries, country)).map((m) => m.id);
  for (const rule of config.productRules.methodOnly) {
    if (lines.some((l) => lineMatches(l, rule.target, config.productRules))) {
      ids = ids.filter((id) => rule.methods.includes(id));
    }
  }
  return ids;
}

/** Extra lead days from product rules (longest wins). */
export function extraLeadDays(lines: CartLine[], rules: ProductRules): number {
  let max = 0;
  for (const r of rules.extraLead) {
    if (lines.some((l) => lineMatches(l, r.target, rules))) max = Math.max(max, r.days);
  }
  return max;
}

export function restrictionAllows(r: DateRestriction, date: string): boolean {
  if (r.weekdays && r.weekdays.length && !r.weekdays.includes(weekday(date))) return false;
  if (!r.ranges.length && !r.dates.length) return true;
  if (r.dates.includes(date)) return true;
  return r.ranges.some((rg) =>
    rg.yearly && rg.start === rg.end ? yearlyMatches(date, rg.start.slice(-5)) : inRange(date, rg.start, rg.end, rg.yearly),
  );
}

/** First restriction (and the line it applies to) that blocks `date`, if any. */
export function blockingRestriction(
  lines: CartLine[],
  rules: ProductRules,
  date: string,
): { rule: DateRestriction; line: CartLine } | null {
  for (const r of rules.restrictions) {
    for (const line of lines) {
      if (lineMatches(line, r.target, rules) && !restrictionAllows(r, date)) return { rule: r, line };
    }
  }
  return null;
}

/* ---------------------------------------------------------------- Areas */

export function areaConfig(config: Pick<StorefrontConfig, "areas">, country: string | null | undefined): CountryAreas | null {
  if (!country) return null;
  return config.areas.find((a) => a.country.toUpperCase() === country.toUpperCase()) ?? null;
}

export interface AreaInput {
  country: string | null;
  postcode?: string | null;
  areaId?: string | null;
  region?: string | null;
}

/** Province codes match with or without the country prefix ("JP-13" == "13"). */
export function regionMatches(list: string[], region: string | null | undefined): boolean {
  if (!region) return false;
  const strip = (x: string) => x.trim().toUpperCase().replace(/^[A-Z]{2}-/, "");
  const r = strip(region);
  return list.some((x) => strip(x) === r);
}

/** Is the shopper's area covered for local delivery? null = no restriction in this country. */
export function areaCovered(config: Pick<StorefrontConfig, "areas">, input: AreaInput): boolean | null {
  const ac = areaConfig(config, input.country);
  if (!ac || ac.mode === "none") return null;
  if (ac.mode === "postcode") return input.postcode ? matchesAny(ac.postcodes, input.postcode) : false;
  if (ac.mode === "area") return !!input.areaId && ac.areas.some((a) => a.id === input.areaId);
  if (ac.mode === "region") return regionMatches(ac.regions, input.region);
  return null;
}

/** Zone for a delivery address (first match wins), scoped by country. */
export function findZone(config: Pick<StorefrontConfig, "zones">, input: AreaInput): Zone | null {
  if (!input.country) return null;
  for (const z of config.zones) {
    if (z.country.toUpperCase() !== input.country.toUpperCase()) continue;
    if (input.postcode && z.postcodes.length && matchesAny(z.postcodes, input.postcode)) return z;
    if (input.areaId && z.areas.includes(input.areaId)) return z;
    if (input.region && z.regions.length && regionMatches(z.regions, input.region)) return z;
  }
  return null;
}

export function locationsFor(config: Pick<StorefrontConfig, "locations">, country: string | null | undefined): Location[] {
  return config.locations.filter((l) => l.enabled && countryAllowed(l.countries, country));
}
