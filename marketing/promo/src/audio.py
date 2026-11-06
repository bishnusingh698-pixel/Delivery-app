"""Music and print-shop sound effects for the promo, synthesised from scratch (no samples).
python3 src/audio.py  ->  build/music.wav, build/sfx.wav  (48 kHz stereo)
Reads build/timeline.json (scene starts, word times) and build/sfx.json (cue list from the stage).
The music is a 100 BPM groove that follows the edit: tension under the weekend rush, the groove
lands on "So let customers pick the day", stop-times on FULL and on "No date? No order.", a
breakdown for the languages, a build, and a resolved ending."""
import json, pathlib
import numpy as np
import soundfile as sf

ROOT = pathlib.Path(__file__).resolve().parent.parent
SR = 48000
TL = json.loads((ROOT / "build/timeline.json").read_text())
CUES = json.loads((ROOT / "build/sfx.json").read_text())
TOTAL = TL["total"]
N = int(TOTAL * SR) + SR
BEAT = 60 / 100
rng = np.random.default_rng(14)

def scene(sid): return next(s for s in TL["scenes"] if s["id"] == sid)
def word(sid, line, w, nth=1):
    s = scene(sid); seen = 0
    for x in s["lines"][line]["words"]:
        if x["w"].lower().strip(".,?!'").startswith(w):
            seen += 1
            if seen == nth: return s["start"] + x["s"]
    raise KeyError(w)

# ---------- dsp helpers ----------
def tt(d): return np.arange(int(d * SR)) / SR
def band(x, lo, hi, soft=0.15):
    """Zero-phase band-pass by FFT mask with soft edges (fine for short sounds)."""
    n = len(x); F = np.fft.rfft(x, 2 * n); f = np.fft.rfftfreq(2 * n, 1 / SR)
    m = np.ones_like(f)
    if lo: m *= 1 / (1 + (lo / np.maximum(f, 1)) ** (2 / soft * 0.15 * 4))
    if hi: m *= 1 / (1 + (f / hi) ** (2 / soft * 0.15 * 4))
    return np.fft.irfft(F * m)[:n]
def noise(d): return rng.standard_normal(int(d * SR))
def env_exp(d, k, att=0.002):
    t = tt(d); return np.minimum(1, t / max(att, 1e-4)) * np.exp(-t * k)
def norm(x, peak=1.0): return x / (np.max(np.abs(x)) + 1e-9) * peak
def conv_reverb(x, secs=1.6, decay=4.0, wet=0.25, seed=3):
    r = np.random.default_rng(seed); L = int(secs * SR)
    ir = r.standard_normal(L) * np.exp(-np.arange(L) / SR * decay)
    ir = band(ir, 200, 7000); ir /= np.sqrt(np.sum(ir ** 2))
    n = len(x) + L; F = np.fft.rfft(x, n) * np.fft.rfft(ir, n)
    return x + wet * np.fft.irfft(F, n)[:len(x)]
def place(buf, snd, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= len(buf) or i + len(snd) <= 0: return
    if i < 0: snd = snd[-i:]; i = 0
    j = min(len(buf), i + len(snd)); s = snd[: j - i] * gain
    buf[i:j, 0] += s * np.sqrt(0.5 * (1 - pan)) * 1.414
    buf[i:j, 1] += s * np.sqrt(0.5 * (1 + pan)) * 1.414
def hz(m): return 440 * 2 ** ((m - 69) / 12)

# ---------- sound effects ----------
def sfx_tear():
    d = 0.55; t = tt(d)
    crackle = np.zeros(len(t)); k = 0
    while k < len(t):
        crackle[k] = rng.uniform(0.4, 1) * rng.choice([-1, 1]); k += int(rng.uniform(0.0006, 0.004) * SR * (1 + 3 * k / len(t)))
    body = band(noise(d), 900, 7000) * 0.5 + band(crackle, 1500, 9000) * 2.5
    e = np.minimum(1, t / 0.05) * np.exp(-np.maximum(0, t - 0.22) * 9) * (0.7 + 0.3 * np.sin(t * 60))
    return norm(body * e, 0.9)
def sfx_stamp():
    d = 0.6; t = tt(d)
    f = 48 + 70 * np.exp(-t * 40); thump = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 12)
    slap = band(noise(d), 300, 3800) * np.exp(-t * 45)
    rattle = band(noise(d), 2000, 6000) * np.exp(-np.maximum(0, t - 0.03) * 30) * (t > 0.03) * 0.25
    return norm(thump * 1.0 + slap * 0.9 + rattle, 1.0)
