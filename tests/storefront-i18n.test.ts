/**
 * Automated checks for the 28 storefront languages (see TRANSLATIONS.md):
 * same keys as English, same placeholders, every plural form the language
 * needs, no untranslated English left over, and lengths within limits.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { format, parse, placeholders, pluralKeys } from "../core/i18n/format";
import { STOREFRONT_LOCALES } from "../core/i18n/locales";

const dir = join(__dirname, "../locales/storefront");
const load = (l: string): Record<string, string> => JSON.parse(readFileSync(join(dir, `${l}.json`), "utf8"));
const en = load("en");
const context: Record<string, { where: string; max?: number }> = JSON.parse(readFileSync(join(dir, "_context.json"), "utf8"));
const others = STOREFRONT_LOCALES.filter((l) => l !== "en");

/** Keys whose text may legitimately equal English (brand names, pure placeholders). */
const SAME_OK = new Set(["thankyou.google", "duration.hm", "duration.m", "fee", "checkout.renameDate", "checkout.renamePickup"]);
/** Words that are spelled the same as English in that language. */
const SAME_OK_IN: Record<string, string[]> = { fr: ["snippet.date"], nl: ["area.postcodeLabel"] };

/** Sample values used to measure lengths. Long-ish real values. */
function samples(locale: string): Record<string, string | number> {
  const d = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 8, 30)));
  return {
    date: d,
    nextDate: d,
    time: "10:00–12:00",
    location: "Main Street",
    method: en["method.delivery"],
    amount: "€12.50",
    count: 3,
    product: "Birthday cake",
    postcode: "SW1A 1AA",
    area: "North",
    zone: "Europe/Berlin",
    name: "Christmas Day",
    duration: "2h 15m",
    hours: 2,
    minutes: 15,
    when: "other",
    brand: "Pickday",
    url: "",
  };
}

describe("storefront translations", () => {
  it("has a file for every supported language and nothing else", () => {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
    expect(files).toEqual([...STOREFRONT_LOCALES].sort());
  });

  it("every English key has translator context", () => {
    expect(Object.keys(en).filter((k) => !context[k])).toEqual([]);
  });

  for (const locale of others) {
    describe(locale, () => {
      const msgs = load(locale);
      const cats = new Set<string>(["other"]);
      for (let n = 0; n <= 1000; n++) cats.add(new Intl.PluralRules(locale).select(n));

      it("has exactly the English keys", () => {
        expect(Object.keys(msgs).sort()).toEqual(Object.keys(en).sort());
      });

      it("parses and keeps every placeholder", () => {
        for (const k of Object.keys(en)) {
          expect(() => parse(msgs[k]), `${k} parses`).not.toThrow();
          expect(placeholders(msgs[k]), k).toEqual(placeholders(en[k]));
        }
      });

      it("has every plural form the language needs", () => {
        for (const k of Object.keys(en)) {
          for (const keys of pluralKeys(msgs[k])) {
            const missing = [...cats].filter((c) => !keys.includes(c));
            expect(missing, `${k} missing plural forms`).toEqual([]);
          }
        }
      });

      it("has no untranslated English left", () => {
        const same = Object.keys(en).filter((k) => !SAME_OK.has(k) && !SAME_OK_IN[locale]?.includes(k) && msgs[k] === en[k] && /[A-Za-z]{3,}/.test(en[k].replace(/\{[^{}]*\}/g, "")));
        expect(same).toEqual([]);
      });

      it("fits the length limits", () => {
        const values = samples(locale);
        const over: string[] = [];
        for (const k of Object.keys(en)) {
          const max = context[k]?.max;
          if (!max) continue;
          for (const when of ["today", "tomorrow", "other"]) {
            const out = format(msgs[k], { ...values, when }, { locale });
            // Templates that are only placeholders can't be shortened; allow 20% slack for long sample values.
            if ([...out].length > Math.ceil(max * 1.2)) over.push(`${k} (${[...out].length}/${max}): ${out}`);
          }
        }
        expect([...new Set(over)]).toEqual([]);
      });
    });
  }
});
