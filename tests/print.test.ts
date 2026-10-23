import { describe, expect, it } from "vitest";
import { productionSheet } from "../app/services/print.server";

const t = (key: string) => key;

describe("printable sheets", () => {
  it("set the page direction from the language", () => {
    expect(productionSheet(t, "en", "today", [])).toContain('<html lang="en" dir="ltr">');
    expect(productionSheet(t, "ar", "today", [])).toContain('<html lang="ar" dir="rtl">');
    expect(productionSheet(t, "he-IL", "today", [])).toContain('dir="rtl"');
  });
});
