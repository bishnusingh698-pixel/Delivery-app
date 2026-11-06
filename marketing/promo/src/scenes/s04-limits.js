/* 04 · Daily limits: a capacity card for Saturday; every order punches a hole; when the last
   hole is punched the day is stamped full and closes on its own. */
SCENES["s04-limits"] = (S, T, tl) => {
  const r = E.rng(404);
  // left: the number the merchant decides
  const q = E.el(S, `<div class="abs d inkc mul nowrap" style="left:120px;top:150px;font-size:96px">How many fit?</div>`);
  E.riseWords(tl, E.split(q).words, [T.w(0, "how"), T.w(0, "many"), T.w(0, "fit")].map((t) => t - 0.04));
  const big = E.el(S, `<div class="abs d blue mul tex nowrap" style="left:104px;top:236px;font-size:560px">20</div>`);
  E.squeeze(tl, big, T.w(0, "day") - 0.32, { stagger: 0.07, dur: 0.6 });
  const per = E.el(S, `<div class="abs s orange mul nowrap" style="left:122px;top:700px;font-size:124px">a day,</div>`);
  E.riseWords(tl, E.split(per).words, [T.w(0, "a"), T.w(0, "day")].map((t) => t - 0.04), { dur: 0.6 });
  const slotLine = E.el(S, `<div class="abs m inkc nowrap" style="left:126px;top:868px;font-size:22px;letter-spacing:.16em">or per time slot: 8 · 6 · 6</div>`);
  E.type(tl, slotLine, T.w(0, "each") - 0.05, 40);
  const booked = E.el(S, `<div class="abs m blue nowrap" style="left:128px;top:924px;font-size:20px;letter-spacing:.2em">Booked: 0</div>`);
  tl.fromTo(booked, { opacity: 0 }, { opacity: 1, duration: 0.01 }, 2.1);

  // right: the capacity card
  const W = 980, H = 760;
  const card = E.el(S, `<div class="slip" style="left:830px;top:166px;width:${W}px;height:${H}px"></div>`);
  gsap.set(card, { rotation: -1.4 });
  E.paste(tl, card, 0.42, { T, gain: 0.8 });
  E.el(card, `<div class="abs m inkc" style="left:46px;top:40px;font-size:18px;letter-spacing:.26em">Capacity card · No. 14</div>`);
  E.el(card, `<div class="abs d blue mul" style="left:44px;top:74px;font-size:84px">Sat 14 Nov</div>`);
  E.el(card, `<div class="abs" style="left:46px;right:46px;top:178px;border-top:2.5px solid var(--blue);mix-blend-mode:multiply"></div>`);
  const rows = [["09:00–12:00", 8], ["12:00–15:00", 6], ["15:00–18:00", 6]];
  const holes = [];
  rows.forEach(([lab, cap], ri) => {
    const y = 214 + ri * 178;
    E.el(card, `<div class="abs m inkc" style="left:46px;top:${y + 10}px;font-size:19px;letter-spacing:.14em">${lab}</div>`);
    const capEl = E.el(card, `<div class="abs d blue mul" style="left:46px;top:${y + 44}px;font-size:66px">/ ${cap}</div>`);
    tl.fromTo(capEl, { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.3, ease: "expo.out" }, T.w(0, "each") + ri * 0.17);
    for (let j = 0; j < cap; j++) {
      const x = 292 + j * 80, hy = y + 36;
      E.el(card, `<div class="hole" style="left:${x}px;top:${hy}px">${j + 1}</div>`);
      holes.push({ ri, x, y: hy });
    }
    if (ri < 2) E.el(card, `<div class="abs" style="left:46px;right:46px;top:${y + 150}px;border-top:2px dashed rgba(37,70,179,.45)"></div>`);
  });
  // punch order: orders arrive in any slot, the last one fills the card
  const order = [], left = rows.map((x) => x[1]);
  while (order.length < 20) { const ri = Math.floor(r() * 3); if (left[ri] > 0) { order.push(ri); left[ri]--; } }
  const next = [0, 0, 0];
  const t0 = T.w(0, "day") + 0.1, t1 = T.w(1, "full") - 0.06;
  order.forEach((ri, i) => {
    const h = holes.filter((x) => x.ri === ri)[next[ri]++];
    const at = t0 + Math.pow(i / 19, 0.85) * (t1 - t0);
    const pu = E.el(card, `<div class="punched" style="left:${h.x}px;top:${h.y}px"></div>`);
    gsap.set(pu, { autoAlpha: 0 });
    tl.set(pu, { autoAlpha: 1 }, at);
    const chad = E.el(card, `<div class="chad" style="left:${h.x}px;top:${h.y}px"></div>`);
    gsap.set(chad, { autoAlpha: 0 });
    tl.set(chad, { autoAlpha: 1 }, at);
    tl.to(chad, { x: (r() - 0.3) * 160, y: 520 + r() * 240, rotation: (r() - 0.5) * 300, scaleX: 0.55, duration: 0.75, ease: "power2.in" }, at);
    tl.set(chad, { autoAlpha: 0 }, at + 0.75);
    E.count(tl, booked, [i + 1], [at], (v) => (v === 20 ? "Booked: 20 · Full" : `Booked: ${v}`));
    T.sfx("punch", at, i === 19 ? 1 : 0.7);
  });
  tl.set(booked, { color: "var(--orange)" }, t1);

  // full: it closes, by itself
  const st = E.stamp(S, "Full", { x: 1290, y: 470, rot: -11, size: 210, border: 11 });
  E.slam(tl, st, T.w(1, "full") + 0.12, T, { shake: 11 });
  // ...and the day closes: struck off the card, no longer offered
  const cs = E.svgAt(card, W, H);
  E.draw(tl, E.path(cs, E.strikeD(36, 118, 470, 108, 77), { width: 12 }), T.w(1, "closes") - 0.02, 0.28, "power2.in");
  const closed = E.el(card, `<div class="abs m orange" style="left:500px;top:100px;font-size:22px;letter-spacing:.24em">Closed to new orders</div>`);
  E.type(tl, closed, T.w(1, "closes") + 0.24, 60);
  T.sfx("scribble", T.w(1, "closes"), 0.6);
  const by = E.el(S, `<div class="abs s orange mul nowrap" style="left:1210px;top:918px;font-size:86px;transform:rotate(-3deg)">by itself.</div>`);
  E.riseWords(tl, E.split(by).words, [T.w(1, "by"), T.w(1, "itself")].map((t) => t - 0.04), { dur: 0.55 });
  const svg = E.svg(S);
  E.draw(tl, E.path(svg, E.arrowD(1196, 960, 1080, 720, -0.32), { width: 7 }), T.w(1, "itself") + 0.05, 0.35);
  E.draw(tl, E.path(svg, "M1062 752 L1080 718 L1112 738", { width: 7 }), T.w(1, "itself") + 0.36, 0.12);
};
