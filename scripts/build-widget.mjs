/**
 * Builds the storefront widget into the theme app extension:
 *   extensions/pickday-theme/assets/pickday.js        (widget, minified)
 *   extensions/pickday-theme/assets/pickday.css
 *   extensions/pickday-theme/assets/pickday-i18n-<locale>.js  (one per language, loaded lazily)
 * Fails if the gzipped widget (js + css) is over the 35 KB budget.
 */
import { build } from "esbuild";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "extensions/pickday-theme/assets");
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(root, "widget/src/main.ts")],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020", "safari15", "chrome90", "firefox90"],
  outfile: join(out, "pickday.js"),
  legalComments: "none",
  logLevel: "warning",
});
await build({
  entryPoints: [join(root, "widget/src/styles.css")],
  bundle: true,
  minify: true,
  outfile: join(out, "pickday.css"),
  logLevel: "warning",
});

const localesDir = join(root, "locales/storefront");
const locales = [];
for (const f of readdirSync(localesDir)) {
  if (!f.endsWith(".json") || f.startsWith("_")) continue;
  const locale = f.replace(/\.json$/, "");
  const msgs = JSON.parse(readFileSync(join(localesDir, f), "utf8"));
  writeFileSync(join(out, `pickday-i18n-${locale}.js`), `(window.PickdayI18n=window.PickdayI18n||{})[${JSON.stringify(locale)}]=${JSON.stringify(msgs)};\n`);
  locales.push(locale);
}

const gz = (p) => gzipSync(readFileSync(p)).length;
const js = gz(join(out, "pickday.js"));
const css = gz(join(out, "pickday.css"));
const kb = (n) => (n / 1024).toFixed(1) + " KB";
console.log(`[build-widget] pickday.js ${kb(js)} gz, pickday.css ${kb(css)} gz, total ${kb(js + css)} (budget 35 KB); ${locales.length} locale files`);
if (js + css > 35 * 1024) {
  console.error("[build-widget] widget is over the 35 KB gzip budget");
  process.exit(1);
}


// Checkout Function messages: only the keys the Functions use, every language.
const fnKeys = (k) => k.startsWith("validation.") || k.startsWith("checkout.") || k.startsWith("method.") || k === "area.notCovered";
const fnMessages = {};
for (const locale of locales) {
  const msgs = JSON.parse(readFileSync(join(localesDir, `${locale}.json`), "utf8"));
  fnMessages[locale] = Object.fromEntries(Object.entries(msgs).filter(([k]) => fnKeys(k)));
}
for (const fn of ["pickday-validation", "pickday-delivery"]) {
  writeFileSync(join(root, `extensions/${fn}/src/messages.generated.json`), JSON.stringify(fnMessages) + "\n");
}
const tyMessages = {};
for (const locale of locales) {
  const msgs = JSON.parse(readFileSync(join(localesDir, `${locale}.json`), "utf8"));
  tyMessages[locale] = Object.fromEntries(Object.entries(msgs).filter(([k]) => k.startsWith("thankyou.") || k.startsWith("calendar.event")));
}
writeFileSync(join(root, "extensions/pickday-thank-you/src/messages.generated.json"), JSON.stringify(tyMessages) + "\n");
console.log(`[build-widget] Function messages: ${(JSON.stringify(fnMessages).length / 1024).toFixed(1)} KB`);