def sfx_slap():
    d = 0.3; t = tt(d)
    return norm(band(noise(d), 400, 5000) * np.exp(-t * 55) + 0.6 * np.sin(2 * np.pi * 110 * t) * np.exp(-t * 25), 0.9)
def sfx_paper():
    d = 0.16; t = tt(d)
    return norm(band(noise(d), 1800, 7500) * np.minimum(1, t / 0.012) * np.exp(-t * 32), 0.8)
def sfx_scribble():
    d = 0.42; t = tt(d)
    strokes = 0.55 + 0.45 * np.sin(2 * np.pi * (9 + 3 * t) * t) ** 2
    return norm(band(noise(d), 1400, 5200) * strokes * np.minimum(1, t / 0.03) * np.exp(-np.maximum(0, t - 0.28) * 18), 0.7)
def sfx_click():
    d = 0.09; out = np.zeros(int(d * SR))
    for at, g in ((0.0, 1), (0.055, 0.6)):
        s = band(noise(0.006), 2500, 12000) * np.exp(-tt(0.006) * 900) * g
        i = int(at * SR); out[i:i + len(s)] += s
    return norm(out, 0.8)
def sfx_dymo():
    d = 0.05; t = tt(d)
    return norm(band(noise(d), 1500, 6000) * np.exp(-t * 160) + 0.4 * np.sin(2 * np.pi * 2300 * t) * np.exp(-t * 120), 0.7)
def sfx_punch():
    d = 0.25; t = tt(d)
    clunk = np.sin(2 * np.pi * (90 + 120 * np.exp(-t * 60)) * t) * np.exp(-t * 30)
    clk = band(noise(d), 2500, 9000) * np.exp(-t * 140)
    return norm(clunk + 0.8 * clk, 0.9)
def sfx_roller():
    d = 1.0; t = tt(d)
    steps = (np.sin(2 * np.pi * 22 * t) > 0.6).astype(float)
    hum = 0.3 * np.sin(2 * np.pi * 118 * t) * (1 + 0.3 * np.sin(2 * np.pi * 7 * t))
    grit = band(noise(d), 900, 4500) * (0.35 + 0.65 * steps)
    e = np.minimum(1, t / 0.04) * np.minimum(1, (d - t) / 0.12)
    return norm((grit + hum) * e, 0.6)
def sfx_type():
    d = 0.4; out = np.zeros(int(d * SR))
    for k in range(9):
        s = sfx_dymo() * rng.uniform(0.5, 1); i = int((k * 0.042 + rng.uniform(0, 0.01)) * SR)
        out[i:i + len(s)] += s[: len(out) - i]
    return norm(out, 0.7)
def sfx_whoosh():
    d = 0.5; t = tt(d); x = noise(d)
    lo = band(x, 300, 1200); hi = band(x, 1500, 5000)
    mix = lo * (1 - t / d) + hi * (t / d)
    return norm(mix * np.sin(np.pi * t / d) ** 2, 0.6)
SFX = {"tear": sfx_tear, "stamp": sfx_stamp, "slap": sfx_slap, "paper": sfx_paper, "scribble": sfx_scribble, "click": sfx_click,
       "dymo": sfx_dymo, "punch": sfx_punch, "roller": sfx_roller, "type": sfx_type, "whoosh": sfx_whoosh}
LEVEL = {"tear": 0.55, "stamp": 0.8, "slap": 0.55, "paper": 0.3, "scribble": 0.32, "click": 0.45, "dymo": 0.22, "punch": 0.45, "roller": 0.35, "type": 0.3, "whoosh": 0.35}

fx = np.zeros((N, 2))
for c in CUES:
    place(fx, SFX[c["name"]](), c["t"], c["gain"] * LEVEL[c["name"]], pan=float(rng.uniform(-0.35, 0.35)))
fx[:, 0] = conv_reverb(fx[:, 0], 0.5, 9, 0.12, 5); fx[:, 1] = conv_reverb(fx[:, 1], 0.5, 9, 0.12, 6)
sf.write(ROOT / "build/sfx.wav", fx[: int(TOTAL * SR)].astype(np.float32), SR)
print("sfx cues:", len(CUES))

# ---------- instruments ----------
def kick(v=1):
    t = tt(0.45); f = 46 + 95 * np.exp(-t * 38)
    return v * (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 8) + 0.15 * band(noise(0.45), 2000, 8000) * np.exp(-t * 300))
def clap(v=1):
    d = 0.3; t = tt(d); x = band(noise(d), 900, 5200); e = np.zeros_like(t)
    for o in (0, 0.011, 0.022): e += (t >= o) * np.exp(-(t - o) * 160) * (t >= o)
    e += (t >= 0.03) * np.exp(-np.maximum(0, t - 0.03) * 22) * 0.6
    return v * x * e * 0.8
