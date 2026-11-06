/* Builds the pad of sheets, one GSAP timeline per scene on a master timeline, and the tear-offs
   between them. window.seek(t) renders the frame at t seconds; window.READY flags the build. */
(async function () {
  gsap.registerPlugin(SplitText, DrawSVGPlugin, MotionPathPlugin, CustomEase);
  const TL = window.TIMELINE;
  const LABELS = {
    "s01-saturday": "The weekend rush", "s02-pickday": "Meet Pickday", "s03-picker": "The picker", "s04-limits": "Daily limits",
    "s05-rules": "House rules", "s06-checkout": "Checkout", "s07-orders": "Behind the counter", "s08-print": "Every morning",
    "s09-language": "Languages", "s10-plans": "Every plan", "s11-cta": "Pickday",
  };

  // Fonts and images first: SplitText measures real glyphs.
  const fonts = [
    '900 100px "Archivo Variable"', '500 100px "Archivo Variable"', 'italic 560 100px "Fraunces Variable"',
    '500 20px "IBM Plex Mono"', '600 20px "IBM Plex Mono"', '900 100px "Noto Sans JP"', '900 100px "Noto Sans KR"', '900 100px "Noto Sans SC"',
    '900 100px "Noto Kufi Arabic"', '900 100px "Noto Sans Hebrew"', '900 100px "Noto Sans Devanagari"', '900 100px "Noto Sans"',
  ];
  const samples = { JP: "店舗受取", KR: "픽업", SC: "自提", Arabic: "الاستلام", Hebrew: "איסוף", Devanagari: "पिकअप", "Noto Sans\"": "Παραλαβή" };
  await Promise.all(fonts.map((f) => { const k = Object.keys(samples).find((s) => f.includes(s)); return document.fonts.load(f, k ? samples[k] : "AaBb019"); }));
  // Every glyph the scenes print (accents, ę, ọ, Greek, CJK...) lives in some unicode-range subset:
  // load them all up front, using the scene sources themselves as the sample text.
  const src = (await Promise.all([...document.querySelectorAll('script[src*="scenes/"]')].map((s) => fetch(s.src).then((r) => r.text())))).join("");
  await Promise.all(fonts.map((f) => document.fonts.load(f, src)));
  await document.fonts.ready;
  window.FIG = await (await fetch("../build/parts/fig.json")).json();
  await Promise.all(["fig-empty", "fig-day", "fig-slot", "fig-ar", "daysheet", "route", "production"].map((n) => new Promise((ok) => { const i = new Image(); i.onload = i.onerror = ok; i.src = `../build/parts/${n}.png`; })));

  const pad = document.getElementById("pad");
  const master = gsap.timeline({ paused: true });
  const n = TL.scenes.length;
  const sheets = [];
  TL.scenes.forEach((sc, i) => {
    const sheet = E.el(pad, `<section class="sheet" id="${sc.id}"></section>`, { zIndex: String(n - i) });
    E.el(sheet, `<div class="perf"></div>`);
    [[44, 58], [1846, 58], [44, 1022], [1846, 1022]].forEach(([x, y]) => E.el(sheet, `<div class="reg">${E.regMark()}</div>`, { left: `${x}px`, top: `${y}px` }));
    E.el(sheet, `<div class="label">§ ${String(i + 1).padStart(2, "0")} &nbsp;·&nbsp; <b>${LABELS[sc.id] ?? ""}</b></div>`);
    E.el(sheet, `<div class="foot">Pickday — delivery date picker</div>`);
    E.el(sheet, `<div class="swatch"><i style="background:var(--blue)"></i><i style="background:var(--orange)"></i><i style="background:var(--over)"></i></div>`);
    const content = E.el(sheet, `<div class="content" style="position:absolute;inset:0"></div>`);
    sheets.push(sheet);
    const T = {
      id: sc.id, dur: sc.dur, start: sc.start, beat: TL.beat, sheet,
      l: (i) => sc.lines[i].s, le: (i) => sc.lines[i].e,
      word(i, k) {
        const ws = sc.lines[i].words;
        if (typeof k === "number") return ws[k];
        const [txt, nth] = k.split("#");
        let seen = 0;
        const hit = ws.find((x) => x.w.toLowerCase().replace(/[^\p{L}']/gu, "").startsWith(txt.toLowerCase()) && ++seen === Number(nth || 1));
        if (!hit) throw new Error(`no word "${k}" in ${sc.id} line ${i}`);
        return hit;
      },
      w(i, k) { return this.word(i, k).s; },
      we(i, k) { return this.word(i, k).e; },
      sfx: (name, t, gain = 1) => window.SFX.push({ name, t: +(sc.start + t).toFixed(3), gain }),
    };
    const tl = gsap.timeline();
    try { window.SCENES[sc.id]?.(content, T, tl); } catch (e) { console.error(sc.id, e); throw e; }
    tl.set({}, {}, sc.dur); // keep each scene timeline exactly its length
    master.add(tl, sc.start);
  });

  // Only the top two sheets are ever displayed; tear the top one off at each boundary.
  sheets.forEach((s, i) => { if (i > 1) gsap.set(s, { display: "none" }); });
  const bindNo = document.getElementById("bindNo");
  bindNo.textContent = `Sheet 01 / ${String(n).padStart(2, "0")}`;
  for (let i = 0; i < n - 1; i++) {
    const at = TL.scenes[i + 1].start - 0.16;
    const dir = i % 2 ? 1 : -1, r = E.rng(300 + i);
    const s = sheets[i];
    master.set(s, { transformOrigin: dir < 0 ? "0% 0%" : "100% 0%" }, at);
    master.to(s, { rotation: dir * 1.4, y: 5, duration: 0.12, ease: "power2.out" }, at);
    master.to(s, { boxShadow: "0 36px 0 rgba(70,50,25,.16)", duration: 0.25, ease: "power1.out" }, at);
    master.to(s, { rotation: dir * (13 + r() * 6), x: dir * -140, y: 1350, duration: 0.6, ease: "power3.in" }, at + 0.12);
    master.set(s, { display: "none" }, at + 0.75);
    if (sheets[i + 2]) master.set(sheets[i + 2], { display: "block" }, at + 0.75);
    master.set(bindNo, { textContent: `Sheet ${String(i + 2).padStart(2, "0")} / ${String(n).padStart(2, "0")}` }, at + 0.2);
    window.SFX.push({ name: "tear", t: +at.toFixed(3), gain: 1 });
  }

  // fixed camera, like a copy stand over the pad; the grain is part of the print, so it holds still too
  window.seek = (t) => { master.seek(t, false); }; // no return value: page.evaluate would try to serialise the timeline
  window.TOTAL = TL.total;
  window.SFX.sort((a, b) => a.t - b.t);
  window.seek(0);
  window.READY = true;
})().catch((e) => { window.BOOT_ERROR = String(e && e.stack || e); console.error(e); });
