/* 10 · Every plan: a printed setup form, ticked off in ink as each line is spoken, then signed. */
SCENES["s10-plans"] = (S, T, tl) => {
  const X = 300, Y = 140, W = 1320, H = 820;
  const form = E.el(S, `<div class="slip" style="left:${X}px;top:${Y}px;width:${W}px;height:${H}px"></div>`);
  gsap.set(form, { rotation: -0.7 });
  E.paste(tl, form, 0.2, { T, gain: 0.8 });
  E.el(form, `<div class="abs m inkc" style="left:60px;top:44px;font-size:18px;letter-spacing:.26em">Form P-1 · Installation</div>`);
  E.el(form, `<div class="abs m blue" style="right:60px;top:44px;font-size:18px;letter-spacing:.26em">Pickday</div>`);
  E.el(form, `<div class="abs" style="left:60px;right:60px;top:82px;border-top:3px solid var(--blue);mix-blend-mode:multiply"></div>`);
  const ink = E.svgAt(form, W, H);
  const rows = [
    ["Works on every Shopify plan", "inkc", T.w(0, "works"), T.w(0, "plan")],
    ["No theme code to touch", "inkc", T.w(0, "with"), T.w(0, "touch")],
    ["Set up in minutes", "blue", T.w(1, "set"), T.w(1, "minutes")],
  ];
  rows.forEach(([txt, col, tin, tick], i) => {
    const y = 130 + i * 190;
    const bx = E.el(form, `<div class="box" style="left:60px;top:${y + 12}px;width:92px;height:92px"></div>`);
    tl.fromTo(bx, { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(3)" }, tin - 0.1);
    const t = E.el(form, `<div class="abs d ${col} mul nowrap" style="left:196px;top:${y + 10}px;font-size:98px">${txt}</div>`);
    const words = E.split(t).words;
    E.riseWords(tl, words, tin - 0.04, { dur: 0.55 });
    E.draw(tl, E.path(ink, E.checkD(74, y + 64, 1.55), { width: 14 }), tick + 0.05, 0.24, "power2.out");
    T.sfx("scribble", tick + 0.05, 0.6);
    E.el(form, `<div class="abs" style="left:60px;right:60px;top:${y + 156}px;border-top:2px dashed rgba(37,70,179,.4)"></div>`);
  });
  // the theme code nobody has to write, struck out
  const code = E.el(form, `<div class="abs code nowrap" style="left:200px;top:${130 + 190 + 118}px;font-size:26px;color:var(--ink);opacity:.7">{% render 'date-picker', product: product %}</div>`);
  E.type(tl, code, T.w(0, "theme") - 0.1, 70);
  E.draw(tl, E.path(ink, E.strikeD(190, 130 + 190 + 136, 900, 130 + 190 + 132, 5), { width: 9 }), T.w(0, "code") + 0.12, 0.3, "power2.in");
  // signed
  E.el(form, `<div class="abs" style="left:${W - 560}px;top:${H - 94}px;width:480px;border-top:2px solid var(--ink);opacity:.6"></div>`);
  E.el(form, `<div class="abs m inkc" style="left:${W - 560}px;top:${H - 82}px;font-size:15px;letter-spacing:.26em;opacity:.7">Approved</div>`);
  const sig = E.el(form, `<div class="abs s orange mul nowrap" style="left:${W - 540}px;top:${H - 214}px;font-size:120px;transform:rotate(-5deg)">Pickday</div>`);
  tl.fromTo(sig, { clipPath: "inset(-20% 100% -20% 0%)" }, { clipPath: "inset(-20% 0% -20% 0%)", duration: 0.7, ease: "power1.inOut" }, T.le(1) + 0.05);
  T.sfx("scribble", T.le(1) + 0.05, 0.7);
};
