/**
 * Pure helpers for the Delivery areas / Zones settings page.
 * No React, no server code: shared by the admin page and its tests.
 */
import { parseRules } from "./postcode";
import { areaCovered, findZone, type AreaInput } from "./rules";
import type { Area, AreaMode, CountryAreas, Settings, Zone } from "./types";

export type Msg = (key: string, vars?: Record<string, string | number>) => string;
export interface UiIssue {
  path: string;
  message: string;
}

/** Textarea text -> stored rule lines (trimmed, empty lines dropped). */
export function textToLines(text: string): string[] {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export const linesToText = (lines: string[]): string => lines.join("\n");

/** Same rules, ignoring blank lines and surrounding spaces? */
export function sameLines(text: string, lines: string[]): boolean {
  const a = textToLines(text);
  return a.length === lines.length && a.every((l, i) => l === lines[i]);
}

export interface LineProblem {
  line: number;
  text: string;
}

/** Postcode rule lines that can't be read, plus how many rules are valid. */
export function postcodeProblems(lines: string[]): { valid: number; invalid: LineProblem[]; tooLong: LineProblem[] } {
  const { rules, invalid } = parseRules(lines);
  const tooLong = lines.map((text, i) => ({ line: i + 1, text })).filter((l) => l.text.length > 60);
  return { valid: rules.length, invalid, tooLong };
}

/** One readable message for a list of rule lines, or undefined when all are fine. */
export function postcodeMessage(lines: string[], msg: Msg, maxShown = 3): string | undefined {
  const { invalid, tooLong } = postcodeProblems(lines);
  if (tooLong.length) return msg("areas.lineTooLong", { line: tooLong[0].line });
  if (!invalid.length) return undefined;
  const shown = invalid.slice(0, maxShown).map((p) => msg("areas.badLine", { line: p.line, text: p.text }));
  if (invalid.length > maxShown) shown.push(msg("areas.moreBadLines", { count: invalid.length - maxShown }));
  return shown.join(" ");
}

/** Shopper-facing area name: primary locale, then English, then any. */
export function areaLabel(a: Area, locale: string): string {
  return a.names[locale] || a.names.en || Object.values(a.names).find(Boolean) || a.id;
}

/** Region code without the "US-" country prefix (how province codes are stored). */
export function bareRegion(code: string): string {
  return code.trim().toUpperCase().replace(/^[A-Z]{2}-/, "");
}

/** "CA, NY ; tx" -> ["CA", "NY", "TX"] (deduplicated, prefix removed). */
export function parseRegionCodes(text: string): string[] {
  const out: string[] = [];
  for (const part of String(text ?? "").split(/[,;\n]/)) {
    const c = bareRegion(part);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

export function newCountryAreas(country: string, mode: AreaMode = "postcode"): CountryAreas {
  return { country, mode, postcodes: [], areas: [], regions: [], askFirst: true };
}

export function newZone(id: string, name: string, country: string): Zone {
  return { id, name, country, postcodes: [], areas: [], regions: [], schedule: {}, capacity: null };
}

/** Does this zone have its own days, lead time, cutoff or limit? */
export function zoneHasOverrides(z: Zone): boolean {
  return Object.keys(z.schedule ?? {}).length > 0 || z.capacity !== null;
}

/** Which matching fields to show for a zone in a country. */
export function zoneFields(z: Zone, ca: CountryAreas | undefined): { postcodes: boolean; areas: boolean; regions: boolean } {
  const mode = ca?.mode ?? "none";
  return {
    postcodes: mode === "postcode" || mode === "none" || z.postcodes.length > 0,
    areas: (mode === "area" && (ca?.areas.length ?? 0) > 0) || z.areas.length > 0,
    regions: mode === "region" || z.regions.length > 0,
  };
}

/** Problems that block saving, with paths matching the settings document. */
export function validateAreas(d: Pick<Settings, "areas" | "zones">, primaryLocale: string, msg: Msg): UiIssue[] {
  const issues: UiIssue[] = [];
  const seen = new Set<string>();
  d.areas.forEach((a, i) => {
    if (seen.has(a.country)) issues.push({ path: `areas.${i}.country`, message: msg("areas.duplicateCountry") });
    seen.add(a.country);
    if (a.mode === "postcode") {
      const m = postcodeMessage(a.postcodes, msg);
      if (m) issues.push({ path: `areas.${i}.postcodes`, message: m });
      else if (!a.postcodes.length) issues.push({ path: `areas.${i}.postcodes`, message: msg("areas.needPostcodes") });
    }
    if (a.mode === "area") {
      if (!a.areas.length) issues.push({ path: `areas.${i}.areas`, message: msg("areas.needAreas") });
      a.areas.forEach((ar, j) => {
        if (!(ar.names[primaryLocale] ?? "").trim()) issues.push({ path: `areas.${i}.areas.${j}.names`, message: msg("areas.needAreaName") });
      });
    }
    if (a.mode === "region" && !a.regions.length) issues.push({ path: `areas.${i}.regions`, message: msg("areas.needRegions") });
  });
  d.zones.forEach((z, i) => {
    if (!z.name.trim()) issues.push({ path: `zones.${i}.name`, message: msg("areas.zoneNeedsName") });
    const m = postcodeMessage(z.postcodes, msg);
    if (m) issues.push({ path: `zones.${i}.postcodes`, message: m });
    if (!z.postcodes.length && !z.areas.length && !z.regions.length) issues.push({ path: `zones.${i}.match`, message: msg("areas.zoneNeedsMatch") });
    if (z.schedule.weekdays && !z.schedule.weekdays.length) issues.push({ path: `zones.${i}.schedule.weekdays`, message: msg("areas.zoneNeedsDays") });
  });
  return issues;
}

/** Remove zone links to areas that no longer exist in that country. */
export function pruneZoneAreas(d: Pick<Settings, "areas" | "zones">): void {
  for (const z of d.zones) {
    const ca = d.areas.find((a) => a.country === z.country);
    const ids = new Set(ca?.areas.map((a) => a.id) ?? []);
    z.areas = z.areas.filter((id) => ids.has(id));
  }
}

export interface TestResult {
  /** true = delivered, false = not delivered, null = no area limits in that country. */
  covered: boolean | null;
  zone: Zone | null;
}

/** The "Test an address" box: same rules as the storefront, run on the unsaved draft. */
export function testAddress(d: Pick<Settings, "areas" | "zones">, input: AreaInput): TestResult {
  const clean: AreaInput = {
    country: input.country || null,
    postcode: input.postcode?.trim() || null,
    areaId: input.areaId || null,
    region: input.region?.trim() || null,
  };
  return { covered: areaCovered(d, clean), zone: findZone(d, clean) };
}
