// node shot.cjs in.(svg|html) out.png width height [scale]
const { chromium } = require("playwright");
const { resolve } = require("node:path");
(async () => {
  const [,, inp, out, w, h, s] = process.argv;
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +(s || 1) });
  await p.goto("file://" + resolve(inp));
  await p.waitForTimeout(300);
  await p.screenshot({ path: out, clip: { x: 0, y: 0, width: +w, height: +h } });
  await b.close();
})();
