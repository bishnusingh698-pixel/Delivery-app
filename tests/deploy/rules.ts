/**
 * Shopify's deploy-time rules, checked from the repository so CI fails before `shopify app deploy`
 * does. Each rule takes the folder to check (the repo, or a broken copy in
 * tests/deploy-rules.mutations.test.ts) and returns its problems; [] = passes.
 *
 * Sources (full list with links in AUDIT.md, round 7):
 *  [CLI]   Shopify CLI 4.9.5 source (github.com/Shopify/cli, tag 4.9.5): packages/app/src/cli/models/extensions/
 *          schemas.ts, specifications/{flow_trigger,function,ui_extension,theme,app_config_*}.ts,
 *          services/function/build.ts, services/build/bundle-size.ts, utilities/extensions/locales-configuration.ts
 *  [DEPLOY] errors Shopify returned on a real `shopify app deploy` of this app (AUDIT.md "Deploy history")
 *  [DOCS]  shopify.dev pages, read through search results (shopify.dev itself is blocked from the sandbox)
 *  [TPL]   Shopify's own templates (github.com/Shopify/extensions-templates)
 *  [TC]    Shopify theme-check, theme-app-extension profile (github.com/Shopify/theme-tools)
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { isUtf8 } from "node:buffer";
import { brotliCompressSync, constants as zlib } from "node:zlib";
import TOML from "@iarna/toml";
import { buildSync } from "esbuild";
import { buildSchema, parse, validate as validateGraphql } from "graphql";

export type Rule = (root: string) => string[];

/* --------------------------------------------------------------- reading */

const read = (root: string, p: string) => readFileSync(join(root, p), "utf8");
const toml = (root: string, p: string): Record<string, any> => TOML.parse(read(root, p)) as Record<string, any>;
const json = (root: string, p: string): any => JSON.parse(read(root, p));

export const extensionDirs = (root: string) =>
  existsSync(join(root, "extensions"))
    ? readdirSync(join(root, "extensions")).filter((d) => existsSync(join(root, "extensions", d, "shopify.extension.toml")))
    : [];

interface Ext {
  dir: string;
  path: string;
  config: Record<string, any>;
  /** The [[extensions]] entry (unified format), or the file itself (theme). */
  ext: Record<string, any>;
  type: string;
}

export function extensions(root: string): Ext[] {
  return extensionDirs(root).map((dir) => {
    const path = `extensions/${dir}`;
    const config = toml(root, `${path}/shopify.extension.toml`);
    const ext = Array.isArray(config.extensions) ? config.extensions[0] : config;
    return { dir, path, config, ext, type: ext.type ?? config.type };
  });
}

const ofType = (root: string, type: string) => extensions(root).filter((e) => e.type === type);
const appToml = (root: string) => toml(root, "shopify.app.toml");

/** The default locale file's keys, nested keys joined with dots. */
function localeKeys(root: string, file: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (o: any, prefix: string) => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === "object") walk(v, `${prefix}${k}.`);
      else out[`${prefix}${k}`] = String(v);
    }
  };
  walk(json(root, file), "");
  return out;
}

/** A "t:key" name resolved in one locale file (or the plain name). */
const resolveName = (name: string, locale: Record<string, string>) => (name.startsWith("t:") ? locale[name.slice(2)] : name);

/** Quarterly API versions: "2026-07". */
const API_VERSION = /^(\d{4})-(01|04|07|10)$/;
const versionMonths = (v: string) => Number(v.slice(0, 4)) * 12 + Number(v.slice(5, 7));
/**
 * Shopify supports each API version for 12 months (+30 days grace, [CLI] security check
 * EOL_API_VERSION). Older versions stop working (webhooks, Admin API) or can't be deployed.
 */
export function supportedVersion(v: string, today = new Date()): boolean {
  const now = today.getUTCFullYear() * 12 + today.getUTCMonth() + 1;
  return API_VERSION.test(v) && now - versionMonths(v) <= 12 && versionMonths(v) - now <= 3;
}

/* ------------------------------------------------------ shopify.app.toml */

/** Admin API webhook topics this app may use (Shopify's topic list; the server rejects unknown ones). */
export const KNOWN_TOPICS = new Set([
  "app/uninstalled",
  "app/scopes_update",
  "app_subscriptions/update",
  "app_subscriptions/approaching_capped_amount",
  "orders/create",
  "orders/updated",
  "orders/cancelled",
  "orders/edited",
  "orders/fulfilled",
  "orders/paid",
  "orders/delete",
  "shop/update",
  "locations/create",
  "locations/update",
  "locations/delete",
  "themes/publish",
]);
const COMPLIANCE = ["customers/data_request", "customers/redact", "shop/redact"];
/** Topics whose payloads contain protected customer data (need the Partner Dashboard request first, [DOCS]). */
export const PROTECTED_TOPICS = /^(orders|draft_orders|customers|checkouts|fulfillments)\//;

