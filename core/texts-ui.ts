/**
 * Helpers for the "Texts and translations" editor (admin). Pure logic so it
 * can be tested without the UI.
 */
import { placeholders } from "./i18n/format";

export type TextsMap = Record<string, Record<string, string>>;

/** Braces must open and close in pairs; otherwise the storefront shows the text mangled. */
export function bracesBalanced(msg: string): boolean {
  let depth = 0;
  for (const ch of msg) {
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

/** "{date}", "{count}" … as shown to merchants. */
export function placeholderTokens(msg: string): string[] {
  try {
    return placeholders(msg).map((p) => `{${p}}`);
  } catch {
    return [];
  }
}

export interface OverrideCheck {
  ok: boolean;
  /** Braces don't pair up. */
  syntax: boolean;
  /** Placeholders in the default that the override dropped (as "{name}"). */
  missing: string[];
  /** Placeholders in the override the default doesn't have (as "{name}"). */
  extra: string[];
  /** Longer than the recommended length (a warning only; still saves). */
  tooLong: boolean;
}

/**
 * Check a merchant override against the built-in text: it must keep the
 * same placeholders (plural/select texts are checked by their placeholder
 * names only). An empty override means "use the default" and is always fine.
 */
export function checkOverride(defaultText: string, override: string, recommendedMax?: number): OverrideCheck {
  const ok: OverrideCheck = { ok: true, syntax: false, missing: [], extra: [], tooLong: false };
  if (!override.trim()) return ok;
  const tooLong = !!recommendedMax && override.length > recommendedMax;
  if (!bracesBalanced(override)) return { ok: false, syntax: true, missing: [], extra: [], tooLong };
  const want = new Set(placeholderTokens(defaultText));
  const have = new Set(placeholderTokens(override));
  const missing = [...want].filter((p) => !have.has(p));
  const extra = [...have].filter((p) => !want.has(p));
  return { ok: !missing.length && !extra.length, syntax: false, missing, extra, tooLong };
}

export interface KeyGroup {
  prefix: string;
  keys: string[];
}

/**
 * Group keys by the part before the first dot, in first-seen order. A key
 * without a dot joins the group of the same name if one exists (e.g. "fee"
 * with "fee.label"); otherwise it goes to "general".
 */
export function groupKeys(keys: string[]): KeyGroup[] {
  const prefixes = new Set(keys.filter((k) => k.includes(".")).map((k) => k.split(".")[0]));
  const groups = new Map<string, string[]>();
  for (const k of keys) {
    const p = k.includes(".") ? k.split(".")[0] : prefixes.has(k) ? k : "general";
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p)!.push(k);
  }
  return [...groups].map(([prefix, ks]) => ({ prefix, keys: ks }));
}

/** Case-insensitive search over the key, its texts and its description. */
export function matchesSearch(query: string, key: string, ...texts: (string | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [key, ...texts].some((s) => !!s && s.toLowerCase().includes(q));
}

/** Set or clear (empty text) one override, dropping empty languages. Returns a new map. */
export function setOverride(texts: TextsMap, locale: string, key: string, value: string): TextsMap {
  const next: TextsMap = { ...texts, [locale]: { ...(texts[locale] ?? {}) } };
  if (value === "") delete next[locale][key];
  else next[locale][key] = value;
  if (!Object.keys(next[locale]).length) delete next[locale];
  return next;
}

/** Number of non-empty overrides for a language (keys known to the widget only, when given). */
export function overrideCount(texts: TextsMap, locale: string, known?: Set<string>): number {
  return Object.entries(texts[locale] ?? {}).filter(([k, v]) => v !== "" && (!known || known.has(k))).length;
}

/** Built-in text for a language with the merchant's overrides on top (what the shopper sees). */
export function effectiveTexts(defaults: Record<string, string>, english: Record<string, string>, overrides: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = { ...english, ...defaults };
  for (const [k, v] of Object.entries(overrides ?? {})) if (v.trim()) out[k] = v;
  return out;
}

export interface TextIssue {
  locale: string;
  key: string;
  check: OverrideCheck;
}

/** Every override that would break on the storefront (for the save check). */
export function textIssues(texts: TextsMap, defaultsFor: (locale: string) => Record<string, string>): TextIssue[] {
  const out: TextIssue[] = [];
  for (const [locale, map] of Object.entries(texts)) {
    const defs = defaultsFor(locale);
    for (const [key, value] of Object.entries(map)) {
      if (defs[key] === undefined) continue;
      const check = checkOverride(defs[key], value);
      if (!check.ok) out.push({ locale, key, check });
    }
  }
  return out;
}
