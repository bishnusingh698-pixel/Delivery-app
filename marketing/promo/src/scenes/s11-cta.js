/* 11 · Pickday. Let customers pick the day. Find it on the Shopify App Store. */
SCENES["s11-cta"] = (S, T, tl) => {
  const st = E.sticker(S, { x: 122, y: 164, size: 292, rot: -7 });
  E.slap(tl, st, T.w(0, "pickday") + 0.05, T, { shake: 6 });
  const wm = E.el(S, `<div class="abs d blue mul tex nowrap" style="left:470px;top:150px;font-size:336px">Pickday</div>`);
  E.squeeze(tl, wm, T.w(0, "pickday") - 0.12, { stagger: 0.035, dur: 0.6 });
  const l1 = E.el(S, `<div class="abs d inkc mul nowrap" style="left:124px;top:520px;font-size:124px">Let customers</div>`);
  const l2 = E.el(S, `<div class="abs s orange mul nowrap" style="left:110px;top:626px;font-size:206px">pick the day.</div>`);
  E.riseWords(tl, E.split(l1).words, ["let", "customers"].map((w) => T.w(1, w) - 0.04));
  const w2 = E.split(l2).words;
  const sb = S.getBoundingClientRect(), db = w2[2].getBoundingClientRect(), lb = l2.getBoundingClientRect();
  E.riseWords(tl, w2, ["pick", "the", "day"].map((w) => T.w(1, w) - 0.04), { dur: 0.7 });
  const svg = E.svg(S);
  // "day" gets the circle; the whole film was about this one choice
  E.draw(tl, E.path(svg, E.circleD(db.left - sb.left + db.width / 2 + 4, lb.top - sb.top + lb.height * 0.55, db.width / 2 + 34, lb.height * 0.42, 111, 1.15), { width: 9 }), T.we(1, "day") + 0.08, 0.6);
  // ...and the day itself, a tear-off page like the one this film started on
  const pg = E.el(S, `<div class="slip" style="left:1400px;top:470px;width:300px;height:330px;text-align:center">
    <div style="background:var(--blue);color:var(--paper);font:600 18px/40px 'IBM Plex Mono';letter-spacing:.3em">NOVEMBER</div>
    <div class="d blue mul" style="font-size:210px;margin-top:14px">14</div>
    <div class="m inkc" style="font-size:18px;letter-spacing:.3em;margin-top:6px">Saturday</div></div>`);
  gsap.set(pg, { rotation: 5 });
  E.paste(tl, pg, T.w(1, "day") - 0.15, { T, gain: 0.6, dy: -40 });
  const ck = E.svgAt(pg, 300, 330);
  E.draw(tl, E.path(ck, E.checkD(196, 268, 1.25), { width: 12 }), T.we(1, "day") + 0.3, 0.25, "power2.out");
  T.sfx("scribble", T.we(1, "day") + 0.08, 0.6);
  // where to find it
  const f = E.el(S, `<div class="abs m inkc nowrap" style="left:126px;top:906px;font-size:28px;letter-spacing:.14em">Find it on the Shopify App Store</div>`);
  E.type(tl, f, T.w(2, "find") - 0.04, 22);
  const pill = E.el(S, `<div class="abs" style="left:1060px;top:880px;width:520px;height:84px;border:4px solid var(--ink);border-radius:42px;background:var(--white)"></div>`);
  E.el(pill, `<svg class="abs" style="left:26px;top:20px" width="40" height="40" viewBox="0 0 40 40"><circle cx="16" cy="16" r="11" fill="none" stroke="#231f27" stroke-width="4"/><path d="M24 24 L35 35" stroke="#231f27" stroke-width="4.5" stroke-linecap="round"/></svg>`);
  const q = E.el(pill, `<div class="abs m blue nowrap" style="left:84px;top:22px;font-size:32px;letter-spacing:.06em;text-transform:none;font-weight:600">Pickday</div>`);
  E.paste(tl, pill, T.w(2, "app") - 0.2, { T, gain: 0.5, dy: -18 });
  E.type(tl, q, T.w(2, "store") + 0.1, 16);
  E.draw(tl, E.path(svg, E.arrowD(950, 930, 1046, 924, 0.1), { width: 7 }), T.w(2, "store") - 0.1, 0.25);
  E.draw(tl, E.path(svg, "M1022 906 L1048 924 L1022 944", { width: 7 }), T.w(2, "store") + 0.12, 0.12);
};