export const appRules: Record<string, Rule> = {
  /** [CLI] app_config_branding.ts: name `max(30)`. */
  "app name is 1 to 30 characters": (root) => {
    const n = appToml(root).name;
    return typeof n === "string" && n.trim().length >= 1 && n.length <= 30 ? [] : [`name "${n}" (${n?.length} characters)`];
  },
  /** The deploy command fills client_id with sed; a committed id would deploy to the wrong app. */
  'client_id is "" in the repository (the deploy command fills it)': (root) => (appToml(root).client_id === "" ? [] : [`client_id = "${appToml(root).client_id}"`]),
  /** [CLI] app_config_app_home.ts / app_config_app_access.ts validateUrl; OAuth needs the callback under the app URL. */
  "application_url and redirect_urls are https, redirects under the app URL": (root) => {
    const t = appToml(root);
    const url = String(t.application_url ?? "");
    const out: string[] = [];
    if (!/^https:\/\/[^/\s]+$/.test(url)) out.push(`application_url "${url}" must be https://host with no path`);
    const redirects: string[] = t.auth?.redirect_urls ?? [];
    if (!redirects.length) out.push("auth.redirect_urls is empty");
    for (const r of redirects) if (!r.startsWith(`${url}/`)) out.push(`redirect "${r}" is not under ${url}`);
    return out;
  },
  "embedded app, config deployed with the extensions": (root) => {
    const t = appToml(root);
    const out: string[] = [];
    if (t.embedded !== true) out.push("embedded must be true (App Store: embedded apps use session tokens)");
    if (t.build?.include_config_on_deploy !== true) out.push("build.include_config_on_deploy must be true (README deploy steps rely on it)");
    return out;
  },
  /** [CLI] security check EOL_API_VERSION; same version as the server's Admin API client. */
  "webhook API version is supported and matches app/shopify.server.ts": (root) => {
    const v = String(appToml(root).webhooks?.api_version ?? "");
    const out: string[] = [];
    if (!supportedVersion(v)) out.push(`webhooks.api_version "${v}" is not a supported quarterly version`);
    const server = existsSync(join(root, "app/shopify.server.ts")) ? read(root, "app/shopify.server.ts") : "";
    const m = /apiVersion:\s*ApiVersion\.(\w+?)(\d\d)\b/.exec(server);
    const months: Record<string, string> = { January: "01", April: "04", July: "07", October: "10" };
    if (m && `20${m[2]}-${months[m[1]]}` !== v) out.push(`app/shopify.server.ts uses ApiVersion.${m[1]}${m[2]}, shopify.app.toml ${v}`);
    return out;
  },
  /** [CLI] validation/common.ts WebhookSubscriptionUriValidation + app_config_webhook.ts duplicates; our routes must exist. */
  "webhook subscriptions: valid topics and URIs, no duplicates, a route for each": (root) => {
    const subs: Record<string, any>[] = appToml(root).webhooks?.subscriptions ?? [];
    const out: string[] = [];
    const seen = new Set<string>();
    const routes = existsSync(join(root, "app/routes")) ? readdirSync(join(root, "app/routes")) : [];
    for (const s of subs) {
      const uri = String(s.uri ?? "");
      if (!(s.topics?.length || s.compliance_topics?.length)) out.push(`${uri}: no topics`);
      if (!uri.startsWith("/") && !/^https:\/\//.test(uri)) out.push(`uri "${uri}" must be a relative path or https`);
      if (uri.startsWith("/")) {
        const route = `${uri.slice(1).replace(/\//g, ".")}.tsx`;
        if (!routes.includes(route)) out.push(`uri ${uri}: no app/routes/${route}`);
      }
      for (const topic of s.topics ?? []) {
        if (!KNOWN_TOPICS.has(topic)) out.push(`unknown topic "${topic}"`);
        const key = `${topic}::${uri}::${s.filter ?? ""}`;
        if (seen.has(key)) out.push(`duplicate subscription ${topic} -> ${uri}`);
        seen.add(key);
      }
    }
    return out;
  },
  /** [CLI] app_config_webhook.ts (each compliance topic once) + App Store requirement (all three). */
  "the three mandatory compliance webhooks, each once": (root) => {
    const t = appToml(root).webhooks ?? {};
    const topics = (t.subscriptions ?? []).flatMap((s: any) => s.compliance_topics ?? []);
    const out: string[] = [];
    if (t.privacy_compliance && topics.length) out.push("privacy_compliance can't be used with compliance_topics");
    for (const c of COMPLIANCE) if (topics.filter((x: string) => x === c).length !== 1) out.push(`${c} must be subscribed exactly once`);
    for (const x of topics) if (!COMPLIANCE.includes(x)) out.push(`unknown compliance topic ${x}`);
    return out;
  },
  /** Valid scope names; [CLI] security check DEPRECATED_SCRIPT_TAG_SCOPE; Render's SCOPES must be the same list. */
  "access scopes are valid, minimal and the same in render.yaml": (root) => {
    const scopes = String(appToml(root).access_scopes?.scopes ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const out: string[] = [];
    for (const s of scopes) if (!/^(read|write|unauthenticated_read|unauthenticated_write)_[a-z_]+$/.test(s)) out.push(`scope "${s}"`);
    if (new Set(scopes).size !== scopes.length) out.push("duplicate scopes");
    if (scopes.includes("write_script_tags")) out.push("write_script_tags is deprecated (use the theme app extension)");
    if (existsSync(join(root, "render.yaml"))) {
      const m = /key:\s*SCOPES\s*\n\s*value:\s*(\S+)/.exec(read(root, "render.yaml"));
      if (m && m[1] !== scopes.join(",")) out.push(`render.yaml SCOPES differs from shopify.app.toml`);
    }
    return out;
  },
};

/* ------------------------------------------------------- every extension */

export const extensionRules: Record<string, Rule> = {
  /** [CLI] the CLI parses every shopify.extension.toml with @iarna/toml (same parser as here). */
  "every shopify.extension.toml parses": (root) => {
    const out: string[] = [];
    for (const d of extensionDirs(root)) {
      try {
        TOML.parse(read(root, `extensions/${d}/shopify.extension.toml`));
      } catch (e) {
        out.push(`${d}: ${(e as Error).message.split("\n")[0]}`);
      }
    }
    return out;
  },
  /** [CLI] schemas.ts HandleSchema: 1-50 characters, letters, digits and hyphens, not at either end; unique. */
  "handles are valid and unique": (root) => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const e of extensions(root)) {
      if (e.type === "theme") continue;
      const h = String(e.ext.handle ?? "");
      if (!h || h.length > 50 || !/^[a-zA-Z0-9-]+$/.test(h) || h.startsWith("-") || h.endsWith("-")) out.push(`${e.dir}: handle "${h}"`);
      if (seen.has(h)) out.push(`${e.dir}: duplicate handle "${h}"`);
      seen.add(h);
    }
    return out;
  },
  /** An app has one theme app extension [DOCS]. */
  "at most one theme app extension": (root) => (ofType(root, "theme").length <= 1 ? [] : ["more than one theme app extension"]),
  /** [CLI] locales-configuration.ts: exactly one *.default.json, no empty file, valid UTF-8 (+ valid JSON). */
  "locale files: one default, none empty, UTF-8 JSON": (root) => {
    const out: string[] = [];
    for (const e of extensions(root)) {
      const dir = join(root, e.path, "locales");
      if (!existsSync(dir)) continue;
      const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".schema.json"));
      const defaults = files.filter((f) => f.endsWith(".default.json"));
      if (files.length && defaults.length !== 1) out.push(`${e.dir}: ${defaults.length} default locale files`);
      for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
        const buf = readFileSync(join(dir, f));
        if (!buf.length) out.push(`${e.dir}/locales/${f} is empty`);
        else if (!isUtf8(buf)) out.push(`${e.dir}/locales/${f} is not UTF-8`);
        else {
          try {
            JSON.parse(buf.toString("utf8"));
          } catch {
            out.push(`${e.dir}/locales/${f} is not valid JSON`);
          }
        }
      }
    }
    return out;
  },
  /** Every "t:key" in a config is translated in the default locale (a missing key fails the deploy). */
  'every "t:" name in an extension config is in its default locale': (root) => {
    const out: string[] = [];
    for (const e of extensions(root)) {
      const refs = [...read(root, `${e.path}/shopify.extension.toml`).matchAll(/"t:([^"]+)"/g)].map((m) => m[1]);
      if (!refs.length) continue;
      const file = `${e.path}/locales/en.default.json`;
      if (!existsSync(join(root, file))) {
        out.push(`${e.dir}: no locales/en.default.json`);
        continue;
      }
      const keys = localeKeys(root, file);
      for (const r of refs) if (!keys[r]) out.push(`${e.dir}: "t:${r}"`);
    }
    return out;
  },
  /**
   * [CLI] api_version is required for UI extensions and Functions; [DOCS] changelog: from 1 October 2026
   * every UI extension must use 2026-01 or later to stay deployable; Shopify supports a version 12 months.
   */
  "UI extensions and Functions use a supported API version (UI: 2026-01 or later)": (root) => {
    const out: string[] = [];
    for (const e of extensions(root)) {
      if (e.type !== "ui_extension" && e.type !== "function") continue;
      const v = String(e.config.api_version ?? "");
      if (!supportedVersion(v)) out.push(`${e.dir}: api_version "${v}"`);
      else if (e.type === "ui_extension" && versionMonths(v) < versionMonths("2026-01")) out.push(`${e.dir}: api_version ${v} is older than 2026-01`);
    }
    return out;
  },
};

