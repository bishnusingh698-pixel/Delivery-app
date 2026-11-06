/* 08 · Every morning: the day sheet, route sheet and production list print (the app's real print
   pages, in blue ink); then tomorrow's orders arrive by airmail, free, with Shopify Flow. */
SCENES["s08-print"] = (S, T, tl) => {
  // a riso sun comes up behind the words
  // ...from behind the word "Every", which is the horizon
  const hz = E.el(S, `<div class="abs" style="left:250px;top:40px;width:420px;height:292px;overflow:hidden"></div>`);
  const sun = E.el(hz, `<div class="abs" style="left:30px;top:0;width:360px;height:360px;border-radius:50%;background:repeating-linear-gradient(0deg,var(--orange) 0 9px,transparent 9px 19px);mix-blend-mode:multiply;opacity:.8"></div>`);
  tl.fromTo(sun, { y: 300 }, { y: 56, duration: 1.6, ease: "power2.out" }, 0.2);
  const a = E.el(S, `<div class="abs d blue mul tex nowrap" style="left:116px;top:148px;font-size:230px">Every</div>`);
  const b = E.el(S, `<div class="abs s orange mul nowrap" style="left:108px;top:330px;font-size:190px">morning,</div>`);
  E.riseWords(tl, E.split(a).words, [T.w(0, "every") - 0.04]);
  E.riseWords(tl, E.split(b).words, [T.w(0, "morning") - 0.04], { dur: 0.7 });
  const clock = E.el(S, `<div class="abs m inkc" style="left:124px;top:560px;font-size:21px;letter-spacing:.24em">06:00 · print</div>`);
  E.type(tl, clock, T.w(0, "print") - 0.1, 30);

  // three real print pages
  const sheets = [
    ["daysheet", 790, 120, -1.6, T.w(0, "day"), 1412], ["route", 852, 414, 1.2, T.w(0, "route"), 654], ["production", 908, 640, -0.8, T.w(0, "production"), 592],
  ];
  const IW = 880;
  sheets.forEach(([n, x, y, rot, at, ph]) => {
    const h = Math.round((ph / 1800) * IW) + 36;
    const p = E.el(S, `<div class="sheetOut" style="left:${x}px;top:${y}px;width:${IW + 36}px;height:${h}px"><img src="../build/parts/${n}.png" style="position:absolute;left:18px;top:18px;width:${IW}px"></div>`);
    gsap.set(p, { rotation: rot });
    E.paste(tl, p, at - 0.32, { T, gain: 0.6, dy: -40 });
    const img = p.querySelector("img");
    tl.fromTo(img, { clipPath: "inset(0% 0% 100% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.75, ease: "steps(16)" }, at - 0.1);
    T.sfx("roller", at - 0.1, 0.7);
  });
  const lab = E.el(S, `<div class="abs cap" style="left:794px;top:84px">Fig. 2 — day sheet · route sheet · production list</div>`);
  tl.fromTo(lab, { opacity: 0 }, { opacity: 1, duration: 0.01 }, T.w(0, "day"));

  // tomorrow's orders by email: an airmail envelope
  const env = E.el(S, `<div class="airmail" style="left:118px;top:612px;width:660px;height:364px"></div>`);
  gsap.set(env, { rotation: -3 });
  const te = T.w(1, "get") - 0.1;
  tl.fromTo(env, { x: -900, rotation: -12 }, { x: 0, rotation: -3, duration: 0.55, ease: "power3.out" }, te);
  T.sfx("whoosh", te, 0.7);
  E.el(env, `<div class="abs" style="right:44px;top:42px;width:104px;height:124px;background:var(--blue);border:6px dotted var(--white);outline:2px solid var(--blue);text-align:center;color:var(--paper)"><div class="d" style="font-size:72px;margin-top:10px">14</div><div class="m" style="font-size:12px;letter-spacing:.2em">SAT</div></div>`);
  const to = E.el(env, `<div class="abs m inkc" style="left:52px;top:150px;font-size:22px;line-height:1.75;letter-spacing:.1em;white-space:nowrap">To: Juniper Street Bakery<br><span style="color:var(--blue)">Tomorrow's orders · Sat 14</span><br>5 orders · 3 delivery · 2 pickup</div>`);
  E.type(tl, to, T.w(1, "tomorrow") - 0.05, 70);
  const via = E.el(env, `<div class="abs m orange nowrap" style="left:52px;top:290px;font-size:20px;letter-spacing:.16em">Sent by Shopify Flow</div>`);
  E.type(tl, via, T.w(1, "with") - 0.05, 40);
  const pm = E.el(S, `<div class="abs" style="left:420px;top:600px;width:200px;height:200px;border-radius:50%;border:7px solid var(--orange);color:var(--orange);mix-blend-mode:multiply;text-align:center;-webkit-mask-image:url(../build/tex/rubber.png);-webkit-mask-size:700px;filter:url(#rough)"><div class="d" style="font-size:78px;margin-top:52px">Free</div></div>`);
  gsap.set(pm, { rotation: -14, opacity: 0 });
  E.slam(tl, pm, T.w(1, "free") + 0.05, T, { shake: 6 });
  const waves = E.svg(S);
  [0, 1, 2].forEach((i) => E.draw(tl, E.path(waves, `M600 ${676 + i * 22} c 25 -14 45 14 70 0 s 45 14 70 0 s 45 14 70 0`, { width: 6 }), T.w(1, "free") + 0.1 + i * 0.04, 0.3));
};
