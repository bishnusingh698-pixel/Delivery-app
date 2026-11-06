/* 09 · Languages: a type specimen of the picker's own "Choose a date" strings, then right-to-left:
   the real picker in Arabic, mirrored by the widget itself. */
SCENES["s09-language"] = (S, T, tl) => {
  const F = { JP: "'Noto Sans JP'", KR: "'Noto Sans KR'", SC: "'Noto Sans SC'", AR: "'Noto Kufi Arabic'", HE: "'Noto Sans Hebrew'", HI: "'Noto Sans Devanagari'", EL: "'Noto Sans'" };
  const noto = (f) => `font-family:${f};font-weight:900;line-height:1.12;mix-blend-mode:multiply;`;
  // the picker's own "Choose a date" strings, set as a specimen, in rows that flow left to right
  const rows = [
    [["Choose a date", "en", "d blue mul", 150]],
    [["Datum wählen", "de", "s orange mul", 104], ["Choisir une date", "fr", "d inkc mul", 60]],
    [["日付を選択", "ja", "blue", 96, F.JP], ["날짜 선택", "ko", "orange", 78, F.KR]],
    [["Scegli una data", "it", "s blue mul", 84], ["Elige una fecha", "es", "d orange mul", 66]],
    [["选择日期", "zh", "inkc", 82, F.SC], ["तारीख चुनें", "hi", "blue", 68, F.HI]],
    [["Επιλέξτε ημερομηνία", "el", "orange", 50, F.EL], ["Wybierz datę", "pl", "d inkc mul", 60]],
  ];
  const items = [];
  let y = 146;
  rows.forEach((row) => {
    const r = E.el(S, `<div class="abs nowrap" style="left:120px;top:${y}px;display:flex;gap:44px;align-items:baseline"></div>`);
    row.forEach(([txt, lc, cls, size, fam]) => items.push(E.el(r, `<div class="spec nowrap ${cls}" style="font-size:${size}px;${fam ? noto(fam) : ""}">${txt}<span class="lc">${lc}</span></div>`)));
    y += r.offsetHeight + 4;
  });
  const t0 = T.w(0, "pickday") - 0.05, t1 = T.le(0) + 0.1;
  items.forEach((el, i) => {
    const at = t0 + (i / (items.length - 1)) * (t1 - t0);
    tl.fromTo(el, { clipPath: "inset(-10% 100% -10% 0%)" }, { clipPath: "inset(-10% -6% -10% 0%)", duration: 0.22, ease: "steps(8)" }, at);
    T.sfx("type", at, 0.35);
  });
  const rest = E.el(S, `<div class="abs m inkc" style="left:122px;top:${y + 18}px;width:960px;font-size:17px;line-height:1.75;letter-spacing:.1em;opacity:.85">Kies een datum · Välj datum · Velg dato · Vælg en dato · Valitse päivä · Vyberte datum · Tarih seçin · Pilih tanggal · Chọn ngày · Alege o dată</div>`);
  E.type(tl, rest, t1 - 0.2, 80);

  // right to left, too: the picker in Arabic (the widget mirrors itself), and RTL type entering from the right
  const k = 1.05, pad = 18, cw = 540 * k + pad * 2, ch = 537 * k + pad * 2;
  const card = E.el(S, `<div class="slip" style="left:${1800 - cw}px;top:150px;width:${cw}px;height:${ch}px"><img src="../build/parts/fig-ar.png" style="position:absolute;left:${pad}px;top:${pad}px;width:${540 * k}px;mix-blend-mode:multiply"></div>`);
  gsap.set(card, { rotation: 1.3 });
  E.paste(tl, card, T.w(1, "right") - 0.2, { T, gain: 0.8 });
  const cap = E.el(S, `<div class="abs cap" style="left:${1800 - cw}px;top:${150 + ch + 18}px">Fig. 3 — the same picker, in Arabic</div>`);
  tl.fromTo(cap, { opacity: 0 }, { opacity: 1, duration: 0.01 }, T.w(1, "right") + 0.2);
  const rtl = E.el(S, `<div class="abs nowrap" dir="rtl" style="right:120px;top:${150 + ch + 56}px;display:flex;gap:44px;align-items:baseline"></div>`);
  const ar = E.el(rtl, `<div class="orange spec" style="${noto(F.AR)}font-size:66px">اختر تاريخًا<span class="lc">ar</span></div>`);
  const he = E.el(rtl, `<div class="blue spec" style="${noto(F.HE)}font-size:66px">בחרו תאריך<span class="lc">he</span></div>`);
  [ar, he].forEach((el, i) => tl.fromTo(el, { x: 260, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: "expo.out" }, T.w(1, i ? "left" : "to") - 0.05));
  const svg = E.svg(S);
  const ax = 1800 - cw;
  E.draw(tl, E.path(svg, `M1790 124 Q${(1790 + ax) / 2} 104 ${ax + 10} 122`, { width: 8 }), T.w(1, "right"), 0.5, "power2.inOut");
  E.draw(tl, E.path(svg, `M${ax + 44} 100 L${ax + 8} 122 L${ax + 46} 146`, { width: 8 }), T.w(1, "left"), 0.16);
  T.sfx("scribble", T.w(1, "right"), 0.5);
  // ...the picked Saturday, circled on the mirrored calendar
  const d = window.FIG.ar.days.find((x) => x.date === "2026-11-14");
  const ink = E.svgAt(card, cw, ch);
  E.draw(tl, E.path(ink, E.circleD(pad + (d.x + d.w / 2) * k, pad + (d.y + d.h / 2) * k, d.w * k / 2 + 22, d.h * k / 2 + 18, 99), { width: 8 }), T.w(1, "too") + 0.25, 0.5);
};