/* --------------------------------------------------------- UI extensions */

/** One bundle per extension, like the CLI: every target's module imported by one entry (ui_extension.ts). */
export function uiBundle(root: string, e: Ext): Uint8Array {
  const targets: { module: string; target: string }[] = e.ext.targeting ?? [];
  const entry = targets.map((t, i) => `import T${i} from ${JSON.stringify(t.module)}; shopify.extend(${JSON.stringify(t.target)}, (...a) => T${i}(...a));`).join("\n");
  const out = buildSync({
    stdin: { contents: entry, resolveDir: join(root, e.path), loader: "tsx" },
    bundle: true,
    minify: true,
    format: "esm",
    jsx: "automatic",
    jsxImportSource: "preact",
    nodePaths: [resolve(__dirname, "../../node_modules")],
    write: false,
    logLevel: "silent",
  });
  return out.outputFiles[0].contents;
}

/** Brotli quality 11, as the CLI and Shopify measure it ([CLI] services/build/bundle-size.ts). */
export const brotliSize = (b: Uint8Array) => brotliCompressSync(b, { params: { [zlib.BROTLI_PARAM_QUALITY]: 11 } }).length;

/** Source files of one extension that its modules import (for key lookups). */
function moduleSources(root: string, e: Ext): string[] {
  const targets: { module: string }[] = e.ext.targeting ?? [];
  const r = buildSync({
    entryPoints: targets.map((t) => join(root, e.path, t.module)),
    bundle: true,
    metafile: true,
    write: false,
    outdir: "out",
    format: "esm",
    jsx: "automatic",
    jsxImportSource: "preact",
    nodePaths: [resolve(__dirname, "../../node_modules")],
    logLevel: "silent",
  });
  // The extension's own code and shared app code, not packages (paths are relative to the working directory).
  return Object.keys(r.metafile!.inputs)
    .map((f) => resolve(process.cwd(), f))
    .filter((f) => {
      const rel = relative(root, f);
      return !rel.startsWith("..") && !rel.split(/[\\/]/).includes("node_modules");
    });
}

