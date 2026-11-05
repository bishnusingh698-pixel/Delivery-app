/**
 * Postcode rules: exact codes, prefixes ("SW1*") and numeric ranges
 * ("10115-10999", "10115–10999" or "10115..10999").
 * Matching ignores case, spaces and dashes.
 */

export type PostcodeRule =
  | { kind: "exact"; value: string }
  | { kind: "prefix"; value: string }
  | { kind: "range"; from: number; to: number; len: number };

export interface ParsedRules {
  rules: PostcodeRule[];
  /** Lines that could not be read (1-based line numbers + text). */
  invalid: { line: number; text: string }[];
}

export function normalizePostcode(input: string): string {
  return String(input ?? "")
    .toUpperCase()
    .replace(/[\s\-‐-―_.]/g, "");
}

const RANGE_RE = /^\s*([0-9][0-9\s]*)\s*(?:\.\.|[-‐-―~])\s*([0-9][0-9\s]*)\s*$/;

export function parseRule(raw: string): PostcodeRule | null {
  const text = raw.trim();
  if (!text) return null;
  const range = RANGE_RE.exec(text);
  if (range) {
    const a = range[1].replace(/\s/g, "");
    const b = range[2].replace(/\s/g, "");
    // Same-length numeric bounds = a range. Different lengths (e.g. Japanese
    // "123-4567") are an exact postcode written with a dash.
    if (a.length === b.length) {
      const from = Number(a);
      const to = Number(b);
      return { kind: "range", from: Math.min(from, to), to: Math.max(from, to), len: a.length };
    }
  }
  if (text.endsWith("*")) {
    const value = normalizePostcode(text.slice(0, -1));
    if (!value || /\*/.test(value)) return null;
    return { kind: "prefix", value };
  }
  const value = normalizePostcode(text);
  if (!value || /[^A-Z0-9]/.test(value)) return null;
  return { kind: "exact", value };
}

/** Parse rules from textarea lines (also accepts commas and semicolons). */
export function parseRules(lines: string[] | string): ParsedRules {
  const list = Array.isArray(lines) ? lines : lines.split(/\r?\n/);
  const rules: PostcodeRule[] = [];
  const invalid: ParsedRules["invalid"] = [];
  list.forEach((line, i) => {
    for (const part of line.split(/[,;]/)) {
      if (!part.trim()) continue;
      const r = parseRule(part);
      if (r) rules.push(r);
      else invalid.push({ line: i + 1, text: part.trim() });
    }
  });
  return { rules, invalid };
}

/**
 * The shopper's postcode and the forms it may be written in. A US ZIP+4
 * ("10115-1234") also counts as its 5-digit ZIP ("10115").
 */
function forms(postcode: string): string[] {
  const pc = normalizePostcode(postcode);
  if (!pc) return [];
  return /^\d{9}$/.test(pc) ? [pc, pc.slice(0, 5)] : [pc];
}

/** UK-style postcodes (also Jersey, Guernsey, Isle of Man): "SW1A 1AA" = outward "SW1A" + inward "1AA". */
const UK_STYLE = new Set(["GB", "UK", "JE", "GG", "IM"]);
const UK_FULL = /^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/;

/**
 * UK prefixes follow the postcode's structure, not its letters: "E*" is the E area (E1, E14),
 * not EC or EN; "SW1*" is the SW1 district (SW1A, SW1P), not SW10–SW19. Longer prefixes that
 * reach into the inward code ("SW1A 1*") compare letter by letter.
 */
function ukPrefixMatches(prefix: string, pc: string): boolean {
  const outward = UK_FULL.exec(pc)?.[1] ?? pc;
  if (/^[A-Z]{1,2}$/.test(prefix)) return /^[A-Z]+/.exec(outward)?.[0] === prefix;
  if (prefix.length > outward.length) return pc.startsWith(prefix);
  if (!outward.startsWith(prefix)) return false;
  if (outward === prefix) return true;
  // "SW1" → "SW1A" (a sub-district letter) yes; "SW1" → "SW10" (another district) no.
  return /\d$/.test(prefix) && /^[A-Z]$/.test(outward[prefix.length]);
}

export function matchRule(rule: PostcodeRule, postcode: string, country?: string | null): boolean {
  const uk = UK_STYLE.has((country ?? "").toUpperCase());
  return forms(postcode).some((pc) => {
    switch (rule.kind) {
      case "exact":
        return pc === rule.value;
      case "prefix":
        return uk ? ukPrefixMatches(rule.value, pc) : pc.startsWith(rule.value);
      case "range": {
        if (!/^\d+$/.test(pc) || pc.length !== rule.len) return false;
        const n = Number(pc);
        return n >= rule.from && n <= rule.to;
      }
    }
  });
}

export function matchesAny(lines: string[], postcode: string, country?: string | null): boolean {
  const { rules } = parseRules(lines);
  return rules.some((r) => matchRule(r, postcode, country));
}