def shaker(v=1):
    d = 0.09; t = tt(d); return v * band(noise(d), 6500, 15000) * np.minimum(1, t / 0.008) * np.exp(-t * 55) * 0.5
def block(m, v=1):
    t = tt(0.15); f = hz(m); return v * (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 40)) * np.exp(-t * 45) * 0.5
def bass(m, d, v=1):
    t = tt(d + 0.1); f = hz(m); ph = 2 * np.pi * f * t
    w = sum(np.sin(k * ph) / k ** 2 * (1 if k % 2 else 0.6) for k in range(1, 7))
    e = np.minimum(1, t / 0.006) * np.exp(-t * 2.2) * np.minimum(1, np.maximum(0, (d + 0.1 - t) / 0.06))
    return v * band(w * e, 0, 1400) * 0.9
def keys(ms, d, v=1):
    t = tt(d + 0.6); out = np.zeros_like(t)
    for m in ms:
        f = hz(m)
        out += np.sin(2 * np.pi * f * t + 0.3 * np.sin(2 * np.pi * f * t)) * np.exp(-t * 1.6) + 0.12 * np.sin(2 * np.pi * f * 14 * t) * np.exp(-t * 14)
    trem = 1 + 0.12 * np.sin(2 * np.pi * 4.6 * t)
    e = np.minimum(1, t / 0.004) * np.minimum(1, np.maximum(0, (d + 0.6 - t) / 0.5))
    return v * out * trem * e / len(ms) * 0.9
def marimba(m, v=1):
    t = tt(1.0); f = hz(m)
    return v * (np.sin(2 * np.pi * f * t) * np.exp(-t * 6) + 0.35 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t * 22) + 0.08 * band(noise(1.0), 1500, 6000) * np.exp(-t * 200)) * 0.7
def pad(ms, d, v=1):
    t = tt(d); out = np.zeros_like(t)
    for m in ms:
        for det in (-0.08, 0.08):
            f = hz(m) * 2 ** (det / 12); ph = 2 * np.pi * f * t + rng.uniform(0, 6)
            out += np.sin(ph) + 0.3 * np.sin(2 * ph) + 0.1 * np.sin(3 * ph)
    e = np.minimum(1, t / 0.6) * np.minimum(1, np.maximum(0, (d - t) / 0.8))
    return v * out * e / (2 * len(ms)) * 0.35

# ---------- arrangement ----------
B = lambda b: b * BEAT                      # beat index -> seconds
mus = np.zeros((N, 2)); drums = np.zeros((N, 2))
PROG = [([53, 57, 60, 64], 41), ([52, 55, 59, 62], 40), ([50, 53, 57, 60], 38), ([55, 60, 62, 65], 43)]   # Fmaj7 Em7 Dm7 G7sus (keys, bass root)
BREAK = [([57, 60, 64, 67], 45), ([53, 57, 60, 64], 41), ([48, 55, 60, 64], 36), ([55, 59, 62, 67], 43)]
total_beats = int(np.ceil(TOTAL / BEAT))
s = {x["id"]: round(x["start"] / BEAT) for x in TL["scenes"]}
full_hit = word("s04-limits", 1, "full") + 0.12
nodate, noorder = word("s06-checkout", 1, "no"), word("s06-checkout", 1, "no", 2)
end_word = word("s11-cta", 2, "store") + 0.4
stops = [(full_hit - 0.05, full_hit + BEAT * 1.5), (nodate - 0.12, noorder + BEAT * 1.6)]
def stopped(t): return any(a <= t < b for a, b in stops)

def section(b):
    if b < s["s02-pickday"]: return "intro"
    if b < s["s05-rules"]: return "A"
    if b < s["s06-checkout"]: return "B"
    if b < s["s08-print"]: return "A"
    if b < s["s09-language"]: return "B"
    if b < s["s10-plans"]: return "break"
    if b < s["s11-cta"]: return "build"
    return "final"

