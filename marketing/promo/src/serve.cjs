// Serves marketing/ to a Playwright page at http://promo.local/ (CSS masks and fonts need http, not file://).
// The stage is promo/src/stage.html; the logo comes from marketing/src/logo.svg, untouched.
const path = require("node:path");
const fs = require("node:fs");
const root = path.resolve(__dirname, "../..");
const TYPES = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json" };
module.exports = async function serve(page) {
  await page.route("http://promo.local/**", (route) => {
    const p = decodeURIComponent(new URL(route.request().url()).pathname);
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ body: fs.readFileSync(f), contentType: TYPES[path.extname(f)] || "application/octet-stream", headers: { "Access-Control-Allow-Origin": "*" } });
  });
  return "http://promo.local/promo/src/stage.html";
};
