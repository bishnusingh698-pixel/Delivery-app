/**
 * Runs before `npm run deploy`: stops the upload when shopify.app.toml still has the example
 * URL or the app isn't linked yet, because a wrong URL breaks installs (redirect mismatch) and
 * makes the customer "Change date" button call a server that isn't yours.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const toml = readFileSync(join(root, "shopify.app.toml"), "utf8");
const get = (key) => toml.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m"))?.[1] ?? "";

const problems = [];
const appUrl = get("application_url").replace(/\/+$/, "");
const clientId = get("client_id");
const redirects = [...(toml.match(/^redirect_urls\s*=\s*\[([^\]]*)\]/m)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);

if (!clientId) problems.push('client_id is empty: run "npx shopify app config link" first and choose your app.');
if (!/^https:\/\/[^/\s]+$/.test(appUrl)) problems.push(`application_url must look like https://your-service.onrender.com (got "${appUrl}").`);
if (appUrl === "https://pickday.onrender.com" && process.env.PICKDAY_URL_CONFIRMED !== "1")
  problems.push('application_url is still the example "https://pickday.onrender.com". Put your own Render URL in application_url and redirect_urls (README step 4). If this really is your URL, run again with PICKDAY_URL_CONFIRMED=1.');
if (!redirects.length || redirects.some((r) => !r.startsWith(`${appUrl}/`)))
  problems.push(`redirect_urls must start with your application_url (${appUrl}), e.g. "${appUrl}/auth/callback".`);

if (problems.length) {
  for (const p of problems) console.error(`[deploy] ${p}`);
  process.exit(1);
}
console.log(`[deploy] shopify.app.toml OK: ${appUrl}`);
