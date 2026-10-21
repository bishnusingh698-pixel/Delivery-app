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

app.listen(port, () => console.log(`[pickday] listening on ${port}`));
