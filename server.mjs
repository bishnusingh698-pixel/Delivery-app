/**
 * Production server: the same setup as `react-router-serve`, with two changes:
 * - request logs hide calendar feed tokens (/feeds/<secret>.ics is a password);
 * - public routes (calendar feeds, add-to-calendar links) are rate limited per IP.
 */
import path from "node:path";
import { createRequestHandler } from "@react-router/express";
import compression from "compression";
import express from "express";
import morgan from "morgan";

/**
 * Check the settings before anything else, so a missing or mistyped Render variable shows up as
 * one clear line in the logs instead of a half-working app (failed installs, broken plan
 * approvals, a Home checklist that never turns green).
 */
function checkEnv() {
  const env = process.env;
  if (env.SHOPIFY_APP_URL) env.SHOPIFY_APP_URL = env.SHOPIFY_APP_URL.trim().replace(/\/+$/, "");
  const missing = ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "SHOPIFY_APP_URL", "SHOPIFY_APP_HANDLE", "SCOPES", "DATABASE_URL", "DIRECT_URL"].filter((k) => !env[k]?.trim());
  const problems = missing.map((k) => `${k} is not set`);
  for (const k of ["DATABASE_URL", "DIRECT_URL"]) if (env[k]?.trim() && !/^postgres(ql)?:\/\//.test(env[k].trim())) problems.push(`${k} must be a Neon connection string starting with postgresql://`);
  if (env.SHOPIFY_APP_URL && !/^https:\/\/[^/\s]+$/.test(env.SHOPIFY_APP_URL)) problems.push(`SHOPIFY_APP_URL must look like https://your-service.onrender.com (got "${env.SHOPIFY_APP_URL}")`);
  if (problems.length) {
    for (const p of problems) console.error(`[pickday] setting problem: ${p}`);
    console.error("[pickday] fix these in Render > your service > Environment, then redeploy.");
    process.exit(1);
  }
  if (!env.JOBS_SECRET || env.JOBS_SECRET.length < 16) console.warn("[pickday] JOBS_SECRET is missing or shorter than 16 characters: the hourly and daily jobs will refuse every call.");
  if (!env.SUPPORT_EMAIL) console.warn("[pickday] SUPPORT_EMAIL is not set: the Help page has no contact button.");
  if (env.BILLING_TEST === "true") console.warn("[pickday] BILLING_TEST is true: every store gets test charges and pays nothing. Set it to false before launch.");
}
if (process.env.NODE_ENV === "production") checkEnv();

const build = await import("./build/server/index.js");
const port = Number(process.env.PORT) || 3000;

/** At most `limit` requests per IP per minute; in memory, which is enough for one free instance. */
function rateLimit(limit) {
  const hits = new Map();
  setInterval(() => hits.clear(), 60_000).unref();
  return (req, res, next) => {
    const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || req.socket.remoteAddress || "?";
    const n = (hits.get(ip) ?? 0) + 1;
    hits.set(ip, n);
    if (n > limit) return res.status(429).set("Retry-After", "60").send("Too many requests");
    next();
  };
}

morgan.token("safe-url", (req) => (req.originalUrl || req.url).replace(/\/feeds\/[^/?#]+/, "/feeds/[hidden]").replace(/([?&]t=)[^&]+/, "$1[hidden]"));

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(compression());
app.use(path.posix.join(build.publicPath, "assets"), express.static(path.join(build.assetsBuildDirectory, "assets"), { immutable: true, maxAge: "1y" }));
app.use(build.publicPath, express.static(build.assetsBuildDirectory));
app.use(express.static("public", { maxAge: "1h" }));
app.use(morgan(":method :safe-url :status :res[content-length] - :response-time ms"));
app.use(["/feeds", "/ics"], rateLimit(30));
app.all("*", createRequestHandler({ build, mode: process.env.NODE_ENV }));

const server = app.listen(port, () => console.log(`[pickday] listening on ${port}`));

// One failed background task (a publish, a job step) must never take the whole app down:
// Node stops the process on an unhandled promise rejection by default.
process.on("unhandledRejection", (reason) => console.error("[pickday] unhandled rejection", reason));

// Render sends SIGTERM on every deploy and restart: stop taking new requests, let the ones
// in flight (webhooks, plan approvals) finish, then exit before Render's 30-second limit.
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    console.log(`[pickday] ${signal}: finishing open requests`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 20_000).unref();
  });
}
