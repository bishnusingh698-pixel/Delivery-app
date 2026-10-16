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

export function matchRule(rule: PostcodeRule, postcode: string): boolean {
  const pc = normalizePostcode(postcode);
  if (!pc) return false;
  switch (rule.kind) {
    case "exact":
      return pc === rule.value;
    case "prefix":
      return pc.startsWith(rule.value);
    case "range": {
      if (!/^\d+$/.test(pc) || pc.length !== rule.len) return false;
      const n = Number(pc);
      return n >= rule.from && n <= rule.to;
    }
  }
}

export function matchesAny(lines: string[], postcode: string): boolean {
  const { rules } = parseRules(lines);
  return rules.some((r) => matchRule(r, postcode));
}
