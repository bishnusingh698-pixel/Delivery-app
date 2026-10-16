import { describe, expect, it } from "vitest";
import {
  bracesBalanced,
  checkOverride,
  effectiveTexts,
  groupKeys,
  matchesSearch,
  overrideCount,
  placeholderTokens,
  setOverride,
  textIssues,
} from "../core/texts-ui";

describe("checkOverride", () => {
  it("accepts an empty override (use default)", () => {
    expect(checkOverride("Delivery on {date}", "").ok).toBe(true);
    expect(checkOverride("Delivery on {date}", "   ").ok).toBe(true);
  });

  it("accepts the same placeholders in any order", () => {
    expect(checkOverride("Delivery on {date}, {time}", "{time} – we bring it on {date}").ok).toBe(true);
  });

  it("reports missing and extra placeholders", () => {
    const c = checkOverride("Delivery on {date}, {time}", "Delivery on {day}");
    expect(c.ok).toBe(false);
    expect(c.missing).toEqual(["{date}", "{time}"]);
    expect(c.extra).toEqual(["{day}"]);
  });

  it("reports unbalanced braces", () => {
    const c = checkOverride("Delivery on {date}", "Delivery on {date");
    expect(c.ok).toBe(false);
    expect(c.syntax).toBe(true);
    expect(bracesBalanced("a } b {")).toBe(false);
  });

  it("checks plural texts by placeholder name only", () => {
    const def = "{count, plural, one {# spot left} other {# spots left}}";
    expect(checkOverride(def, "{count, plural, one {Only # left!} other {# left}}").ok).toBe(true);
    expect(checkOverride(def, "{count} left").ok).toBe(true);
    expect(checkOverride(def, "Few spots left").missing).toEqual(["{count}"]);
    expect(placeholderTokens("Order within {duration} {when, select, today {today} other {on {date}}}")).toEqual(["{date}", "{duration}", "{when}"]);
  });

  it("flags texts longer than recommended without failing", () => {
    const c = checkOverride("Pickup", "A very long pickup label", 10);
    expect(c.ok).toBe(true);
    expect(c.tooLong).toBe(true);
  });
});

describe("keys", () => {
  it("groups by prefix, keeping bare keys with their group or in general", () => {
    expect(groupKeys(["heading", "method.delivery", "method.pickup", "fee", "fee.label", "change"])).toEqual([
      { prefix: "general", keys: ["heading", "change"] },
      { prefix: "method", keys: ["method.delivery", "method.pickup"] },
      { prefix: "fee", keys: ["fee", "fee.label"] },
    ]);
  });

  it("searches key, texts and description", () => {
    expect(matchesSearch("", "x")).toBe(true);
    expect(matchesSearch("PICKUP", "method.pickup")).toBe(true);
    expect(matchesSearch("abholung", "method.pickup", "Abholung")).toBe(true);
    expect(matchesSearch("zzz", "method.pickup", "Pickup", undefined)).toBe(false);
  });
});

describe("overrides", () => {
  it("sets and clears overrides, dropping empty languages", () => {
    let t = setOverride({}, "de", "heading", "Wann?");
    expect(t).toEqual({ de: { heading: "Wann?" } });
    t = setOverride(t, "de", "change", "Ändern");
    expect(overrideCount(t, "de")).toBe(2);
    expect(overrideCount(t, "de", new Set(["heading"]))).toBe(1);
    t = setOverride(t, "de", "heading", "");
    t = setOverride(t, "de", "change", "");
    expect(t).toEqual({});
  });

  it("layers overrides over built-in and English texts", () => {
    const out = effectiveTexts({ heading: "Wann?" }, { heading: "When?", change: "Change" }, { change: "Ändern", heading: " " });
    expect(out).toEqual({ heading: "Wann?", change: "Ändern" });
  });

  it("lists broken overrides for the save check", () => {
    const defs: Record<string, Record<string, string>> = { de: { "summary.delivery": "Lieferung am {date}", heading: "Wann?" } };
    const issues = textIssues({ de: { "summary.delivery": "Lieferung", heading: "Wann genau?", unknown: "{x" } }, (l) => defs[l] ?? {});
    expect(issues.map((i) => i.key)).toEqual(["summary.delivery"]);
  });
});
