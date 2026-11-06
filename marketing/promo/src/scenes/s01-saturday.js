/* 01 · The weekend rush: everyone wants Saturday; tickets pile up past the kitchen's twenty. */
SCENES["s01-saturday"] = (S, T, tl) => {
  const r = E.rng(11);
  // the tear-off date, printed big
  const month = E.el(S, `<div class="abs m inkc" style="left:128px;top:150px;font-size:22px;letter-spacing:.3em">November 2026</div>`);
  const big = E.el(S, `<div class="abs d blue mul tex nowrap" style="left:92px;top:176px;font-size:660px">14</div>`);
  const sat = E.el(S, `<div class="abs s orange mul nowrap" style="left:120px;top:780px;font-size:150px">Saturday</div>`);
  E.squeeze(tl, big, 0.04, { stagger: 0.06, dur: 0.7 });
  tl.fromTo(month, { opacity: 0 }, { opacity: 1, duration: 0.01 }, 0.1);
  const satSp = E.split(sat, "words,lines", "lines");
  E.riseWords(tl, satSp.words, 0.22, { dur: 0.7 });

  // counter
  const lab = E.el(S, `<div class="abs m inkc" style="left:1290px;top:150px;font-size:20px;letter-spacing:.24em">Orders for Sat 14</div>`);
  const cnt = E.el(S, `<div class="abs d inkc mul nowrap" style="left:1282px;top:182px;font-size:230px;font-stretch:62%">0</div>`);
  const cap = E.el(S, `<div class="abs d blue mul nowrap" style="left:1520px;top:262px;font-size:120px">/ 20</div>`);
  tl.fromTo(lab, { opacity: 0 }, { opacity: 1, duration: 0.01 }, 0.7);
  tl.fromTo(cnt, { opacity: 0 }, { opacity: 1, duration: 0.01 }, 0.7);
  const tw = T.w(1, "twenty");
  tl.fromTo(cap, { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.4, ease: "expo.out" }, tw - 0.05);

  // the rush: tickets fly in faster and faster, then spill over the date
  const items = ["1 × Birthday cake", "2 × Sourdough loaf", "1 × Croissant box", "6 × Cinnamon rolls", "1 × Peony bouquet", "1 × Family meal box", "12 × Macarons", "1 × Lemon tart", "3 × Baguette", "1 × Rose bouquet"];
  const slots = ["Delivery · 9–12", "Delivery · 12–3", "Pickup · 3–6", "Delivery · 3–6", "Pickup · 9–12"];
  const N = 27, times = [];
  for (let k = 0; k < N; k++) times.push(k < 20 ? 0.95 + Math.pow(k / 19, 0.8) * (tw - 0.95) : tw + (k - 19) * 0.095);
  times.forEach((at, k) => {
    const spill = k >= 19;
    const tx = spill ? 760 + r() * 420 : 1080 + r() * 520, ty = spill ? 420 + r() * 420 : 430 + r() * 400;
    const rot = (r() - 0.5) * (spill ? 34 : 26);
    const t = E.ticket(S, { no: 1031 + k, day: "Sat 14 Nov", lines: [items[k % items.length]], slot: slots[(k * 3) % slots.length], x: tx + 700, y: -480, rot: rot - 40 });
    tl.fromTo(t, { x: tx + 520 + r() * 200, y: -460, rotation: rot - 30 - r() * 30 }, { x: tx, y: ty, rotation: rot, duration: 0.42, ease: "power3.out" }, at - 0.42);
    E.count(tl, cnt, [k + 1], [at]);
    if (k === 20) tl.set(cnt, { color: "var(--orange)" }, at);
    if (k % 2 === 0 || k > 18) T.sfx("paper", at - 0.04, k > 18 ? 0.55 : 0.4);
  });

  // overbooked
  const st = E.stamp(S, "Overbooked", { x: 720, y: 600, rot: -9, size: 168 });
  E.slam(tl, st, tw + 0.95, T, { shake: 12 });
};
