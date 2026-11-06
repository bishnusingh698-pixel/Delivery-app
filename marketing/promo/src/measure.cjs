// Dev helper: node src/measure.cjs  -> widths (px at 100px font size) of strings in the promo's type styles
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto(await require("./serve.cjs")(p));
  await p.waitForFunction(() => window.READY || window.BOOT_ERROR, null, { timeout: 60000 });
  const items = JSON.parse(process.argv[2]);
  const r = await p.evaluate((items) => items.map(([cls, txt, extra]) => {
    const d = document.createElement("div");
    d.className = "abs nowrap " + cls; d.style.fontSize = "100px"; d.style.cssText += extra || ""; d.textContent = txt;
    document.body.appendChild(d); const w = d.getBoundingClientRect().width; const h = d.getBoundingClientRect().height; d.remove();
    return `${cls.padEnd(4)} ${String(Math.round(w)).padStart(5)} x ${Math.round(h)}  ${txt}`;
  }), items);
  console.log(r.join("\n"));
  await b.close();
})();
