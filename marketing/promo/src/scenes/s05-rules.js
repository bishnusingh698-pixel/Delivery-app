/* 05 · House rules, punched out on label-maker tape: cut-off, prep time, areas, holidays, vacation. */
SCENES["s05-rules"] = (S, T, tl) => {
  const box = (el) => { const a = el.getBoundingClientRect(), b = S.getBoundingClientRect(); return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height }; };
  const svg = E.svg(S);
  const specs = [
    ["Cut-off · 2 pm the day before", "var(--blue)", 120, 168, -1.2, 0],
    ["Prep time · 2 days", "var(--orange)", 196, 330, 0.9, 1],
    ["Delivery areas · 11215 · 11217 · 11238", "var(--ink)", 140, 492, -0.6, 2],
    ["Holidays · 25 Dec · every year", "var(--blue)", 232, 654, 1.0, 3],
    ["Vacation mode · on", "var(--orange)", 160, 816, -0.8, 4],
  ];
  const tapes = specs.map(([txt, col, x, y, rot, li]) => {
    const d = E.dymo(S, txt, { x, y, color: col, rot, size: 58 });
    E.emboss(tl, d, T.l(li) - 0.05, T, 36);
    return d;
  });
  const n = (i) => E.el(S, `<div class="abs m inkc" style="left:${specs[i][2] - 62}px;top:${specs[i][3] + 26}px;font-size:18px;letter-spacing:.1em;opacity:.75">0${i + 1}</div>`);
  specs.forEach((s, i) => { const el = n(i); el.style.left = "64px"; tl.fromTo(el, { opacity: 0 }, { opacity: 0.75, duration: 0.01 }, T.l(i) - 0.05); });

  // 01 · a cut line across the rest of the row
  const b0 = box(tapes[0]);
  const cut = E.el(S, `<div class="abs" style="left:${b0.x + b0.w + 40}px;top:${b0.y + b0.h / 2 - 2}px;width:${1800 - b0.x - b0.w - 40}px;height:0;border-top:4px dashed var(--ink);opacity:.8"></div>`);
  E.wipe(tl, cut, T.w(0, "cut") + 0.1, 0.5, "right", "power1.inOut");
  const cutLab = E.el(S, `<div class="abs s orange nowrap" style="left:${b0.x + b0.w + 60}px;top:${b0.y + b0.h / 2 + 14}px;font-size:46px">after 2 pm, tomorrow closes</div>`);
  tl.fromTo(cutLab, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35, ease: "expo.out" }, T.w(0, "times"));
  T.sfx("scribble", T.w(0, "cut") + 0.1, 0.4);

  // 02 · two days of prep, drawn as a bracket
  const b1 = box(tapes[1]);
  const px = b1.x + b1.w + 60, py = b1.y + b1.h / 2;
  const prep = E.el(S, `<div class="abs m inkc nowrap" style="left:${px}px;top:${py - 30}px;font-size:22px;letter-spacing:.16em">Thu&nbsp;5 → Sat&nbsp;7</div>`);
  tl.fromTo(prep, { opacity: 0 }, { opacity: 1, duration: 0.01 }, T.w(1, "time") - 0.05);
  E.draw(tl, E.path(svg, `M${px} ${py + 14} Q${px + 120} ${py + 44} ${px + 250} ${py + 14}`, { width: 6 }), T.w(1, "time"), 0.4);

  // 03 · the postcodes get a loop
  const b2 = box(tapes[2]);
  E.draw(tl, E.path(svg, E.circleD(b2.x + b2.w * 0.745, b2.y + b2.h / 2 + 2, b2.w * 0.27, b2.h * 0.78, 51, 1.12), { width: 8 }), T.w(2, "areas") - 0.1, 0.5);
  T.sfx("scribble", T.w(2, "areas"), 0.5);

  // 04 · a tear-off page for Christmas, with a "comes back every year" loop
  const b3 = box(tapes[3]);
  const hx = Math.max(b3.x + b3.w + 150, 1490), hy = 610;
  const pg = E.el(S, `<div class="slip" style="left:${hx}px;top:${hy}px;width:190px;height:200px;text-align:center">
    <div style="background:var(--blue);color:var(--paper);font:600 16px/34px 'IBM Plex Mono';letter-spacing:.24em">DEC</div>
    <div class="d blue mul" style="font-size:132px;margin-top:10px">25</div></div>`);
  gsap.set(pg, { rotation: 4 });
  E.paste(tl, pg, T.w(3, "holidays") - 0.1, { T, gain: 0.5 });
  E.draw(tl, E.path(svg, E.circleD(hx + 95, hy + 100, 150, 128, 61, 0.86, -1.2), { width: 8 }), T.w(3, "come"), 0.55, "power1.inOut");
  E.draw(tl, E.path(svg, `M${hx + 95 + 140} ${hy + 150} l12 -40 l26 34`, { width: 8 }), T.w(3, "year") - 0.05, 0.16);
  T.sfx("scribble", T.w(3, "come"), 0.55);

  // 05 · vacation: a run of days closes in one sweep
  const b4 = box(tapes[4]);
  const vx = Math.max(b4.x + b4.w + 70, 1040), vy = 834;
  const ds = [24, 25, 26, 27, 28, 29, 30, 31, 1, 2, 3];
  const strip = E.el(S, `<div class="abs" style="left:${vx}px;top:${vy}px;display:flex;gap:6px"></div>`);
  ds.forEach((d) => E.el(strip, `<div style="width:56px;height:62px;border:2.5px solid var(--blue);mix-blend-mode:multiply;font:600 20px/58px 'IBM Plex Mono';text-align:center;color:var(--blue)">${d}</div>`));
  tl.fromTo(strip.children, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.025, ease: "expo.out" }, T.w(4, "vacation") - 0.1);
  const fl = E.flood(S, { x: vx - 8, y: vy + 18, w: ds.length * 62 + 10, h: 28 });
  E.swipe(tl, fl, T.w(4, "mode") - 0.02, 0.4);
  const back = E.el(S, `<div class="abs s orange nowrap" style="left:${vx}px;top:${vy + 78}px;font-size:44px">back on Jan 4</div>`);
  tl.fromTo(back, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35, ease: "expo.out" }, T.w(4, "mode") + 0.3);
};