const ui = (root: string) => ofType(root, "ui_extension");
const targetsOf = (e: Ext): string[] => (e.ext.targeting ?? []).map((t: { target: string }) => t.target);

export const uiRules: Record<string, Rule> = {
  /** [CLI] ui_extension.ts validateUIExtensionPointConfig: modules exist, no duplicate targets. */
  "UI targets are unique and their modules exist": (root) => {
    const out: string[] = [];
    for (const e of ui(root)) {
      const targets = targetsOf(e);
      if (!targets.length) out.push(`${e.dir}: no targeting`);
      if (new Set(targets).size !== targets.length) out.push(`${e.dir}: duplicate targets`);
      for (const t of e.ext.targeting ?? []) if (!existsSync(join(root, e.path, t.module))) out.push(`${e.dir}: module ${t.module} not found`);
    }
    return out;
  },
  /** [CLI] API 2025-10+ (remote DOM): the bundle does `import X from module`, so each module needs a default export. */
  "UI modules export a default function": (root) => {
    const out: string[] = [];
    for (const e of ui(root))
      for (const t of e.ext.targeting ?? []) {
        const p = join(root, e.path, t.module);
        if (existsSync(p) && !/export\s+default\b|export\s*\{\s*default\b/.test(readFileSync(p, "utf8"))) out.push(`${e.dir}: ${t.module} has no default export`);
      }
    return out;
  },
  /** [DEPLOY] "Extension targeting config should have just one of the following targets" (admin actions). */
  "admin: at most one action target per extension": (root) =>
    ui(root).flatMap((e) => {
      const a = targetsOf(e).filter((t) => t.startsWith("admin.") && /\.(selection-)?action\.render$/.test(t));
      return a.length > 1 ? [`${e.dir}: ${a.join(", ")}`] : [];
    }),
  /** [DEPLOY] "admin.order-details.block.render cannot be configured in the same extension as … action.render". */
  "admin: never a block next to an action": (root) =>
    ui(root).flatMap((e) => {
      const t = targetsOf(e).filter((x) => x.startsWith("admin."));
      return t.some((x) => /\.action\.render$/.test(x)) && t.some((x) => /\.block\.render$/.test(x)) ? [`${e.dir}: block and action together`] : [];
    }),
  /** [DOCS] customer account order actions: the modal target comes with its menu item target. */
  "customer account: an order action modal comes with its menu item": (root) =>
    ui(root).flatMap((e) => {
      const t = targetsOf(e);
      const modal = t.includes("customer-account.order.action.render");
      const item = t.includes("customer-account.order.action.menu-item.render");
      return modal !== item ? [`${e.dir}: order action modal and menu item must be in the same extension`] : [];
    }),
  /** [DOCS] UI extension configuration: name 5-30 characters (checked in every locale). */
  "UI extension names are 5 to 30 characters in every language": (root) => {
    const out: string[] = [];
    for (const e of ui(root)) {
      const name = String(e.ext.name ?? "");
      const dir = join(root, e.path, "locales");
      const files = name.startsWith("t:") && existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [null];
      for (const f of files) {
        const n = f ? resolveName(name, localeKeys(root, `${e.path}/locales/${f}`)) : name;
        if (f && n === undefined && !f.endsWith(".default.json")) continue; // falls back to the default locale
        if (!n || n.length < 5 || n.length > 30) out.push(`${e.dir}${f ? ` (${f})` : ""}: name "${n}"`);
      }
    }
    return out;
  },
  /** [DOCS] + [CLI] bundle-size.ts: 64 KB compressed (Brotli) per extension, all targets in one bundle (API 2025-10+). */
  "UI extension bundles are under 64 KB compressed": (root) => {
    const out: string[] = [];
    for (const e of ui(root)) {
      const size = brotliSize(uiBundle(root, e));
      if (size >= 64 * 1024) out.push(`${e.dir}: ${(size / 1024).toFixed(1)} KB`);
    }
    return out;
  },
  /** [CLI] schemas.ts CapabilitiesSchema; [DOCS] fetch from checkout / customer accounts needs network_access. */
  "capabilities are known, and extensions that fetch declare network_access": (root) => {
    const known = new Set(["network_access", "block_progress", "api_access", "collect_buyer_consent", "iframe", "bundle_size_exception"]);
    const out: string[] = [];
    for (const e of ui(root)) {
      const caps = e.ext.capabilities ?? {};
      for (const k of Object.keys(caps)) if (!known.has(k)) out.push(`${e.dir}: unknown capability ${k}`);
      const storefront = targetsOf(e).some((t) => t.startsWith("purchase.") || t.startsWith("customer-account."));
      const fetches = moduleSources(root, e).some((f) => /\bfetch\(/.test(readFileSync(f, "utf8")));
      if (storefront && fetches && caps.network_access !== true) out.push(`${e.dir}: calls fetch() without network_access = true`);
    }
    return out;
  },
  /** Every i18n.translate key the code uses exists in the extension's default locale (else merchants see the key). */
  "every translation key used in UI code is in en.default.json": (root) => {
    const out: string[] = [];
    for (const e of ui(root)) {
      const sources = moduleSources(root, e).map((f) => readFileSync(f, "utf8"));
      if (!sources.some((s) => s.includes("i18n.translate"))) continue;
      const keys = localeKeys(root, `${e.path}/locales/en.default.json`);
      const used = new Set(sources.flatMap((s) => [...s.matchAll(/\bt\("([a-zA-Z][\w.]*)"/g)].map((m) => m[1])));
      for (const k of used) if (!keys[k]) out.push(`${e.dir}: "${k}"`);
    }
    return out;
  },
  /** The @shopify/ui-extensions version matches api_version (the CLI generates the types from it). */
  "@shopify/ui-extensions matches each extension's api_version": (root) =>
    ui(root).flatMap((e) => {
      const dep = json(root, `${e.path}/package.json`).dependencies?.["@shopify/ui-extensions"] as string | undefined;
      const v = String(e.config.api_version);
      const want = `${v.slice(0, 4)}.${Number(v.slice(5, 7))}.`;
      return dep && !dep.startsWith(want) ? [`${e.dir}: @shopify/ui-extensions ${dep} for api_version ${v}`] : [];
    }),
};

/* ------------------------------------------------------------ Functions */

const fns = (root: string) => ofType(root, "function");
/** Function targets used in Shopify's current templates [TPL]. */
export const FUNCTION_TARGETS = new Set([
  "cart.validations.generate.run",
  "cart.delivery-options.transform.run",
  "cart.delivery-options.discounts.generate.run",
  "cart.lines.discounts.generate.run",
  "cart.payment-methods.transform.run",
  "cart.transform.run",
  "cart.fulfillment-constraints.generate.run",
]);
const camelize = (s: string) => s.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase());

export const functionRules: Record<string, Rule> = {
  /** [CLI] function.ts schema (name, type, api_version required) + [TPL] targets. */
  "Functions: known target, input query file, wasm output path": (root) => {
    const out: string[] = [];
    for (const e of fns(root)) {
      if (!e.ext.name) out.push(`${e.dir}: no name`);
      for (const t of e.ext.targeting ?? []) {
        if (!FUNCTION_TARGETS.has(t.target)) out.push(`${e.dir}: unknown target ${t.target}`);
        if (!t.input_query || !existsSync(join(root, e.path, t.input_query))) out.push(`${e.dir}: input query ${t.input_query} not found`);
      }
      if (!String(e.ext.build?.path ?? "").endsWith(".wasm")) out.push(`${e.dir}: build.path must be the .wasm file`);
      if (String(e.ext.build?.command ?? "").trim()) out.push(`${e.dir}: build.command must be "" (the CLI builds JS Functions)`);
    }
    return out;
  },
  /** [CLI] services/function/build.ts jsExports: kebab-case export, mapped to the camelCase JS export of src/index. */
  "Functions: each export is kebab-case and exported from src/index.ts": (root) => {
    const out: string[] = [];
    for (const e of fns(root)) {
      const entry = ["src/index.ts", "src/index.js"].find((f) => existsSync(join(root, e.path, f)));
      if (!entry) {
        out.push(`${e.dir}: no src/index.ts`);
        continue;
      }
      const src = read(root, `${e.path}/${entry}`);
      const targets = e.ext.targeting ?? [];
      for (const t of targets) {
        if (!t.export) {
          if (targets.length > 1) out.push(`${e.dir}: ${t.target} needs an export`);
          continue;
        }
        if (!/^[a-z0-9-]+$/.test(t.export)) out.push(`${e.dir}: export "${t.export}" must be kebab-case`);
        const fn = camelize(t.export);
        if (!new RegExp(`export\\s+(async\\s+)?function\\s+${fn}\\b|export\\s+const\\s+${fn}\\b`).test(src)) out.push(`${e.dir}: src/index has no export ${fn}`);
      }
    }
    return out;
  },
  /** [CLI] function.ts: input variables on the extension or on targets, never both. */
  "Functions: input variables declared in one place": (root) =>
    fns(root).flatMap((e) => (e.ext.input?.variables && (e.ext.targeting ?? []).some((t: any) => t.input_variables) ? [`${e.dir}: input.variables and targeting.input_variables`] : [])),
  /** [CLI] build.ts deriveJavaScriptBinaryDependencies: @shopify/shopify_function major 0, 1 or 2. */
  "Functions: @shopify/shopify_function is a version the CLI can build": (root) =>
    fns(root).flatMap((e) => {
      const dep = String(json(root, `${e.path}/package.json`).dependencies?.["@shopify/shopify_function"] ?? "");
      return /^[\^~]?[012]\./.test(dep) ? [] : [`${e.dir}: @shopify/shopify_function "${dep}"`];
    }),
  /** Shopify rejects an input query that isn't valid against the Function API schema ([DOCS] input queries). */
  "Functions: input queries are valid against schema.graphql": (root) => {
    const out: string[] = [];
    for (const e of fns(root)) {
      const schema = buildSchema(read(root, `${e.path}/schema.graphql`));
      for (const t of e.ext.targeting ?? []) {
        const errors = validateGraphql(schema, parse(read(root, `${e.path}/${t.input_query}`)));
        for (const err of errors) out.push(`${e.dir}: ${err.message}`);
      }
    }
    return out;
  },
  /**
   * [DOCS] Function limits: the compiled .wasm must be under 256 KB. Javy turns the bundled (not
   * minified) JS into QuickJS bytecode of a similar size, so the bundle stays under half of that.
   */
  "Functions: bundled JS stays under 128 KB (half the 256 KB wasm limit)": (root) =>
    fns(root).flatMap((e) => {
      const r = buildSync({ entryPoints: [join(root, e.path, "src/index.ts")], bundle: true, format: "esm", target: "es2022", write: false, logLevel: "silent" });
      const size = r.outputFiles[0].contents.length;
      return size > 128 * 1024 ? [`${e.dir}: ${(size / 1024).toFixed(1)} KB`] : [];
    }),
};

/* --------------------------------------------------------- Flow triggers */

/** [CLI] flow_trigger.ts / flow_action.ts: field types a trigger accepts. */
export const FLOW_FIELD_TYPES = new Set(["boolean", "email", "single_line_text_field", "url", "number_decimal"]);
/** [CLI] commerce objects a trigger can reference. */
export const FLOW_REFERENCES = new Set(["customer_reference", "order_reference", "product_reference", "company_reference", "company_contact_reference"]);

const flows = (root: string) => ofType(root, "flow_trigger");

export const flowRules: Record<string, Rule> = {
  /** [CLI] name required, [DOCS] description required; [DEPLOY] "description: is too long (maximum is 140 characters)". */
  "Flow triggers: name, and a description of at most 140 characters": (root) =>
    flows(root).flatMap((e) => {
      const out: string[] = [];
      if (!String(e.ext.name ?? "").trim()) out.push(`${e.dir}: no name`);
      const d = String(e.ext.description ?? "");
      if (!d.trim()) out.push(`${e.dir}: no description`);
      if (d.length > 140) out.push(`${e.dir}: description is ${d.length} characters`);
      return out;
    }),
  /** [CLI] flow_trigger.ts: allowed types; keys letters and spaces only, required on non-reference fields; references take no key. */
  "Flow triggers: field types and keys Flow accepts": (root) =>
    flows(root).flatMap((e) => {
      const out: string[] = [];
      const keys = new Set<string>();
      for (const f of e.config.settings?.fields ?? []) {
        if (FLOW_REFERENCES.has(f.type)) {
          const extra = Object.keys(f).filter((k) => !["type", "description", "required"].includes(k));
          if (extra.length) out.push(`${e.dir}: ${f.type} can't have ${extra.join(", ")}`);
          continue;
        }
        if (!FLOW_FIELD_TYPES.has(f.type) && !String(f.type).startsWith("schema.")) out.push(`${e.dir}: field type "${f.type}" is not supported on triggers`);
        if (typeof f.key !== "string" || !f.key.trim()) out.push(`${e.dir}: a ${f.type} field needs a key`);
        else if (!/^[a-zA-Z\s]*$/.test(f.key)) out.push(`${e.dir}: key "${f.key}" may only contain letters and spaces`);
        if (keys.has(f.key)) out.push(`${e.dir}: duplicate key "${f.key}"`);
        keys.add(f.key);
      }
      return out;
    }),
};

/** The payload key Flow expects for each reference field ([DOCS] Flow trigger reference). */
const REFERENCE_KEY: Record<string, string> = {
  customer_reference: "customer_id",
  order_reference: "order_id",
  product_reference: "product_id",
  company_reference: "company_id",
  company_contact_reference: "company_contact_id",
};

/** Problems with a payload for a trigger: missing or extra keys, wrong value types ([DOCS]: Flow requires every field). */
export function payloadProblems(fields: { type: string; key?: string }[], payload: Record<string, unknown>): string[] {
  const out: string[] = [];
  const expected = new Map<string, string>();
  for (const f of fields) expected.set(FLOW_REFERENCES.has(f.type) ? REFERENCE_KEY[f.type] : String(f.key), f.type);
  for (const k of Object.keys(payload)) if (!expected.has(k)) out.push(`payload key "${k}" is not a field of the trigger`);
  for (const [k, type] of expected) {
    const v = payload[k];
    if (v === undefined) out.push(`missing "${k}"`);
    else if (FLOW_REFERENCES.has(type) && !(typeof v === "number" && Number.isInteger(v) && v > 0)) out.push(`"${k}" must be a numeric id`);
    else if (type === "number_decimal" && !(typeof v === "number" && Number.isFinite(v))) out.push(`"${k}" must be a number`);
    else if (type === "single_line_text_field" && (typeof v !== "string" || /[\r\n]/.test(v))) out.push(`"${k}" must be one line of text`);
    else if (type === "url" && (typeof v !== "string" || !/^https:\/\/\S+$/.test(v))) out.push(`"${k}" must be an https URL`);
    else if (type === "boolean" && typeof v !== "boolean") out.push(`"${k}" must be true or false`);
    else if (type === "email" && (typeof v !== "string" || !v.includes("@"))) out.push(`"${k}" must be an email`);
  }
  return out;
}

export const flowFields = (root: string, handle: string): { type: string; key?: string }[] => {
  const e = flows(root).find((x) => x.ext.handle === handle);
  if (!e) throw new Error(`no Flow trigger with handle ${handle}`);
  return e.config.settings?.fields ?? [];
};

/* ------------------------------------------------- theme app extension */

const THEME_DIRS: Record<string, RegExp> = {
  assets: /\.(jpg|jpeg|json|js|css|png|svg|wasm)$/,
  blocks: /\.liquid$/,
  locales: /\.json$/,
  snippets: /\.liquid$/,
};
const themeDir = (root: string) => {
  const t = ofType(root, "theme")[0];
  return t ? join(root, t.path) : null;
};
const blockSchemas = (dir: string) =>
  readdirSync(join(dir, "blocks"))
    .filter((f) => f.endsWith(".liquid"))
    .map((f) => {
      const m = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/.exec(readFileSync(join(dir, "blocks", f), "utf8"));
      let schema: any = null;
      try {
        schema = m ? JSON.parse(m[1]) : null;
      } catch {
        schema = undefined;
      }
      return { file: f, schema };
    });

export const themeRules: Record<string, Rule> = {
  /** [CLI] theme.ts: only assets/blocks/locales/snippets, with these file types (files at the top are not uploaded). */
  "theme extension: only supported folders and file types": (root) => {
    const dir = themeDir(root);
    if (!dir) return [];
    const out: string[] = [];
    for (const d of readdirSync(dir)) {
      if (!statSync(join(dir, d)).isDirectory()) continue;
      if (!THEME_DIRS[d]) {
        out.push(`unsupported folder ${d}/`);
        continue;
      }
      for (const f of readdirSync(join(dir, d))) if (!THEME_DIRS[d].test(f)) out.push(`${d}/${f}: file type not allowed in ${d}`);
    }
    return out;
  },
  /** [CLI] theme.ts: 10 MB in total, 500 KB of Liquid (blocks + snippets). */
  "theme extension: under 10 MB, Liquid under 500 KB": (root) => {
    const dir = themeDir(root);
    if (!dir) return [];
    let total = 0;
    let liquid = 0;
    for (const d of Object.keys(THEME_DIRS)) {
      if (!existsSync(join(dir, d))) continue;
      for (const f of readdirSync(join(dir, d))) {
        const s = statSync(join(dir, d, f)).size;
        total += s;
        if (d === "blocks" || d === "snippets") liquid += s;
      }
    }
    const out: string[] = [];
    if (total > 10 * 1024 * 1024) out.push(`${(total / 1048576).toFixed(2)} MB`);
    if (liquid > 500 * 1024) out.push(`Liquid ${(liquid / 1024).toFixed(1)} KB`);
    return out;
  },
  /** [DOCS] changelog: up to 30 blocks per theme app extension; theme limits: block names at most 25 characters. */
  "theme blocks: at most 30, valid schema, names up to 25 characters, known targets": (root) => {
    const dir = themeDir(root);
    if (!dir) return [];
    const out: string[] = [];
    const blocks = blockSchemas(dir);
    if (blocks.length > 30) out.push(`${blocks.length} blocks`);
    const names = localeKeys(root, relative(root, join(dir, "locales", "en.default.schema.json")));
    for (const b of blocks) {
      if (!b.schema) {
        out.push(`${b.file}: no valid {% schema %} JSON`);
        continue;
      }
      const name = resolveName(String(b.schema.name ?? ""), names);
      if (!name) out.push(`${b.file}: name ${b.schema.name} is not translated`);
      else if (name.length > 25) out.push(`${b.file}: name "${name}" is ${name.length} characters`);
      if (!["section", "content", "head", "body", "compliance_head"].includes(b.schema.target)) out.push(`${b.file}: target "${b.schema.target}"`);
    }
    return out;
  },
  /** Every "t:" in a block schema and every `'key' | t` in Liquid is translated (else the theme editor shows the key). */
  "theme extension: every translation key exists": (root) => {
    const dir = themeDir(root);
    if (!dir) return [];
    const out: string[] = [];
    const schemaKeys = localeKeys(root, relative(root, join(dir, "locales", "en.default.schema.json")));
    const keys = localeKeys(root, relative(root, join(dir, "locales", "en.default.json")));
    for (const b of blockSchemas(dir)) {
      for (const m of JSON.stringify(b.schema ?? {}).matchAll(/"t:([^"]+)"/g)) if (!schemaKeys[m[1]]) out.push(`${b.file}: t:${m[1]}`);
    }
    for (const d of ["blocks", "snippets"]) {
      for (const f of readdirSync(join(dir, d))) {
        for (const m of readFileSync(join(dir, d, f), "utf8").matchAll(/['"]([\w.]+)['"]\s*\|\s*t\b/g)) if (!keys[m[1]]) out.push(`${d}/${f}: '${m[1]}' | t`);
      }
    }
    return out;
  },
  /** Every `'file' | asset_url` points at a file in assets/ ([TC] MissingAsset). */
  "theme extension: every asset_url file exists": (root) => {
    const dir = themeDir(root);
    if (!dir) return [];
    const out: string[] = [];
    for (const d of ["blocks", "snippets"]) {
      for (const f of readdirSync(join(dir, d))) {
        for (const m of readFileSync(join(dir, d, f), "utf8").matchAll(/['"]([^'"]+)['"]\s*\|\s*asset_url/g)) if (!existsSync(join(dir, "assets", m[1]))) out.push(`${d}/${f}: ${m[1]}`);
      }
    }
    return out;
  },
};

/** All synchronous rules, by group (theme-check and payload checks run in the test file). */
export const ALL_RULES: Record<string, Record<string, Rule>> = {
  "shopify.app.toml": appRules,
  "every extension": extensionRules,
  "UI extensions": uiRules,
  Functions: functionRules,
  "Flow triggers": flowRules,
  "theme app extension": themeRules,
};

