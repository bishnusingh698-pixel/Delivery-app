/**
 * Rules Shopify only checks at `shopify app deploy` (each one refused a real deploy or is
 * documented as a deploy-time check), checked here so they fail in CI instead:
 * - one admin action target per extension, and no admin block in the same extension as an action;
 * - every "t:key" in an extension config has that key in locales/en.default.json;
 * - UI extension bundles stay under 64 KB compressed;
 * - theme app extension block names are at most 25 characters.
 * (Function input query cost and size: tests/function-query-cost.test.ts.)
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { buildSync } from "esbuild";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const exts = readdirSync(join(root, "extensions")).filter((d) => existsSync(join(root, "extensions", d, "shopify.extension.toml")));
const toml = (d: string) => readFileSync(join(root, "extensions", d, "shopify.extension.toml"), "utf8");
const targetsOf = (d: string) => [...toml(d).matchAll(/^\s*target\s*=\s*"([^"]+)"/gm)].map((m) => m[1]);
const modulesOf = (d: string) => [...new Set([...toml(d).matchAll(/^\s*module\s*=\s*"([^"]+)"/gm)].map((m) => m[1]))];

describe("Shopify deploy rules", () => {
  it("admin extensions: at most one action target, and never a block next to an action", () => {
    for (const d of exts) {
      const t = targetsOf(d).filter((x) => x.startsWith("admin."));
      const actions = t.filter((x) => /\.action\.render$|\.selection-action\.render$/.test(x));
      const blocks = t.filter((x) => /\.block\.render$/.test(x));
      expect(actions.length, `${d}: ${actions.join(", ")}`).toBeLessThanOrEqual(1);
      if (actions.length) expect(blocks, `${d}: block and action together`).toEqual([]);
    }
  });

  it("every t: reference in an extension config is translated in en.default.json", () => {
    for (const d of exts) {
      const refs = [...toml(d).matchAll(/"t:([^"]+)"/g)].map((m) => m[1]);
      if (!refs.length) continue;
      const file = join(root, "extensions", d, "locales", "en.default.json");
      expect(existsSync(file), `${d}: locales/en.default.json`).toBe(true);
      const keys = JSON.parse(readFileSync(file, "utf8"));
      for (const r of refs) expect(keys[r], `${d}: "${r}"`).toBeTruthy();
    }
  });

  it("UI extension bundles stay under 64 KB compressed", () => {
    for (const d of exts.filter((x) => /type\s*=\s*"ui_extension"/.test(toml(x)))) {
      for (const m of modulesOf(d)) {
        const out = buildSync({ entryPoints: [join(root, "extensions", d, m)], bundle: true, minify: true, format: "esm", jsx: "automatic", jsxImportSource: "preact", write: false, logLevel: "silent" });
        const gz = gzipSync(out.outputFiles[0].contents).length;
        expect(gz, `${d} ${m}`).toBeLessThan(64 * 1024);
      }
    }
  });

  it("theme app extension block names are at most 25 characters", () => {
    const dir = join(root, "extensions", "pickday-theme");
    const names = JSON.parse(readFileSync(join(dir, "locales", "en.default.schema.json"), "utf8"));
    for (const f of readdirSync(join(dir, "blocks"))) {
      const schema = JSON.parse(/\{%\s*schema\s*%\}([\s\S]*?)\{%\s*endschema\s*%\}/.exec(readFileSync(join(dir, "blocks", f), "utf8"))![1]);
      const name: string = schema.name.startsWith("t:") ? schema.name.slice(2).split(".").reduce((o: any, k: string) => o?.[k], names) : schema.name;
      expect(name?.length, `${f}: "${name}"`).toBeLessThanOrEqual(25);
    }
  });
});
