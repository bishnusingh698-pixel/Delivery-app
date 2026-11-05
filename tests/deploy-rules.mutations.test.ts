/**
 * Proof that every deploy rule in tests/deploy/rules.ts catches what it claims to: each case copies
 * the app, breaks it in one way (the four real deploy failures from AUDIT.md's deploy history
 * included), and expects that rule to report it. The copy lives under node_modules/.cache so
 * esbuild resolves the same packages; it's deleted afterwards.
 */
import { appendFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { themeCheckRun } from "@shopify/theme-check-node";
import { afterAll, describe, expect, it } from "vitest";
import { ALL_RULES, flowFields, payloadProblems, type Rule } from "./deploy/rules";
import { FLOW_HANDLES, orderPayload } from "../app/services/flow-payload";
import { FUNCTION_METAFIELD_MAX_BYTES, toFunctionConfig, utf8Bytes } from "../core/publish";
import { config, settings } from "./helpers";
import { queryCost } from "./deploy/query-cost";

const root = join(__dirname, "..");
const scratch = join(root, "node_modules/.cache/pickday-deploy-mutations");
const SKIP = /(^|\/)(node_modules|dist|generated)(\/|$)/;

function copyApp(name: string): string {
  const dir = join(scratch, name.replace(/[^a-z0-9]+/gi, "-").slice(0, 60));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "app"), { recursive: true });
  for (const f of ["shopify.app.toml", "render.yaml", "app/shopify.server.ts"]) cpSync(join(root, f), join(dir, f));
  cpSync(join(root, "app/routes"), join(dir, "app/routes"), { recursive: true });
  // Extensions import the shared date engine and texts.
  for (const d of ["core", "locales"]) cpSync(join(root, d), join(dir, d), { recursive: true });
  cpSync(join(root, "extensions"), join(dir, "extensions"), { recursive: true, filter: (src) => !SKIP.test(src.slice(root.length)) });
  return dir;
}

const edit = (dir: string, file: string, fn: (s: string) => string) => {
  const p = join(dir, file);
  const before = readFileSync(p, "utf8");
  const after = fn(before);
  if (after === before) throw new Error(`mutation changed nothing in ${file}`);
  writeFileSync(p, after);
};
/** A module of incompressible data (random bytes), `kb` kilobytes of JS. */
const big = (kb: number) => `export const blob = "${randomBytes(kb * 768).toString("base64")}";\n`;

const ruleNamed = (name: string): Rule => {
  for (const g of Object.values(ALL_RULES)) if (g[name]) return g[name];
  throw new Error(`no rule "${name}"`);
};

