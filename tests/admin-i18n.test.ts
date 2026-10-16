import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { placeholders } from "../core/i18n/format";
import { ADMIN_LANGS } from "../app/i18n";

const dir = path.join(__dirname, "../app/i18n/admin");
const en: Record<string, string> = JSON.parse(fs.readFileSync(path.join(dir, "en.json"), "utf8"));

function usedKeys(): string[] {
  const keys = new Set<string>();
  const walk = (d: string) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?)$/.test(f)) for (const m of fs.readFileSync(p, "utf8").matchAll(/\bt\(\s*"([a-zA-Z0-9_.-]+)"/g)) keys.add(m[1]);
    }
  };
  walk(path.join(__dirname, "../app"));
  return [...keys];
}

describe("admin translations", () => {
  it("every key used in the admin exists in English", () => {
    expect(usedKeys().filter((k) => !(k in en))).toEqual([]);
  });

  for (const lang of ADMIN_LANGS.filter((l) => l !== "en")) {
    const msgs: Record<string, string> = JSON.parse(fs.readFileSync(path.join(dir, `${lang}.json`), "utf8"));
    // Languages are translated in one pass once the English source is final (P7).
    it.skipIf(!Object.keys(msgs).length)(`${lang}: complete, same placeholders, no unknown keys`, () => {
      expect(Object.keys(msgs).filter((k) => !(k in en))).toEqual([]);
      expect(Object.keys(en).filter((k) => !(k in msgs))).toEqual([]);
      const bad = Object.keys(msgs).filter((k) => JSON.stringify(placeholders(msgs[k])) !== JSON.stringify(placeholders(en[k])));
      expect(bad).toEqual([]);
    });
  }
});
