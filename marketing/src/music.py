"""A soft, original background bed (synthesised, no samples): warm pads + plucked arpeggio, 100 BPM.
python3 src/music.py SECONDS -> out/video/music.wav
"""
import sys, pathlib
import numpy as np
import soundfile as sf

ROOT = pathlib.Path(__file__).resolve().parent.parent
SR = 44100
dur = float(sys.argv[1]) if len(sys.argv) > 1 else 100
n = int(dur * SR)
t = np.arange(n) / SR
BPM = 100; beat = 60 / BPM; bar = 4 * beat

def hz(m): return 440 * 2 ** ((m - 69) / 12)
# D major: D – A – Bm – G  (I V vi IV)
chords = [[50, 57, 62, 66, 69], [45, 57, 61, 64, 69], [47, 54, 59, 62, 66], [43, 55, 59, 62, 67]]
pad = np.zeros(n); pluck = np.zeros(n); bass = np.zeros(n)
rng = np.random.default_rng(3)
nbars = int(np.ceil(dur / bar))
for b in range(nbars):
    ch = chords[b % 4]
    s0 = int(b * bar * SR); s1 = min(n, int((b + 1) * bar * SR + 0.6 * SR))
    if s0 >= n: break
    tt = np.arange(s1 - s0) / SR
    env = np.minimum(1, tt / 0.9) * np.minimum(1, np.maximum(0, (bar + 0.6 - tt) / 0.9))
    for m in ch[1:]:
        f = hz(m)
        for k, a in ((1, 1), (2, .35), (3, .12)):
            pad[s0:s1] += a * env * np.sin(2 * np.pi * f * k * tt + rng.uniform(0, 6)) * (1 + .003 * np.sin(2 * np.pi * .3 * tt))
    fb = hz(ch[0] - 12)
    bass[s0:s1] += env * (np.sin(2 * np.pi * fb * tt) + .3 * np.sin(4 * np.pi * fb * tt))
    # arpeggio: 8th notes over the chord tones, up and down
    seq = [ch[1] + 12, ch[2] + 12, ch[3] + 12, ch[4] + 12, ch[3] + 12, ch[2] + 12, ch[4] + 12, ch[3] + 12]
    for i, m in enumerate(seq):
        p0 = int((b * bar + i * beat / 2) * SR)
        if p0 >= n: break
        L = min(n - p0, int(1.2 * SR)); tt2 = np.arange(L) / SR
        f = hz(m)
        e = np.exp(-tt2 * 5.5) * np.minimum(1, tt2 / .004)
        pluck[p0:p0 + L] += e * (np.sin(2 * np.pi * f * tt2) + .25 * np.sin(4 * np.pi * f * tt2) * np.exp(-tt2 * 9))
mix = .16 * pad / 4 + .5 * pluck * .22 + .2 * bass
# simple stereo + fade in/out
fade = np.minimum(1, t / 2.0) * np.minimum(1, np.maximum(0, (dur - t) / 3.0))
mix *= fade
left = mix + .02 * np.roll(pluck, int(.012 * SR)) * fade
right = mix + .02 * np.roll(pluck, int(.019 * SR)) * fade
st = np.stack([left, right], 1)
st /= np.max(np.abs(st)) / .8
out = ROOT / "out" / "video" / "music.wav"
sf.write(out, st.astype(np.float32), SR)
print(out, dur)
