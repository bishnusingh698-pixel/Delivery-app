/* 02 · Meet Pickday: customers pick the day, Pickday keeps count (tallies under each day of the week). */
SCENES["s02-pickday"] = (S, T, tl) => {
  // the headline is set word by word, as it is spoken
  const a = E.el(S, `<div class="abs d blue mul nowrap" style="left:118px;top:148px;font-size:150px">So let customers</div>`);
  const b = E.el(S, `<div class="abs s orange mul nowrap" style="left:108px;top:262px;font-size:212px">pick the day,</div>`);
  const c = E.el(S, `<div class="abs d inkc mul nowrap" style="left:120px;top:548px;font-size:104px">and let <span class="blue">Pickday</span> keep count.</div>`);
  const spA = E.split(a), spB = E.split(b), spC = E.split(c);
  E.riseWords(tl, spA.words, [T.w(0, "so"), T.w(0, "let"), T.w(0, "customers")].map((t) => t - 0.04));
  E.riseWords(tl, spB.words, [T.w(0, "pick"), T.w(0, "the"), T.w(0, "day")].map((t) => t - 0.04), { dur: 0.7 });
  E.riseWords(tl, spC.words, ["and", "let", "pickday", "keep", "count"].map((k) => T.w(1, k) - 0.04));

  // the week, printed along the foot of the sheet
  const days = [["Mon", 9, 4], ["Tue", 10, 7], ["Wed", 11, 3], ["Thu", 12, 9], ["Fri", 13, 20], ["Sat", 14, 14], ["Sun", 15, -1]];
  const cw = 226, gap = 13, x0 = 120, y0 = 712;
  const svg = E.svg(S);
  const strokes = [];
  days.forEach(([dn, dd, n], i) => {
    const x = x0 + i * (cw + gap);
    const cell = E.el(S, `<div class="cell" style="left:${x}px;top:${y0}px;width:${cw}px;height:270px">
      <div class="m" style="font-size:17px;letter-spacing:.24em">${dn}</div>
      <div class="d blue mul" style="font-size:118px;margin-top:8px">${dd}</div></div>`);
    tl.fromTo(cell, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, ease: "expo.out" }, 0.12 + i * 0.05);
    if (n < 0) {
      const h = E.el(S, `<div class="hatch" style="left:${x}px;top:${y0 + 150}px;width:${cw}px;height:96px;opacity:.5"></div>`);
      const cl = E.el(S, `<div class="abs m inkc" style="left:${x}px;top:${y0 + 252}px;font-size:15px;letter-spacing:.24em">Closed</div>`);
      tl.fromTo([h, cl], { opacity: 0 }, { opacity: 1, duration: 0.01 }, 0.5);
      return;
    }
    E.tallyD(x + 6, y0 + 168, n, { h: 58, gap: 10, group: 15, seed: 40 + i }).forEach((d) => strokes.push([d, i, n]));
    const lab = E.el(S, `<div class="abs m ${dd === 14 ? "orange" : "inkc"}" style="left:${x}px;top:${y0 + 252}px;font-size:15px;letter-spacing:.2em">${n === 20 ? "Full" : `${n} / 20`}</div>`);
    tl.fromTo(lab, { opacity: 0 }, { opacity: 1, duration: 0.01 }, T.w(1, "count") + 0.2 + i * 0.06);
  });
  // circle Saturday the moment it is picked
  const satX = x0 + 5 * (cw + gap);
  const ring = E.path(svg, E.circleD(satX + 62, y0 + 92, 92, 72, 7), { width: 10 });
  E.draw(tl, ring, T.w(0, "pick") - 0.02, 0.5);
  T.sfx("scribble", T.w(0, "pick"), 0.8);
  // keep count: every day's orders are tallied, quickly, in ink
  const t0 = T.w(1, "keep") - 0.05;
  strokes.forEach(([d, i], k) => {
    const p = E.path(svg, d, { color: i === 5 ? "var(--orange)" : "var(--ink)", width: 5.5 });
    E.draw(tl, p, t0 + k * 0.016, 0.07, "power1.out");
  });
  T.sfx("scribble", t0, 0.6); T.sfx("scribble", t0 + 0.45, 0.5);

  // the app icon, slapped on as Pickday is named
  const st = E.sticker(S, { x: 1468, y: 150, size: 300, rot: 7 });
  E.slap(tl, st, T.w(1, "pickday") + 0.04, T);
};
