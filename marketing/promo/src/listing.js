/* App Store listing images, printed as sheets from the same tear-off pad as the promo video.
   listing.html?n=0 is the feature image, n=1..6 the six screenshots. Every sheet is built around the
   app's real UI (the storefront widget, the admin, checkout, the print pages), printed as a figure
   and marked up in ink. Rendered by listing.cjs at 1920 x 1080 CSS px and scaled to 1600 x 900. */
(async function () {
  gsap.registerPlugin(DrawSVGPlugin);
  const n = Number(new URLSearchParams(location.search).get("n") || 0);
  await Promise.all(['900 100px "Archivo Variable"', '760 100px "Archivo Variable"', 'italic 560 100px "Fraunces Variable"', '500 20px "IBM Plex Mono"', '600 20px "IBM Plex Mono"',
    '900 100px "Noto Sans JP"', '900 100px "Noto Sans KR"', '900 100px "Noto Kufi Arabic"', '900 100px "Noto Sans Hebrew"']
    .map((f) => document.fonts.load(f, "AaÄäé日付を選択날짜 선택اختر تاريخًاבחרו תאריך019")));
  await document.fonts.ready;
  const FIG = await (await fetch("../build/parts/fig.json")).json();
  const RECTS = await (await fetch("../build/lparts/rects.json")).json();
  const size = {};
  const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => { size[src] = [i.naturalWidth, i.naturalHeight]; ok(); }; i.onerror = ok; i.src = src; });

  const P = "../build/parts/", L = "../build/lparts/", W = "../../out/parts/";
  const SRC = [P + "fig-day.png", P + "fig-slot.png", P + "fig-ar.png", P + "daysheet.png", P + "route.png", W + "w-limits.png",
    ...["capacity", "co-delivery", "co-payment", "orders", "holidays", "email"].map((k) => `${L}${k}.png`)];
  await Promise.all(SRC.map(load));

  const ink = (svg, d, o = {}) => { const p = E.path(svg, d, o); gsap.set(p, { drawSVG: "100%" }); return p; };
  const ring = (svg, cx, cy, rx, ry, seed, o = {}) => ink(svg, E.circleD(cx, cy, rx, ry, seed), { width: 8, ...o });
  const on = (el) => { gsap.set(el, { opacity: 1 }); return el; };
  /** A printed figure: the UI multiplied into a white slip, with a mono caption above it.
      Returns the slip, its ink layer and a mapper from the source's CSS px to slip px. */
  const fig = (S, src, { x, y, w, pad = 22, rot = 0, cap, cssW, capDy = -34 }) => {
    const [iw, ih] = size[src], h = (w * ih) / iw, cw = w + pad * 2, ch = h + pad * 2;
    if (cap) E.el(S, `<div class="abs cap" style="left:${x + 4}px;top:${y + capDy}px">${cap}</div>`);
    const card = E.el(S, `<div class="slip" style="left:${x}px;top:${y}px;width:${cw}px;height:${ch}px"><img src="${src}" style="position:absolute;left:${pad}px;top:${pad}px;width:${w}px;mix-blend-mode:multiply"></div>`);
    gsap.set(card, { rotation: rot });
    const k = w / (cssW || iw / 2);
    return { card, ink: E.svgAt(card, cw, ch), at: (px, py) => [pad + px * k, pad + py * k], k, cw, ch };
  };
  const ringRect = (f, r, seed, o = {}, grow = [22, 18]) => {
    const [cx, cy] = f.at(r.x + r.w / 2, r.y + r.h / 2);
    return ring(f.ink, cx, cy, (r.w * f.k) / 2 + grow[0], (r.h * f.k) / 2 + grow[1], seed, o);
  };
  const box = (el) => { const a = el.getBoundingClientRect(); return { x: a.left, y: a.top, w: a.width, h: a.height }; };

  const LABELS = ["Pickday", "The picker", "Daily limits", "Checkout", "Behind the counter", "Every morning", "Languages"];
  const pad = document.getElementById("pad");
  const sheet = E.el(pad, `<section class="sheet"></section>`);
  E.el(sheet, `<div class="perf"></div>`);
  [[44, 58], [1846, 58], [44, 1022], [1846, 1022]].forEach(([x, y]) => E.el(sheet, `<div class="reg">${E.regMark()}</div>`, { left: `${x}px`, top: `${y}px` }));
  E.el(sheet, `<div class="label">§ ${String(n).padStart(2, "0")} &nbsp;·&nbsp; <b>${LABELS[n]}</b></div>`);
  E.el(sheet, `<div class="foot">Pickday — delivery date picker</div>`);
  E.el(sheet, `<div class="swatch"><i style="background:var(--blue)"></i><i style="background:var(--orange)"></i><i style="background:var(--over)"></i></div>`);
  document.getElementById("bindNo").textContent = n ? `Sheet ${String(n).padStart(2, "0")} / 06` : "Saturday 14";
  const S = E.el(sheet, `<div class="content" style="position:absolute;inset:0"></div>`);
  const svg = E.svg(S);
  const day14 = (f) => FIG[f].days.find((d) => d.date === "2026-11-14");

  const PAGES = [
    // 0 · feature image: one focal point, the picker in the cart, under the tagline
    () => {
      E.el(S, `<div class="abs d inkc mul nowrap" style="left:120px;top:190px;font-size:150px">Let customers</div>`);
      const t = E.el(S, `<div class="abs s orange mul nowrap" style="left:104px;top:318px;font-size:206px">pick the <span id="dayw">day.</span></div>`);
      const d = box(t.querySelector("#dayw"));
      ring(svg, d.x + d.w / 2 + 4, d.y + d.h * 0.56, d.w / 2 + 30, d.h * 0.4, 31, { width: 9 });
      on(E.sticker(S, { x: 132, y: 690, size: 230, rot: -6 }));
      E.ticket(S, { no: 1044, day: "Sat 14 Nov", lines: ["2 × Sourdough loaf"], slot: "Delivery · 12–3", x: 430, y: 742, rot: 4, w: 310 });
      const f = fig(S, P + "fig-day.png", { x: 1206, y: 150, w: 560, rot: -1.6, cssW: 540, cap: "Fig. 1 — the picker, in the cart" });
      ringRect(f, day14("day"), 21);
    },
    // 1 · the picker: methods, a day, a time slot, wherever the theme shows a cart
    () => {
      E.el(S, `<div class="abs d blue mul nowrap" style="left:120px;top:150px;font-size:118px">Shoppers choose</div>`);
      E.el(S, `<div class="abs s orange mul nowrap" style="left:112px;top:252px;font-size:104px">a day &amp; a time slot</div>`);
      E.el(S, `<div class="abs m inkc" style="left:124px;top:440px;font-size:20px;letter-spacing:.24em">Right in your</div>`);
      [["Cart", "var(--blue)"], ["Cart drawer", "var(--ink)"], ["Product page", "var(--orange)"]].forEach(([txt, c], i) =>
        E.dymo(S, txt, { x: 120 + i * 18, y: 486 + i * 96, color: c, rot: [-1.2, 0.8, -0.6][i], size: 50 }));
      E.el(S, `<div class="abs s inkc mul nowrap" style="left:122px;top:800px;font-size:58px">only open days can be picked.</div>`);
      const f = fig(S, P + "fig-slot.png", { x: 1006, y: 118, w: 756, rot: -1.1, cssW: 540, cap: "Fig. 1 — the picker, in the cart" });
      ringRect(f, day14("day"), 21);
      ringRect(f, FIG.day.chips[1], 22);
      FIG.day.methods.forEach((m, i) => ringRect(f, m, 40 + i, { color: "var(--blue)", width: 6 }, [10, 14]));
    },
    // 2 · daily and per-slot limits: what you set in the admin, what shoppers then see
    () => {
      E.el(S, `<div class="abs d inkc mul nowrap" style="left:120px;top:150px;font-size:96px">How many fit?</div>`);
      E.el(S, `<div class="abs d blue mul tex nowrap" style="left:100px;top:246px;font-size:440px">20</div>`);
      E.el(S, `<div class="abs s orange mul nowrap" style="left:122px;top:628px;font-size:124px">a day,</div>`);
      E.el(S, `<div class="abs m inkc" style="left:124px;top:790px;font-size:20px;letter-spacing:.2em">or per time slot · 8 · 6 · 6</div>`);
      E.dymo(S, "Cut-off · 2 pm the day before", { x: 120, y: 850, color: "var(--blue)", rot: -0.8, size: 28 });
      const c = fig(S, L + "capacity.png", { x: 716, y: 236, w: 430, rot: 1.4, cssW: 400, cap: "Fig. 2 — your limits, in the admin" });
      const f = fig(S, W + "w-limits.png", { x: 1250, y: 150, w: 510, rot: -1.3, cssW: 510, cap: "Fig. 3 — what shoppers see" });
      ringRect(f, { x: 12, y: 472, w: 170, h: 53 }, 23);
      const st = on(E.stamp(S, "Full", { x: 900, y: 790, rot: -9, size: 100 }));
      st.style.zIndex = 5;
      void c;
    },
    // 3 · checkout follows the picker, and stops orders without a date
    () => {
      E.el(S, `<div class="abs s orange mul nowrap" style="left:114px;top:150px;font-size:120px">At checkout,</div>`);
      E.el(S, `<div class="abs d inkc mul nowrap" style="left:120px;top:312px;font-size:124px">only the option</div>`);
      E.el(S, `<div class="abs d blue mul nowrap" style="left:120px;top:426px;font-size:124px">they picked.</div>`);
      E.el(S, `<div class="abs d blue mul nowrap" style="left:120px;top:640px;font-size:150px">No date?</div>`);
      const no = E.el(S, `<div class="abs d orange mul nowrap" style="left:120px;top:780px;font-size:150px">No order.</div>`);
      const a = fig(S, L + "co-delivery.png", { x: 1060, y: 150, w: 690, rot: -1.1, cssW: 640, cap: "Fig. 4 — checkout, after the shopper picked" });
      ringRect(a, RECTS["co-delivery"].option, 51, {}, [26, 22]);
      const b = fig(S, L + "co-payment.png", { x: 1100, y: 600, w: 650, rot: 1.3, cssW: 640, cap: "Fig. 5 — checkout, when the date is missing" });
      void b;
      const r = box(no);
      ink(svg, E.arrowD(r.x + r.w + 30, r.y + r.h / 2, 1090, 830, -0.25), { width: 8 });
      ink(svg, `M1080 808 L1094 832 L1068 846`, { width: 8 });
    },
    // 4 · the orders calendar: every order on its day, full days stand out
    () => {
      E.el(S, `<div class="abs d blue mul nowrap" style="left:120px;top:150px;font-size:112px">Every order</div>`);
      E.el(S, `<div class="abs s orange mul nowrap" style="left:112px;top:248px;font-size:124px">on its day.</div>`);
      E.dymo(S, "Move orders · a few clicks", { x: 120, y: 470, color: "var(--blue)", rot: -1, size: 30 });
      E.dymo(S, "Customers change · until 48 h before", { x: 120, y: 548, color: "var(--orange)", rot: 0.8, size: 26 });
      E.ticket(S, { no: 1047, day: "Thu 12 → Thu 19 Nov", lines: ["1 × Croissant box"], slot: "Moved by Priya", x: 150, y: 660, rot: -5, w: 330 });
      const f = fig(S, L + "orders.png", { x: 836, y: 150, w: 900, rot: 0.9, cssW: 860, cap: "Fig. 6 — the orders calendar, in the admin" });
      ringRect(f, RECTS.orders["14"], 61, {}, [14, 12]);
      ringRect(f, RECTS.orders["13"], 62, { color: "var(--blue)", width: 6 }, [10, 9]);
    },
    // 5 · print the day; tomorrow's orders by email
    () => {
      E.el(S, `<div class="abs d blue mul tex nowrap" style="left:116px;top:148px;font-size:230px">Every</div>`);
      E.el(S, `<div class="abs s orange mul nowrap" style="left:108px;top:330px;font-size:190px">morning,</div>`);
      E.el(S, `<div class="abs m inkc" style="left:124px;top:556px;font-size:20px;letter-spacing:.2em">day sheet · route sheet · production list</div>`);
      fig(S, L + "email.png", { x: 120, y: 636, w: 500, rot: -2, cssW: 440, pad: 0, cap: "Fig. 8 — tomorrow's orders, by email", capDy: -40 });
      const r = fig(S, P + "route.png", { x: 960, y: 706, w: 740, rot: -1.8, cssW: 900, pad: 18 });
      const d = fig(S, P + "daysheet.png", { x: 1010, y: 130, w: 730, rot: 1.2, cssW: 900, pad: 18, cap: "Fig. 7 — the day sheet, as printed" });
      void r; void d;
    },
    // 6 · holidays and languages: the same picker, in Arabic, right to left
    () => {
      const F = { JP: "'Noto Sans JP'", KR: "'Noto Sans KR'", AR: "'Noto Kufi Arabic'", HE: "'Noto Sans Hebrew'" };
      const noto = (f) => `font-family:${f};font-weight:900;line-height:1.12;mix-blend-mode:multiply;`;
      const rows = [
        [["Choose a date", "en", "d blue mul", 150]],
        [["Datum wählen", "de", "s orange mul", 104], ["Choisir une date", "fr", "d inkc mul", 48]],
        [["日付を選択", "ja", "blue", 96, F.JP], ["날짜 선택", "ko", "orange", 78, F.KR]],
        [["Scegli una data", "it", "s blue mul", 84], ["Elige una fecha", "es", "d orange mul", 66]],
      ];
      let y = 146;
      rows.forEach((row) => {
        const r = E.el(S, `<div class="abs nowrap" style="left:120px;top:${y}px;display:flex;gap:44px;align-items:baseline"></div>`);
        row.forEach(([txt, lc, cls, sz, fam]) => E.el(r, `<div class="spec nowrap ${cls}" style="font-size:${sz}px;${fam ? noto(fam) : ""}">${txt}<span class="lc">${lc}</span></div>`));
        y += r.offsetHeight + 4;
      });
      const rtl = E.el(S, `<div class="abs nowrap" style="left:120px;top:${y + 10}px;display:flex;gap:44px;align-items:baseline"></div>`);
      E.el(rtl, `<div class="blue spec" dir="rtl" style="${noto(F.HE)}font-size:62px">בחרו תאריך<span class="lc">he</span></div>`);
      E.el(rtl, `<div class="orange spec" dir="rtl" style="${noto(F.AR)}font-size:62px">اختر تاريخًا<span class="lc">ar</span></div>`);
      const h = fig(S, L + "holidays.png", { x: 124, y: 712, w: 360, rot: -2.2, cssW: 420, pad: 0, cap: "Fig. 10 — days off, in the admin", capDy: -40 });
      void h;
      const f = fig(S, P + "fig-ar.png", { x: 1166, y: 150, w: 567, pad: 18, rot: 1.3, cssW: 540, cap: "Fig. 9 — the same picker, in Arabic" });
      ringRect(f, day14("ar"), 99);
      E.dymo(S, "Holidays · every year", { x: 580, y: 800, color: "var(--blue)", rot: -2, size: 32 });
      E.dymo(S, "Vacation mode · on", { x: 600, y: 880, color: "var(--orange)", rot: 1, size: 32 });
    },
  ];
  PAGES[n]();
  window.READY = true;
})().catch((e) => { window.BOOT_ERROR = String(e && e.stack || e); console.error(e); });
