/* 03 · The picker: the real storefront widget, printed as FIG. 1, marked up in ink while the left
   column is pasted over twice (where it shows · how it ships · which days). */
SCENES["s03-picker"] = (S, T, tl) => {
  const F = window.FIG, k = 1.4, pad = 22;              // widget CSS px -> card px
  const cx = 1006, cy = 118, cwid = 540 * k + pad * 2, chei = 590 * k + pad * 2;
  const cap = E.el(S, `<div class="abs cap" style="left:${cx + 4}px;top:${cy - 34}px">Fig. 1 — the picker, in the cart</div>`);
  const card = E.el(S, `<div class="slip" style="left:${cx}px;top:${cy}px;width:${cwid}px;height:${chei}px"></div>`);
  gsap.set(card, { rotation: -1.1 });
  const imgs = ["fig-empty", "fig-day", "fig-slot"].map((n) => E.el(card, `<img class="figimg" src="../build/parts/${n}.png" style="position:absolute;left:${pad}px;top:${pad}px;width:${540 * k}px;mix-blend-mode:multiply">`));
  imgs.forEach((im, i) => gsap.set(im, { autoAlpha: i === 0 ? 1 : 0 }));
  const ink = E.svgAt(card, cwid, chei);
  const P = (x, y) => [pad + x * k, pad + y * k];
  E.paste(tl, card, 0.32, { T, gain: 0.8 });
  tl.fromTo(cap, { opacity: 0 }, { opacity: 1, duration: 0.01 }, 0.5);

  // a day, then a time slot: the figure changes state exactly as it would under a click
  const day = F.day.days.find((d) => d.date === "2026-11-14"), chip = F.day.chips[1];
  const tDay = T.w(0, "day"), tSlot = T.w(0, "slot");
  E.show(tl, imgs[1], tDay + 0.08); E.show(tl, imgs[0], tDay + 0.08, false);
  E.show(tl, imgs[2], tSlot + 0.1); E.show(tl, imgs[1], tSlot + 0.1, false);
  tl.to(card, { scale: 0.992, duration: 0.05, yoyo: true, repeat: 1 }, tDay + 0.06);
  tl.to(card, { scale: 0.992, duration: 0.05, yoyo: true, repeat: 1 }, tSlot + 0.08);
  T.sfx("click", tDay + 0.08, 0.9); T.sfx("click", tSlot + 0.1, 0.9);
  const [dx, dy] = P(day.x + day.w / 2, day.y + day.h / 2);
  E.draw(tl, E.path(ink, E.circleD(dx, dy, day.w * k / 2 + 24, day.h * k / 2 + 20, 21), { width: 8 }), tDay - 0.1, 0.45);
  const [sx, sy] = P(chip.x + chip.w / 2, chip.y + chip.h / 2);
  E.draw(tl, E.path(ink, E.circleD(sx, sy, chip.w * k / 2 + 22, chip.h * k / 2 + 20, 22), { width: 8 }), tSlot - 0.05, 0.5);
  T.sfx("scribble", tDay - 0.05, 0.6); T.sfx("scribble", tSlot, 0.6);

  // slip 1 · where it shows
  const h1 = E.el(S, `<div class="abs d blue mul nowrap" style="left:120px;top:150px;font-size:118px">Shoppers choose</div>`);
  const h2 = E.el(S, `<div class="abs s orange mul nowrap" style="left:112px;top:252px;font-size:104px">a day &amp; a time slot</div>`);
  E.riseWords(tl, E.split(h1).words, [T.w(0, "shoppers"), T.w(0, "choose")].map((t) => t - 0.04));
  E.riseWords(tl, E.split(h2).words, [T.w(0, "a"), T.w(0, "day"), T.w(0, "and"), T.w(0, "a#2"), T.w(0, "time"), T.w(0, "slot")].map((t) => t - 0.04), { dur: 0.6 });
  const lab = E.el(S, `<div class="abs m inkc" style="left:122px;top:470px;font-size:19px;letter-spacing:.24em">Right in your</div>`);
  tl.fromTo(lab, { opacity: 0 }, { opacity: 1, duration: 0.01 }, T.w(0, "right"));
  const svg = E.svg(S);
  [["Cart", "cart"], ["Cart drawer", "drawer"], ["Product page", "page"]].forEach(([txt, w], i) => {
    const y = 520 + i * 112, at = w === "cart" ? T.w(0, "cart") : w === "drawer" ? T.w(0, "cart#2") : T.w(0, "product");
    const bx = E.el(S, `<div class="box" style="left:122px;top:${y + 12}px;width:62px;height:62px"></div>`);
    const tx = E.el(S, `<div class="abs d inkc mul nowrap" style="left:214px;top:${y}px;font-size:96px">${txt}</div>`);
    tl.fromTo(bx, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.25, ease: "back.out(3)" }, at - 0.08);
    E.riseWords(tl, E.split(tx).words, at - 0.04, { dur: 0.5 });
    E.draw(tl, E.path(svg, E.checkD(132, y + 48, 1.15), { width: 11 }), at + 0.12, 0.22, "power2.out");
    T.sfx("scribble", at + 0.12, 0.45);
  });

  // slip 2 · how it gets there (the three methods get circled on the figure too)
  const s2 = E.el(S, `<div class="slip" style="left:96px;top:128px;width:880px;height:850px"></div>`);
  gsap.set(s2, { rotation: 0.7 });
  E.paste(tl, s2, T.l(1) - 0.32, { T });
  const m1 = E.el(s2, `<div class="abs m inkc" style="left:34px;top:36px;font-size:19px;letter-spacing:.24em">Three ways to get it</div>`);
  const L1 = E.el(s2, `<div class="abs d blue mul nowrap" style="left:30px;top:100px;font-size:132px">Local delivery,</div>`);
  const L2 = E.el(s2, `<div class="abs d inkc mul nowrap" style="left:30px;top:250px;font-size:132px">store pickup</div>`);
  const L3 = E.el(s2, `<div class="abs s orange mul nowrap" style="left:24px;top:392px;font-size:150px">or shipping.</div>`);
  tl.fromTo(m1, { opacity: 0 }, { opacity: 1, duration: 0.01 }, T.l(1) - 0.2);
  E.riseWords(tl, E.split(L1).words, [T.w(1, "local"), T.w(1, "delivery")].map((t) => t - 0.04));
  E.riseWords(tl, E.split(L2).words, [T.w(1, "store"), T.w(1, "pickup")].map((t) => t - 0.04));
  E.riseWords(tl, E.split(L3).words, [T.w(1, "or"), T.w(1, "shipping")].map((t) => t - 0.04), { dur: 0.6 });
  F.day.methods.forEach((m, i) => {
    const [mx, my] = P(m.x + m.w / 2, m.y + m.h / 2), at = [T.w(1, "local"), T.w(1, "pickup"), T.w(1, "shipping")][i];
    E.draw(tl, E.path(ink, E.circleD(mx, my, m.w * k / 2 + 14, m.h * k / 2 + 18, 30 + i), { width: 7, color: i ? "var(--blue)" : "var(--orange)" }), at - 0.05, 0.4);
    T.sfx("scribble", at, 0.4);
  });
  const vans = E.el(s2, `<div class="abs m blue" style="left:34px;top:640px;font-size:19px;letter-spacing:.2em;line-height:1.7">Same picker · same dates · same limits</div>`);
  tl.fromTo(vans, { opacity: 0 }, { opacity: 1, duration: 0.01 }, T.w(1, "shipping") + 0.3);

  // slip 3 · only open days (Sundays are struck off the calendar)
  const s3 = E.el(S, `<div class="slip orangeSlip" style="left:84px;top:112px;width:904px;height:872px"></div>`);
  gsap.set(s3, { rotation: -0.9 });
  E.paste(tl, s3, T.l(2) - 0.3, { T });
  const o1 = E.el(s3, `<div class="abs d inkc mul nowrap" style="left:40px;top:100px;font-size:150px;color:var(--over)">Only the days</div>`);
  const o2 = E.el(s3, `<div class="abs d nowrap" style="left:40px;top:254px;font-size:150px;color:var(--white)">you're open</div>`);
  const o3 = E.el(s3, `<div class="abs s nowrap" style="left:36px;top:418px;font-size:140px;color:var(--over)">can be picked.</div>`);
  E.riseWords(tl, E.split(o1).words, ["only", "the", "days"].map((w) => T.w(2, w) - 0.04));
  E.riseWords(tl, E.split(o2).words, ["you", "open"].map((w) => T.w(2, w) - 0.04));
  E.riseWords(tl, E.split(o3).words, ["can", "be", "picked"].map((w) => T.w(2, w) - 0.04), { dur: 0.6 });
  const sun = F.day.days.filter((d) => new Date(d.date + "T12:00:00Z").getUTCDay() === 0);
  const top = P(sun[0].x + sun[0].w / 2, sun[0].y - 6), bot = P(sun.at(-1).x + sun.at(-1).w / 2, sun.at(-1).y + sun.at(-1).h + 6);
  const strike = E.path(ink, `M${top[0] - 6} ${top[1]} Q${top[0] + 14} ${(top[1] + bot[1]) / 2} ${bot[0] + 4} ${bot[1]}`, { width: 13 });
  E.draw(tl, strike, T.w(2, "open") - 0.05, 0.38, "power2.in");
  T.sfx("scribble", T.w(2, "open"), 0.7);
  const note = E.el(s3, `<div class="abs m nowrap" style="left:44px;top:700px;font-size:19px;letter-spacing:.2em;color:var(--over)">Closed days, full days and holidays stay shut</div>`);
  tl.fromTo(note, { opacity: 0 }, { opacity: 1, duration: 0.01 }, T.w(2, "picked") + 0.5);
};
