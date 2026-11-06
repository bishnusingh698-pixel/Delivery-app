/* 07 · Behind the counter: a wall calendar prints, every order lands on its day; one is moved with
   a couple of clicks, one moves itself (the customer changed it), then the deadline is set. */
SCENES["s07-orders"] = (S, T, tl) => {
  const r = E.rng(707);
  const X0 = 120, Y0 = 176, CW = 240, RH = 404, names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const svg = E.svg(S);
  // grid, drawn like a ruling pen
  for (let i = 0; i <= 2; i++) E.draw(tl, E.path(svg, `M${X0} ${Y0 + i * RH} L${X0 + 7 * CW} ${Y0 + i * RH}`, { color: "var(--blue)", width: i ? 2.5 : 4, rough: false }), 0.12 + i * 0.08, 0.5, "power2.inOut");
  for (let j = 1; j < 7; j++) E.draw(tl, E.path(svg, `M${X0 + j * CW} ${Y0} L${X0 + j * CW} ${Y0 + 2 * RH}`, { color: "var(--blue)", width: 2, rough: false }), 0.2 + j * 0.04, 0.45, "power2.inOut");
  names.forEach((n, j) => {
    const h = E.el(S, `<div class="abs m inkc" style="left:${X0 + j * CW + 14}px;top:${Y0 - 34}px;font-size:17px;letter-spacing:.26em">${n}</div>`);
    tl.fromTo(h, { opacity: 0 }, { opacity: 1, duration: 0.01 }, 0.3 + j * 0.03);
  });
  const cell = (d) => { const i = d - 9; return { x: X0 + (i % 7) * CW, y: Y0 + Math.floor(i / 7) * RH }; };
  for (let d = 9; d <= 22; d++) {
    const c = cell(d), sun = (d - 9) % 7 === 6;
    const num = E.el(S, `<div class="abs d ${d === 14 ? "orange" : "blue"} mul" style="left:${c.x + 14}px;top:${c.y + 12}px;font-size:76px">${d}</div>`);
    tl.fromTo(num, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.4, ease: "expo.out" }, 0.35 + (d - 9) * 0.025);
    if (sun) {
      const h = E.el(S, `<div class="hatch" style="left:${c.x + 3}px;top:${c.y + 100}px;width:${CW - 6}px;height:${RH - 104}px;opacity:.28"></div>`);
      tl.fromTo(h, { opacity: 0 }, { opacity: 0.28, duration: 0.3 }, 0.6);
    }
  }
  // orders: [day, no, slot, name/item]
  const orders = [
    [9, 1012, "9–12", "Ana · Sourdough"], [9, 1015, "3–6", "Tom · Rolls"],
    [10, 1018, "9–12", "Lea · Cake"], [10, 1019, "12–3", "Sam · Tart"], [10, 1021, "3–6", "Ivy · Loaf"],
    [11, 1022, "12–3", "Kai · Box"],
    [12, 1025, "9–12", "Noa · Cake"], [12, 1027, "12–3", "Ben · Rolls"], [12, 1047, "12–3", "Priya · Croissants"],
    [13, 1030, "9–12", "Eli · Cake"], [13, 1031, "12–3", "Mia · Loaf"], [13, 1033, "3–6", "Zoe · Box"],
    [14, 1041, "9–12", "Maya · Cake"], [14, 1044, "9–12", "Daniel · Sourdough"], [14, 1038, "8–11", "Leo · Rolls"],
    [16, 1051, "12–3", "Ada · Tart"], [18, 1053, "9–12", "Jon · Cake"], [18, 1054, "3–6", "Uma · Loaf"],
    [19, 1055, "12–3", "Ray · Box"], [20, 1057, "9–12", "Cy · Rolls"], [21, 1058, "9–12", "Bo · Cake"], [21, 1059, "12–3", "Al · Loaf"],
  ];
  const more = { 10: 4, 12: 6, 13: 17, 14: 11, 21: 2 };
  const seen = {}, tk = {};
  const t0 = T.w(0, "every") - 0.1, t1 = T.w(0, "day") + 0.1;
  orders.forEach(([d, no, slot, who], i) => {
    const c = cell(d), k = (seen[d] = (seen[d] ?? -1) + 1);
    const x = c.x + 12, y = c.y + 104 + k * 76, rot = (r() - 0.5) * 3;
    const el = E.el(S, `<div class="ticket" style="width:${CW - 24}px;padding:9px 12px 16px;font-size:14px;line-height:1.35"><div><b style="font-weight:600">#${no}</b> · <span style="color:var(--blue)">${slot}</span></div><div>${who}</div></div>`);
    gsap.set(el, { x, y, rotation: rot });
    tk[no] = { el, x, y, rot };
    const at = t0 + (i / (orders.length - 1)) * (t1 - t0);
    tl.fromTo(el, { x: x - 260 - r() * 200, y: y - 420 - r() * 160, rotation: rot - 25, opacity: 0 }, { x, y, rotation: rot, opacity: 1, duration: 0.38, ease: "power3.out" }, at - 0.38);
    tl.set(el, { opacity: 1 }, at - 0.36);
    if (i % 2 === 0) T.sfx("paper", at - 0.05, 0.38);
  });
  Object.entries(more).forEach(([d, n]) => {
    const c = cell(+d);
    const m = E.el(S, `<div class="abs m ${+d === 13 ? "orange" : "inkc"}" style="left:${c.x + 14}px;top:${c.y + RH - 34}px;font-size:15px;letter-spacing:.16em">${+d === 13 ? "Full · 20 / 20" : `+ ${n} more`}</div>`);
    tl.fromTo(m, { opacity: 0 }, { opacity: 1, duration: 0.01 }, t1 + 0.05);
  });

  // move #1044 from Saturday 14 to Tuesday 17: two clicks
  const mv = tk[1044], dst = cell(17), dx = dst.x + 12, dy = dst.y + 104;
  const cur = E.el(S, `<svg class="abs" width="44" height="56" viewBox="0 0 44 56" style="left:0;top:0;overflow:visible"><path d="M4 3 L4 44 L15 34 L23 52 L31 48 L23 31 L38 31 Z" fill="#231f27" stroke="#fbf8f1" stroke-width="3.5" stroke-linejoin="round"/></svg>`);
  gsap.set(cur, { x: mv.x + 170, y: mv.y + 120, autoAlpha: 0 });
  const tm = T.w(1, "move");
  tl.to(cur, { autoAlpha: 1, duration: 0.01 }, tm - 0.3);
  tl.fromTo(cur, { x: mv.x + 260, y: mv.y + 200 }, { x: mv.x + 150, y: mv.y + 34, duration: 0.3, ease: "power2.out" }, tm - 0.3);
  tl.to(cur, { scale: 0.85, duration: 0.06, yoyo: true, repeat: 1 }, tm);
  T.sfx("click", tm, 0.9);
  tl.to(mv.el, { scale: 1.08, rotation: -4, filter: "drop-shadow(16px 20px 0px rgba(70,50,25,0.2))", duration: 0.18, ease: "power2.out" }, tm + 0.02);
  const path = `M${mv.x} ${mv.y} Q${(mv.x + dx) / 2} ${Math.min(mv.y, dy) - 260} ${dx} ${dy}`;
  const ta = T.w(1, "orders") + 0.1, tb = T.w(1, "clicks");
  tl.to(mv.el, { motionPath: { path, autoRotate: false }, duration: tb - ta, ease: "power2.inOut" }, ta);
  tl.to(cur, { motionPath: { path: `M${mv.x + 150} ${mv.y + 34} Q${(mv.x + dx) / 2 + 150} ${Math.min(mv.y, dy) - 226} ${dx + 150} ${dy + 34}` }, duration: tb - ta, ease: "power2.inOut" }, ta);
  tl.to(mv.el, { scale: 1, rotation: mv.rot, filter: "drop-shadow(5px 6px 0px rgba(90,70,40,0.22))", duration: 0.16, ease: "power2.in" }, tb);
  tl.to(cur, { scale: 0.85, duration: 0.06, yoyo: true, repeat: 1 }, tb);
  T.sfx("click", tb, 0.9);
  tl.to(cur, { autoAlpha: 0, duration: 0.2 }, tb + 0.5);
  const trail = E.path(svg, `M${mv.x + 108} ${mv.y + 40} Q${(mv.x + dx) / 2 + 108} ${Math.min(mv.y, dy) - 220} ${dx + 108} ${dy - 6}`, { width: 6, color: "var(--orange)", opacity: 0.9 });
  E.draw(tl, trail, ta, tb - ta, "power2.inOut");
  tl.to(trail, { opacity: 0, duration: 0.4 }, tb + 0.6);

  // #1047 moves itself: the customer changed the date (Thu 12 -> Thu 19)
  const cv = tk[1047], c19 = cell(19), cy = c19.y + 104 + 76;
  const tc = T.w(1, "change"), te = T.w(1, "date");
  tl.to(cv.el, { scale: 1.06, filter: "drop-shadow(14px 18px 0px rgba(70,50,25,0.2))", duration: 0.15 }, tc - 0.2);
  tl.to(cv.el, { x: c19.x + 12, y: cy, rotation: 2, duration: te - tc + 0.1, ease: "power3.inOut" }, tc - 0.05);
  tl.to(cv.el, { scale: 1, filter: "drop-shadow(5px 6px 0px rgba(90,70,40,0.22))", duration: 0.15, ease: "power2.in" }, te + 0.05);
  const tag = E.el(S, `<div class="abs s orange nowrap" style="left:${c19.x + 30}px;top:${cy + 70}px;font-size:34px;transform:rotate(-4deg)">moved by Priya</div>`);
  tl.fromTo(tag, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3 }, te + 0.1);
  T.sfx("whoosh", tc - 0.05, 0.4);

  // the deadline you set, punched on tape and stuck on the calendar
  const dl = E.dymo(S, "Customer changes · until 48 h before", { x: 790, y: 916, color: "var(--orange)", rot: -1.6, size: 40 });
  E.emboss(tl, dl, T.w(1, "deadline") - 0.25, T, 48);
};