/** [rule, what breaks it] — every synchronous rule appears at least once (checked at the end). */
const CASES: [string, (dir: string) => void][] = [
  // shopify.app.toml
  ["app name is 1 to 30 characters", (d) => edit(d, "shopify.app.toml", (s) => s.replace('name = "Pickday: Delivery Date Picker"', 'name = "Pickday: Delivery Date Picker Pro"'))],
  ['client_id is "" in the repository (the deploy command fills it)', (d) => edit(d, "shopify.app.toml", (s) => s.replace('client_id = ""', 'client_id = "cde5d05cde6e6ec6b6291e09d71c8663"'))],
  ["application_url and redirect_urls are https, redirects under the app URL", (d) => edit(d, "shopify.app.toml", (s) => s.replace("https://pickday.onrender.com/auth/callback", "http://elsewhere.example/auth/callback"))],
  ["embedded app, config deployed with the extensions", (d) => edit(d, "shopify.app.toml", (s) => s.replace("embedded = true", "embedded = false"))],
  ["webhook API version is supported and matches app/shopify.server.ts", (d) => edit(d, "shopify.app.toml", (s) => s.replace(/api_version = "\d{4}-\d\d"/, 'api_version = "2025-01"'))],
  ["webhook subscriptions: valid topics and URIs, no duplicates, a route for each", (d) => edit(d, "shopify.app.toml", (s) => s.replace('uri = "/webhooks/shop/update"', 'uri = "/webhooks/shop/updated"'))],
  ["webhook subscriptions: valid topics and URIs, no duplicates, a route for each", (d) => edit(d, "shopify.app.toml", (s) => s.replace('"orders/edited"', '"orders/editted"'))],
  ["the three mandatory compliance webhooks, each once", (d) => edit(d, "shopify.app.toml", (s) => s.replace(', "shop/redact" ]', " ]"))],
  ["access scopes are valid, minimal and the same in render.yaml", (d) => edit(d, "shopify.app.toml", (s) => s.replace('scopes = "read_orders,', 'scopes = "write_script_tags,read_orders,'))],
  // every extension
  ["every shopify.extension.toml parses", (d) => appendFileSync(join(d, "extensions/pickday-admin/shopify.extension.toml"), '\n[[extensions.targeting]\nmodule = "x"\n')],
  ["handles are valid and unique", (d) => edit(d, "extensions/pickday-draft-action/shopify.extension.toml", (s) => s.replace('handle = "pickday-draft-action"', 'handle = "pickday-admin"'))],
  ["at most one theme app extension", (d) => cpSync(join(d, "extensions/pickday-theme"), join(d, "extensions/pickday-theme-copy"), { recursive: true })],
  ["locale files: one default, none empty, UTF-8 JSON", (d) => writeFileSync(join(d, "extensions/pickday-thank-you/locales/fr.json"), "")],
  ['every "t:" name in an extension config is in its default locale', (d) => edit(d, "extensions/pickday-validation/locales/en.default.json", (s) => s.replace('"description"', '"descr"'))],
  ["UI extensions and Functions use a supported API version (UI: 2026-01 or later)", (d) => edit(d, "extensions/pickday-admin/shopify.extension.toml", (s) => s.replace('api_version = "2026-07"', 'api_version = "2025-10"'))],
  // UI extensions (deploy errors 2 and 3 of the deploy history)
  ["UI targets are unique and their modules exist", (d) => edit(d, "extensions/pickday-order-block/shopify.extension.toml", (s) => s.replace("./src/OrderBlock.tsx", "./src/Missing.tsx"))],
  ["UI modules export a default function", (d) => edit(d, "extensions/pickday-order-block/src/OrderBlock.tsx", (s) => s.replace("export default async () =>", "export const run = async () =>"))],
  ["admin: at most one action target per extension", (d) => appendFileSync(join(d, "extensions/pickday-admin/shopify.extension.toml"), '\n[[extensions.targeting]]\nmodule = "./src/ScheduleAction.tsx"\ntarget = "admin.draft-order-details.action.render"\n')],
  ["admin: never a block next to an action", (d) => appendFileSync(join(d, "extensions/pickday-admin/shopify.extension.toml"), '\n[[extensions.targeting]]\nmodule = "./src/ScheduleAction.tsx"\ntarget = "admin.order-details.block.render"\n')],
  ["customer account: an order action modal comes with its menu item", (d) => edit(d, "extensions/pickday-customer-change/shopify.extension.toml", (s) => s.replace('target = "customer-account.order.action.menu-item.render"', 'target = "customer-account.order-status.block.render"'))],
  ["UI extension names are 5 to 30 characters in every language", (d) => edit(d, "extensions/pickday-thank-you/locales/en.default.json", (s) => s.replace('"Pickday delivery date"', '"Pickday delivery date and time slot"'))],
  ["UI extension bundles are under 64 KB compressed", (d) => {
    writeFileSync(join(d, "extensions/pickday-order-block/src/blob.ts"), big(100));
    edit(d, "extensions/pickday-order-block/src/OrderBlock.tsx", (s) => `import { blob } from "./blob";\nconsole.log(blob);\n${s}`);
  }],
  ["capabilities are known, and extensions that fetch declare network_access", (d) => edit(d, "extensions/pickday-customer-change/shopify.extension.toml", (s) => s.replace("network_access = true", "network_access = false"))],
  ["every translation key used in UI code is in en.default.json", (d) => edit(d, "extensions/pickday-admin/locales/en.default.json", (s) => s.replace('"override"', '"overrides"'))],
  ["@shopify/ui-extensions matches each extension's api_version", (d) => edit(d, "extensions/pickday-thank-you/package.json", (s) => s.replace('"2026.10.x"', '"2026.7.x"'))],
  // Functions (deploy error 1 is in function-query-cost.test.ts)
  ["Functions: known target, input query file, wasm output path", (d) => edit(d, "extensions/pickday-validation/shopify.extension.toml", (s) => s.replace('target = "cart.validations.generate.run"', 'target = "cart.validations.run"'))],
  ["Functions: each export is kebab-case and exported from src/index.ts", (d) => edit(d, "extensions/pickday-delivery/shopify.extension.toml", (s) => s.replace('export = "cart-delivery-options-transform-run"', 'export = "cart-delivery-options-run"'))],
  ["Functions: input variables declared in one place", (d) => edit(d, "extensions/pickday-validation/shopify.extension.toml", (s) => s.replace('export = "cart-validations-generate-run"', 'export = "cart-validations-generate-run"\n  input_variables = { namespace = "$app:pickday", key = "vars" }'))],
  ["Functions: @shopify/shopify_function is a version the CLI can build", (d) => edit(d, "extensions/pickday-delivery/package.json", (s) => s.replace('"^2.0.1"', '"^3.0.0"'))],
  ["Functions: input queries are valid against schema.graphql", (d) => edit(d, "extensions/pickday-validation/src/run.graphql", (s) => s.replace("buyerJourney {\n    step", "buyerJourney {\n    stepName"))],
  ["Functions: bundled JS stays under 128 KB (half the 256 KB wasm limit)", (d) => {
    writeFileSync(join(d, "extensions/pickday-delivery/src/blob.ts"), big(140));
    edit(d, "extensions/pickday-delivery/src/index.ts", (s) => `import { blob } from "./blob";\nconsole.log(blob);\n${s}`);
  }],
  // Flow triggers (deploy error 4: the 149-character description)
  ["Flow triggers: name, and a description of at most 140 characters", (d) => edit(d, "extensions/pickday-flow-daily/shopify.extension.toml", (s) => s.replace(/description = ".*"/, 'description = "Once a day at the time set in Pickday: the orders scheduled for today or tomorrow. Add a Send internal email action to get a free daily summary."'))],
  ["Flow triggers: field types and keys Flow accepts", (d) => edit(d, "extensions/pickday-flow-daily/shopify.extension.toml", (s) => s.replace('type = "number_decimal"\n  key = "Orders"', 'type = "number_integer"\n  key = "Orders"'))],
  ["Flow triggers: field types and keys Flow accepts", (d) => edit(d, "extensions/pickday-flow-scheduled/shopify.extension.toml", (s) => s.replace('key = "Time slot"', 'key = "Time_slot"'))],
  // theme app extension
  ["theme extension: only supported folders and file types", (d) => writeFileSync(join(d, "extensions/pickday-theme/assets/notes.txt"), "x")],
  ["theme extension: under 10 MB, Liquid under 500 KB", (d) => writeFileSync(join(d, "extensions/pickday-theme/snippets/huge.liquid"), "x".repeat(520 * 1024))],
  ["theme blocks: at most 30, valid schema, names up to 25 characters, known targets", (d) => edit(d, "extensions/pickday-theme/locales/en.default.schema.json", (s) => s.replace('"name": "Pickday delivery estimate"', '"name": "Pickday delivery date estimate"'))],
  ["theme extension: every translation key exists", (d) => edit(d, "extensions/pickday-theme/blocks/cart.liquid", (s) => s.replace("'blocks.cart.notReady' | t", "'blocks.cart.notReadyYet' | t"))],
  ["theme extension: every asset_url file exists", (d) => edit(d, "extensions/pickday-theme/blocks/app-embed.liquid", (s) => s.replace("'pickday.css' | asset_url", "'pickday.min.css' | asset_url"))],
];

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("each deploy rule catches a broken app", () => {
  CASES.forEach(([rule, mutate], i) => {
    it(`${rule} (case ${i + 1})`, () => {
      const dir = copyApp(`${i}-${rule}`);
      try {
        mutate(dir);
        expect(ruleNamed(rule)(dir).length, "the rule should report the break").toBeGreaterThan(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  it("every rule has a case", () => {
    const covered = new Set(CASES.map(([r]) => r));
    const all = Object.values(ALL_RULES).flatMap((g) => Object.keys(g));
    expect(all.filter((r) => !covered.has(r))).toEqual([]);
  });
});

describe("the other deploy checks catch a broken app", () => {
  it("theme-check reports a Liquid syntax error", async () => {
    const dir = copyApp("theme-check");
    try {
      edit(dir, "extensions/pickday-theme/blocks/cart.liquid", (s) => s.replace("{%- endif -%}", ""));
      const run = await themeCheckRun(join(dir, "extensions/pickday-theme"));
      expect(run.offenses.filter((o) => o.severity === 0).length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("a Flow payload that doesn't match its trigger is reported", () => {
    const dir = copyApp("flow-payload");
    try {
      edit(dir, "extensions/pickday-flow-rescheduled/shopify.extension.toml", (s) => s.replace('key = "Pickup location"', 'key = "Location"'));
      const p = orderPayload({ orderId: "1", method: "pickup", date: "2026-11-06", slotLabel: null, locationId: null }, settings());
      expect(payloadProblems(flowFields(dir, FLOW_HANDLES.rescheduled), p).length).toBeGreaterThan(0);
      expect(payloadProblems(flowFields(dir, FLOW_HANDLES.rescheduled), { ...p, order_id: "1" }).length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("without the byte budget, a big store's Function config is over Shopify's 10,000-byte limit", () => {
    const c = config((s) => {
      for (let i = 0; i < 60; i++) s.closures.push({ id: `c${i}`, label: `Closed for the staff holiday number ${i}`, start: "2026-12-01", end: "2026-12-02", yearly: true, methods: "all", locations: "all", kind: "blackout" });
      for (let i = 0; i < 6; i++) s.locations.push({ id: `l${i}`, shopifyLocationId: null, name: `Shop ${i}`, address: "", mapUrl: "", instructions: {}, timeZone: null, enabled: true, countries: "all", custom: { schedule: JSON.parse(JSON.stringify(s.methods.pickup.schedule)), capacity: JSON.parse(JSON.stringify(s.methods.pickup.capacity)) } });
    });
    expect(utf8Bytes(toFunctionConfig(c))).toBeGreaterThan(FUNCTION_METAFIELD_MAX_BYTES);
  });

  it("the input query cost model rejects two more time checks", () => {
    const q = readFileSync(join(root, "extensions/pickday-validation/src/run.graphql"), "utf8").replace("cutoffB: timeAfter(time: $cutoffB)", "cutoffB: timeAfter(time: $cutoffB)\n      c3: timeAfter(time: $cutoffB)\n      c4: timeAfter(time: $cutoffB)");
    expect(queryCost(q)).toBeGreaterThan(28);
  });
});
