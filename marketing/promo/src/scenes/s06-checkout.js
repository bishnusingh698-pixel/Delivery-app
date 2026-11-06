/* 06 · Checkout: a receipt prints with every shipping option; the ones not picked are struck and
   fold away, the picked one gets its date. Then: no date, no order. */
SCENES["s06-checkout"] = (S, T, tl) => {
  const W = 720, X = 1084, Y = 118;
  const rc = E.el(S, `<div class="ticket" style="left:${X}px;top:${Y}px;width:${W}px;padding:40px 46px 54px;font-size:29px;line-height:1.5"></div>`);
  gsap.set(rc, { rotation: 1.2 });
  const line = (html) => E.el(rc, `<div style="overflow:hidden;white-space:nowrap">${html}</div>`);
  const dash = () => E.el(rc, `<hr style="margin:14px 0">`);
  line(`<span style="font-weight:600;font-size:33px">Juniper Street Bakery</span>`);
  line(`Checkout · order #1050`);
  dash();
  line(`1 × Birthday cake`); line(`1 × Candles`);
  dash();
  line(`<span style="color:var(--blue);font-weight:600">Delivery method</span>`);
  const opts = ["Standard shipping", "Express shipping", "Store pickup"].map((t) => line(`○ ${t}`));
  const keep = line(`● Local delivery<span class="dt" style="color:var(--blue);font-weight:600"> – Sat, Nov 14</span>`);
  const slot = line(`<span style="padding-left:1.25em;color:var(--blue);font-weight:600">12:00–15:00</span>`);
  dash();
  line(`<div style="margin-top:12px;background:var(--ink);color:var(--white);text-align:center;padding:16px 0;letter-spacing:.2em;font-weight:600">Pay now</div>`);
  const H = rc.offsetHeight;

  // print: line by line, top to bottom
  tl.fromTo(rc, { opacity: 0 }, { opacity: 1, duration: 0.01 }, 0.3);
  tl.fromTo(rc, { clipPath: "inset(0% 0% 100% 0%)" }, { clipPath: "inset(0% 0% -4% 0%)", duration: 1.2, ease: "steps(20)" }, 0.3);
  T.sfx("roller", 0.3, 0.8);
  const dt = keep.querySelector(".dt");
  gsap.set([dt, slot], { opacity: 0 });

  // only the option they picked: the rest are struck, then fold away
  const svg = E.svgAt(rc, W, H);
  opts.forEach((o, i) => {
    const y = o.offsetTop + o.offsetHeight / 2 + 3;
    E.draw(tl, E.path(svg, E.strikeD(40, y, 40 + o.firstChild.length * 18.6 + 10, y - 2, 90 + i), { width: 8 }), T.w(0, "only") + i * 0.15, 0.22, "power2.out");
    T.sfx("scribble", T.w(0, "only") + i * 0.15, 0.35);
  });
  const fold = T.w(0, "option") - 0.02, lost = opts.reduce((a, o) => a + o.offsetHeight, 0);
  opts.forEach((o) => tl.to(o, { height: 0, opacity: 0, duration: 0.45, ease: "power3.inOut" }, fold));
  tl.to(svg, { opacity: 0, duration: 0.15 }, fold);
  // the picked one gets its date, typed in, then circled
  tl.set(dt, { opacity: 1 }, T.w(0, "with"));
  tl.fromTo(dt, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.42, ease: "steps(13)" }, T.w(0, "with"));
  tl.set(slot, { opacity: 1 }, T.w(0, "date") - 0.05);
  tl.fromTo(slot, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.3, ease: "steps(10)" }, T.w(0, "date") - 0.05);
  T.sfx("type", T.w(0, "with"), 0.6);
  const ink2 = E.svgAt(rc, W, H);
  const ky = keep.offsetTop - lost, kh = keep.offsetHeight + slot.offsetHeight;
  E.draw(tl, E.path(ink2, E.circleD(W / 2 - 6, ky + kh / 2 + 2, W / 2 - 14, kh / 2 + 7, 93, 1.08, -2.9), { width: 8 }), T.w(0, "date") + 0.2, 0.5);
  T.sfx("scribble", T.w(0, "date") + 0.2, 0.5);

  // left: the line, set in type
  const a1 = E.el(S, `<div class="abs s orange mul nowrap" style="left:114px;top:150px;font-size:120px">At checkout,</div>`);
  const a2 = E.el(S, `<div class="abs d inkc mul nowrap" style="left:120px;top:312px;font-size:124px">only the option</div>`);
  const a3 = E.el(S, `<div class="abs d blue mul nowrap" style="left:120px;top:426px;font-size:124px">they picked,</div>`);
  const a4 = E.el(S, `<div class="abs s orange mul nowrap" style="left:114px;top:552px;font-size:112px">with their date.</div>`);
  E.riseWords(tl, E.split(a1).words, [T.w(0, "at"), T.w(0, "checkout")].map((t) => t - 0.04), { dur: 0.6 });
  E.riseWords(tl, E.split(a2).words, ["only", "the", "option"].map((w) => T.w(0, w) - 0.04));
  E.riseWords(tl, E.split(a3).words, ["they", "picked"].map((w) => T.w(0, w) - 0.04));
  E.riseWords(tl, E.split(a4).words, ["with", "their", "date"].map((w) => T.w(0, w) - 0.04), { dur: 0.6 });
  // a roller pass clears the column for the rule that follows
  const clear = T.l(1) - 0.42;
  [a1, a2, a3, a4].forEach((el, i) => tl.to(el, { clipPath: "inset(0% 0% 100% 0%)", duration: 0.3, ease: "power2.in" }, clear + i * 0.04));
  T.sfx("whoosh", clear, 0.5);

  // no date? no order.
  const n1 = E.el(S, `<div class="abs d blue mul nowrap" style="left:120px;top:176px;font-size:228px">No date?</div>`);
  const n2 = E.el(S, `<div class="abs d orange mul nowrap" style="left:120px;top:404px;font-size:228px">No order.</div>`);
  E.riseWords(tl, E.split(n1).words, [T.w(1, "no"), T.w(1, "date")].map((t) => t - 0.04), { dur: 0.5 });
  E.riseWords(tl, E.split(n2).words, [T.w(1, "no#2"), T.w(1, "order")].map((t) => t - 0.04), { dur: 0.5 });
  const pill = E.el(S, `<div class="abs" style="left:124px;top:690px;width:470px;padding:22px 0;background:var(--ink);color:var(--white);font:600 28px/1 'IBM Plex Mono';letter-spacing:.24em;text-align:center;text-transform:uppercase;mix-blend-mode:multiply">Pay now</div>`);
  tl.fromTo(pill, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.3, ease: "expo.out" }, T.w(1, "date") + 0.05);
  const ink = E.svg(S);
  E.draw(tl, E.path(ink, "M104 672 L612 782", { width: 14 }), T.w(1, "order") - 0.02, 0.16, "power2.in");
  E.draw(tl, E.path(ink, "M610 670 L106 786", { width: 14 }), T.w(1, "order") + 0.14, 0.16, "power2.in");
  T.sfx("scribble", T.w(1, "order"), 0.8);
  const why = E.el(S, `<div class="abs m inkc nowrap" style="left:126px;top:840px;font-size:21px;letter-spacing:.14em">Checkout waits until a date is picked</div>`);
  E.type(tl, why, T.w(1, "order") + 0.5, 46);
};
