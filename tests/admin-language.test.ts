/**
 * Admin language choice (D-82): "Automatic" follows each person's Shopify admin language (as
 * before); a language chosen in Pickday wins for everyone in the store, on every page and in
 * everything the server writes (printouts, CSV, daily summary, calendar feed).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_LANGS, ADMIN_LANGUAGE_NAMES, chosenAdminLang, effectiveAdminLang } from "../app/i18n";
import { FLAG_OF } from "../app/components/flags";
import { adminT } from "../app/services/admin-t.server";

describe("admin language", () => {
  it("Automatic: Shopify's language for this person, then the last one used", () => {
    expect(effectiveAdminLang(null, "es-419", "fr")).toBe("es");
    expect(effectiveAdminLang(null, null, "fr")).toBe("fr");
    expect(effectiveAdminLang(null, "xx", null)).toBe("en");
  });

  it("a language chosen in Pickday wins over Shopify's", () => {
    expect(effectiveAdminLang("de", "ja", "fr")).toBe("de");
  });

  it("only known languages can be chosen; anything else means Automatic", () => {
    expect(chosenAdminLang("nl")).toBe("nl");
    expect(chosenAdminLang("auto")).toBeNull();
    expect(chosenAdminLang("xx")).toBeNull();
    expect(chosenAdminLang(undefined)).toBeNull();
    expect(chosenAdminLang({ x: 1 })).toBeNull();
  });

  it("server-written texts follow the choice, then the person's language, then the last used", async () => {
    expect((await adminT({ adminLocale: "en", flags: { adminLang: "it" } }, "ja")).lang).toBe("it");
    expect((await adminT({ adminLocale: "en", flags: {} }, "ja")).lang).toBe("ja");
    expect((await adminT({ adminLocale: "fr" })).lang).toBe("fr");
    expect((await adminT({ adminLocale: "fr", flags: { adminLang: "auto" } }, "en-US")).lang).toBe("en");
  });

  it("every language has its own name and a flag, and its translation file exists", () => {
    for (const l of ADMIN_LANGS) {
      expect(ADMIN_LANGUAGE_NAMES[l]).toBeTruthy();
      expect(FLAG_OF[l]).toBeTruthy();
      expect(() => readFileSync(join(__dirname, `../app/i18n/admin/${l}.json`))).not.toThrow();
    }
  });
});