bar0 = 1  # bars start on beat 1 so the groove's downbeat lands on scene 2
for b in range(total_beats):
    t = B(b); sec = section(b); pos = (b - bar0) % 4; bar = (b - bar0) // 4
    chord, root = (BREAK if sec == "break" else PROG)[bar % 4]
    if t > end_word + 0.1: break
    st = stopped(t)
    if sec == "intro":
        # the rush: a clock ticking faster as the tickets pile up, a pedal underneath
        place(drums, block(84 if pos == 0 else 79, 0.55), t, 0.6)
        if b >= 3: place(drums, block(79, 0.35), t + BEAT / 2, 0.5)
        if b >= 6: [place(drums, shaker(0.6), t + k * BEAT / 4, 0.7) for k in range(4)]
        if pos == 0 and b < 10: place(mus, bass(41, BEAT * 4, 0.7), t, 0.8)
        continue
    if sec in ("A", "B", "final") and not st:
        if pos in (0, 2) or (sec == "B" and pos == 3): place(drums, kick(1), t, 0.9)
        if pos in (1, 3): place(drums, clap(1), t, 0.55, pan=0.05)
        for k in range(4):
            if not stopped(t + k * BEAT / 4): place(drums, shaker(1.0 if k == 2 else 0.55), t + k * BEAT / 4 + (0.012 if k % 2 else 0), 0.7, pan=0.3)
        # bass: root, a syncopated push, the fifth
        if pos == 0: place(mus, bass(root - 12, BEAT * 1.4), t, 0.9)
        if pos == 1: place(mus, bass(root - 12, BEAT * 0.4, 0.8), t + BEAT / 2, 0.8)
        if pos == 2: place(mus, bass(root - 5, BEAT * 0.9), t, 0.85)
        if pos == 3 and sec == "B": place(mus, bass(root, BEAT * 0.4, 0.7), t + BEAT / 2, 0.75)
        # keys: off-beat stabs
        if pos in (1, 3): place(mus, keys(chord, BEAT * 0.45, 0.9), t + BEAT / 2, 0.55, pan=-0.2)
        if sec == "B": place(mus, block(chord[pos % 4] + 12, 0.6), t + BEAT * 0.75, 0.35, pan=0.4)
    if sec == "break":
        if pos == 0: place(mus, pad(chord, BEAT * 4.2, 1), t, 0.9)
        arp = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[3] + 12]
        for k in range(2): place(mus, marimba(arp[(pos * 2 + k) % 4], 0.8), t + k * BEAT / 2, 0.55, pan=(-0.3 if k else 0.3))
        if pos == 0: place(mus, bass(root - 12, BEAT * 3.5, 0.6), t, 0.6)
        place(drums, shaker(0.5), t + BEAT / 2, 0.5, pan=0.3)
    if sec == "build":
        k_in = b - s["s10-plans"]
        place(drums, kick(0.9), t, 0.8)
        if k_in >= 4 and pos in (1, 3): place(drums, clap(1), t, 0.5)
        if k_in >= 8: [place(drums, clap(0.4 + 0.15 * k), t + k * BEAT / 4, 0.35) for k in range(4)]
        [place(drums, shaker(0.6), t + k * BEAT / 4, 0.6, pan=0.3) for k in range(4)]
        if pos == 0: place(mus, pad(chord, BEAT * 4.2, 0.8), t, 0.7)
        place(mus, bass(root - 12, BEAT * 0.8, 0.8), t, 0.8)

# the "pick the day" motif (C - D - G) on the words, both times they are spoken
for sid, line in (("s02-pickday", 0), ("s11-cta", 1)):
    for m, w in ((72, "pick"), (74, "the"), (79, "day")):
        place(mus, marimba(m, 1), word(sid, line, w), 0.75, pan=0.15)
# accents on the stops
place(mus, keys([53, 57, 60, 64, 69], 1.0, 1), full_hit, 0.8)
place(drums, kick(1.2), full_hit, 0.9)
for at in (nodate, noorder):
    place(mus, keys([50, 53, 57, 60], 0.5, 1), at, 0.75); place(drums, kick(1.1), at, 0.85)
# the end: a chord that rings out under the logo
hit = word("s11-cta", 0, "pickday")
place(mus, pad([48, 55, 60, 64, 67], TOTAL - hit, 1), hit, 0.8)
place(mus, keys([48, 55, 60, 64, 67, 72], 3.0, 1), end_word, 0.9)
place(mus, marimba(84, 1), end_word, 0.5); place(mus, marimba(79, 0.8), end_word + BEAT / 2, 0.45); place(mus, marimba(72, 0.7), end_word + BEAT, 0.4)
place(drums, kick(1), end_word, 0.9)

mix = mus + drums * 0.85
for ch in (0, 1): mix[:, ch] = conv_reverb(mix[:, ch], 1.8, 3.2, 0.18, 10 + ch)
t = np.arange(N) / SR
fade = np.minimum(1, t / 0.4) * np.clip((TOTAL - t) / 2.2, 0, 1)
mix *= fade[:, None]
mix = np.tanh(mix / (np.max(np.abs(mix)) + 1e-9) * 1.4) * 0.8
sf.write(ROOT / "build/music.wav", mix[: int(TOTAL * SR)].astype(np.float32), SR)
print("music ok", TOTAL)
