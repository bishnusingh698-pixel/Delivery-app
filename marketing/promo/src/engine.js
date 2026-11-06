/* Small motion toolkit on top of GSAP. Everything is deterministic (seeded), so any frame can be
   rendered on its own by seeking the master timeline: that is how render.cjs splits the work. */
(function () {
  const E = (window.E = {});
  window.SCENES = {};
  window.SFX = [];

  E.rng = (seed) => () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  E.el = (parent, html, style) => {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    const n = t.content.firstElementChild;
    if (style) Object.assign(n.style, style);
    parent.appendChild(n);
    return n;
  };
  E.px = (n) => `${n}px`;

  /* ---------- hand-drawn ink paths ---------- */
  function catmull(pts) {
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
  }
  E.catmull = catmull;
  /** A loose ink loop around a box, the way a pen circles a word: a little more than one turn. */
  E.circleD = (cx, cy, rx, ry, seed = 1, turns = 1.18, start = -2.5) => {
    const r = E.rng(seed), pts = [], N = Math.round(40 * turns);
    const ph = r() * 6, tilt = (r() - 0.5) * 0.12;
    for (let k = 0; k <= N; k++) {
      const u = k / N, a = start + u * turns * Math.PI * 2;
      const wob = 1 + 0.035 * Math.sin(a * 2 + ph) + 0.05 * u;
      const x = Math.cos(a) * rx * wob, y = Math.sin(a) * ry * wob;
      pts.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]);
    }
    return catmull(pts);
  };
  E.strikeD = (x1, y1, x2, y2, seed = 1) => {
    const r = E.rng(seed);
    const mx = (x1 + x2) / 2 + (r() - 0.5) * 20, my = (y1 + y2) / 2 + (r() - 0.5) * 10;
    return `M${x1} ${y1 + (r() - 0.5) * 6} Q${mx} ${my} ${x2} ${y2 + (r() - 0.5) * 8}`;
  };
  E.checkD = (x, y, s = 1) => `M${x} ${y} l${18 * s} ${20 * s} l${38 * s} ${-52 * s}`;
  E.arrowD = (x1, y1, x2, y2, bend = 0.25) => {
    const mx = (x1 + x2) / 2 - (y2 - y1) * bend, my = (y1 + y2) / 2 + (x2 - x1) * bend;
    return `M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`;
  };
  E.svg = (parent) => {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("class", "ink");
    s.setAttribute("viewBox", "0 0 1920 1080");
    parent.appendChild(s);
    return s;
  };
  E.path = (svg, d, { color = "var(--orange)", width = 9, rough = true, dash = null, opacity = 1 } = {}) => {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    p.style.stroke = color;
    p.style.strokeWidth = width;
    p.style.opacity = opacity;
    p.style.mixBlendMode = "multiply";
    if (rough) p.setAttribute("filter", "url(#roughLine)");
    if (dash) p.style.strokeDasharray = dash;
    svg.appendChild(p);
    if (!dash) gsap.set(p, { drawSVG: "0%" });
    return p;
  };
  E.draw = (tl, p, at, dur = 0.45, ease = "power2.inOut") => tl.fromTo(p, { drawSVG: "0%" }, { drawSVG: "100%", duration: dur, ease }, at);

  /* ---------- typography ---------- */
  /** Split into lines/words with clipping masks (SplitText), ready to rise in. */
  E.split = (el, type = "words,lines", mask = "lines") => SplitText.create(el, { type, mask, linesClass: "ln", wordsClass: "wd", charsClass: "ch" });
  /** Words rise out of their line mask, each at its own time (or staggered). */
  E.riseWords = (tl, words, times, { dur = 0.55, ease = "expo.out", from } = {}) => {
    // italic lines have a deeper mask (see .s .ln-mask), so their words start further down
    words.forEach((w, i) => tl.fromTo(w, { yPercent: from ?? (w.closest(".s") ? 140 : 105) }, { yPercent: 0, duration: dur, ease }, Array.isArray(times) ? times[i] : times + i * 0.06));
  };
  /** Mono type-on: characters appear one by one (no fade, like a printer head). */
  E.type = (tl, el, at, cps = 38) => {
    const sp = SplitText.create(el, { type: "chars" });
    sp.chars.forEach((c, i) => tl.fromTo(c, { opacity: 0 }, { opacity: 1, duration: 0.001, ease: "none" }, at + i / cps));
    return at + sp.chars.length / cps;
  };
  /** Condensed letters arrive wide and squeeze into place. */
  E.squeeze = (tl, el, at, { stagger = 0.03, dur = 0.6, from = 125 } = {}) => {
    const sp = SplitText.create(el, { type: "chars" });
    sp.chars.forEach((c, i) => tl.fromTo(c, { fontStretch: `${from}%`, opacity: 0 }, { fontStretch: "62%", opacity: 1, duration: dur, ease: "expo.out" }, at + i * stagger));
    return sp;
  };

  /* ---------- objects ---------- */
  E.ticket = (parent, { no, day, lines = [], slot = "", x = 0, y = 0, rot = 0, w = 300 }) => {
    const t = E.el(parent, `<div class="ticket"><div class="no">#${no}</div><div class="day">${day}</div><hr>${lines.map((l) => `<div>${l}</div>`).join("")}${slot ? `<div style="margin-top:6px">${slot}</div>` : ""}</div>`);
    gsap.set(t, { x, y, rotation: rot, width: w });
    return t;
  };
  E.stamp = (parent, text, { x, y, rot = -8, size = 120, color = "var(--orange)", border = 9 }) => {
    const s = E.el(parent, `<div class="stamp">${text}</div>`);
    s.style.color = color;
    s.style.fontSize = `${size}px`;
    s.style.borderWidth = `${border}px`;
    gsap.set(s, { x, y, rotation: rot, opacity: 0, transformOrigin: "50% 50%" });
    return s;
  };
  /** Rubber stamp: lifted, slammed down with a squash, the sheet shakes. */
  E.slam = (tl, s, at, T, { shake = 9, rot } = {}) => {
    const r0 = rot ?? gsap.getProperty(s, "rotation");
    tl.fromTo(s, { opacity: 0, scale: 1.9, rotation: r0 + 7 }, { opacity: 1, scale: 0.96, rotation: r0, duration: 0.16, ease: "power4.in" }, at - 0.16);
    tl.to(s, { scale: 1, duration: 0.25, ease: "back.out(3)" }, at);
    if (shake) E.shake(tl, at, shake);
    T && T.sfx("stamp", at);
  };
  E.shake = (tl, at, amp = 8, dur = 0.32, seed = Math.round(at * 100)) => {
    const r = E.rng(seed), n = 6, kf = [];
    for (let i = 1; i <= n; i++) { const d = 1 - i / n; kf.push({ x: (r() - 0.5) * 2 * amp * d, y: (r() - 0.5) * 2 * amp * d, duration: dur / n, ease: "none" }); }
    kf.push({ x: 0, y: 0, duration: 0.04 });
    tl.to("#cam", { keyframes: kf }, at);
  };
  /** Orange highlighter flood behind a word. */
  E.flood = (parent, { x, y, w, h, color = "var(--orange)" }) => {
    const f = E.el(parent, `<div class="flood tex"></div>`, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, background: color });
    gsap.set(f, { scaleX: 0 });
    return f;
  };
  E.swipe = (tl, f, at, dur = 0.32) => tl.fromTo(f, { scaleX: 0 }, { scaleX: 1, duration: dur, ease: "power3.out" }, at);
  /** Show the value of a counter in steps (sets are exact under seeking). */
  E.count = (tl, el, values, times, fmt = (v) => String(v)) => values.forEach((v, i) => tl.set(el, { textContent: fmt(v) }, times[i]));


  /* ---------- paper objects ---------- */
  /** The app icon, untouched, as a die-cut sticker. */
  E.sticker = (parent, { x, y, size = 260, rot = -6 }) => {
    const s = E.el(parent, `<div class="sticker"><img src="../../src/logo.svg" alt=""></div>`);
    gsap.set(s, { left: x, top: y, width: size, height: size, padding: Math.round(size * 0.045), rotation: rot, opacity: 0, transformOrigin: "50% 50%" });
    return s;
  };
  /** Slapped onto the sheet: drops from above the camera, lands with a small overshoot. */
  E.slap = (tl, s, at, T, { from = 1.45, shake = 4 } = {}) => {
    const r0 = gsap.getProperty(s, "rotation");
    tl.fromTo(s, { opacity: 0, scale: from, rotation: r0 - 12, filter: "drop-shadow(26px 30px 0px rgba(70,50,25,0.10))" },
      { opacity: 1, scale: 0.97, rotation: r0, filter: "drop-shadow(7px 9px 0px rgba(70,50,25,0.24))", duration: 0.2, ease: "power3.in" }, at - 0.2);
    tl.to(s, { scale: 1, duration: 0.3, ease: "back.out(2.5)" }, at);
    if (shake) E.shake(tl, at, shake, 0.22);
    T && T.sfx("slap", at);
  };
  /** Paste-up: a cut slip drops onto the sheet (positioned with left/top; animates y/scale/rotation). */
  E.paste = (tl, el, at, { dy = -26, rot = 2.4, dur = 0.24, T, gain = 0.7 } = {}) => {
    const r0 = gsap.getProperty(el, "rotation");
    tl.fromTo(el, { opacity: 0, y: dy, scale: 1.035, rotation: r0 + rot }, { opacity: 1, y: 0, scale: 1, rotation: r0, duration: dur, ease: "power2.out" }, at);
    tl.set(el, { opacity: 1 }, at + 0.03);
    T && T.sfx("paper", at + dur * 0.6, gain);
  };
  /** Clip reveal, like a roller passing over the sheet. */
  E.wipe = (tl, el, at, dur = 0.5, dir = "down", ease = "power2.inOut") => {
    const from = { down: "inset(0% 0% 100% 0%)", right: "inset(0% 100% 0% 0%)", left: "inset(0% 0% 0% 100%)", up: "inset(100% 0% 0% 0%)" }[dir];
    tl.fromTo(el, { clipPath: from }, { clipPath: "inset(0% 0% 0% 0%)", duration: dur, ease }, at);
  };
  /** Label-maker tape: letters are embossed one at a time while the tape feeds out. */
  E.dymo = (parent, text, { x, y, color = "var(--blue)", rot = 0, size = 52 }) => {
    const d = E.el(parent, `<div class="dymo"><div class="tape">${text.split("").map((c) => `<i>${c === " " ? "&nbsp;" : c}</i>`).join("")}</div></div>`);
    d.style.left = `${x}px`; d.style.top = `${y}px`; d.style.fontSize = `${size}px`;
    d.querySelector(".tape").style.background = color;
    gsap.set(d, { rotation: rot, transformOrigin: "0% 50%" });
    return d;
  };
  E.emboss = (tl, d, at, T, cps = 34) => {
    const chars = [...d.querySelectorAll("i")], tape = d.querySelector(".tape");
    const end = at + chars.length / cps;
    tl.fromTo(d, { opacity: 0 }, { opacity: 1, duration: 0.01 }, at - 0.02);
    tl.fromTo(tape, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: end - at + 0.06, ease: "none" }, at - 0.04);
    chars.forEach((c, i) => {
      tl.fromTo(c, { opacity: 0 }, { opacity: 1, duration: 0.001 }, at + i / cps);
      if (T && i % 2 === 0 && c.textContent.trim()) T.sfx("dymo", at + i / cps, 0.55);
    });
    return end;
  };
  /** Tally marks in groups of five: one path per stroke, ready to draw in order. */
  E.tallyD = (x, y, n, { h = 56, gap = 10, group = 16, seed = 1 } = {}) => {
    const r = E.rng(seed), out = [];
    for (let i = 0; i < n; i++) {
      const g = Math.floor(i / 5), k = i % 5, gx = x + g * (4 * gap + group);
      if (k < 4) {
        const sx = gx + k * gap + (r() - 0.5) * 3;
        out.push(`M${sx.toFixed(1)} ${(y + (r() - 0.5) * 4).toFixed(1)} L${(sx + (r() - 0.5) * 4).toFixed(1)} ${(y + h + (r() - 0.5) * 4).toFixed(1)}`);
      } else out.push(`M${(gx - 7).toFixed(1)} ${(y + h * 0.78).toFixed(1)} L${(gx + 3 * gap + 7).toFixed(1)} ${(y + h * 0.18).toFixed(1)}`);
    }
    return out;
  };
  /** An svg ink layer of any size (for marks that ride on a card). */
  E.svgAt = (parent, w, h) => {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("class", "ink");
    s.setAttribute("viewBox", `0 0 ${w} ${h}`);
    s.style.width = `${w}px`; s.style.height = `${h}px`;
    parent.appendChild(s);
    return s;
  };
  /** Instant swap between stacked figure states (exact under seeking). */
  E.show = (tl, el, at, on = true) => tl.set(el, { autoAlpha: on ? 1 : 0 }, at);

  E.regMark = () => `<svg viewBox="0 0 30 30"><circle cx="15" cy="15" r="8" fill="none" stroke="#231f27" stroke-width="1.4"/><path d="M15 0v30M0 15h30" stroke="#231f27" stroke-width="1.4"/></svg>`;
})();
