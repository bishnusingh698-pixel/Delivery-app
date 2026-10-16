// Lists admin translation keys used in app/ (static t("...") calls) that are missing from en.json.
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const en = JSON.parse(fs.readFileSync(path.join(root, "app/i18n/admin/en.json"), "utf8"));
const used = new Set();
function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|jsx?)$/.test(f)) {
      const src = fs.readFileSync(p, "utf8");
      for (const m of src.matchAll(/\bt\(\s*"([a-zA-Z0-9_.-]+)"/g)) used.add(m[1]);
    }
  }
}
walk(path.join(root, "app"));
export const missing = [...used].filter((k) => !(k in en)).sort();
export const usedKeys = used;
if (process.argv[1].endsWith("admin-keys.mjs")) console.log(missing.join("\n"));
