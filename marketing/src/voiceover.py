"""Voiceover + captions for the promo video (Kokoro TTS, voice af_heart).

python3 src/voiceover.py  -> out/video/voice.wav, out/video/timeline.json, out/final/pickday-promo.en.srt
Model files: KOKORO_DIR (default /tmp/claude-0/voices): kokoro-v1.0.onnx, voices-v1.0.bin
"""
import json, os, pathlib
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = pathlib.Path(__file__).resolve().parent.parent
VID = ROOT / "out" / "video"; VID.mkdir(parents=True, exist_ok=True)
FINAL = ROOT / "out" / "final"; FINAL.mkdir(parents=True, exist_ok=True)
KD = os.environ.get("KOKORO_DIR", "/tmp/claude-0/voices")
VOICE, SPEED = "af_heart", 1.0

# (scene id, [sentences]). Every claim matches what the code does (see marketing/README.md).
SCRIPT = [
    ("hook", ["Running a bakery, a flower shop, or a meal-prep kitchen?", "Then you know the feeling.", "Too many orders on one day, and customers asking: when will mine arrive?"]),
    ("intro", ["Meet Pickday.", "Let customers pick the day."]),
    ("picker", ["Pickday adds a date picker to your cart, cart drawer and product pages.", "Customers choose local delivery, store pickup or shipping, then a day and a time slot.", "Only the days you're open can be picked."]),
    ("limits", ["Set how many orders you can handle each day, or in each time slot.", "When a slot fills up, it closes by itself.", "Add cut-off times, preparation time, and different limits for your busiest days."]),
    ("checkout", ["At checkout, customers only see the method they picked, with their date.", "And if the date is missing or no longer available, the order stops before it reaches you."]),
    ("orders", ["In your admin, see every order by day, and how full each day is.", "Move orders to another date in a few clicks.", "Customers can even change their own date, up to a deadline you set."]),
    ("print", ["Start each day with a printed day sheet, route sheet or production list.", "And get tomorrow's orders by email every day, free, with Shopify Flow."]),
    ("world", ["Public holidays come back every year on their own.", "Add closed days, or switch on vacation mode.", "And the picker speaks your customers' language, right-to-left included."]),
    ("easy", ["Pickday works on every Shopify plan, with no theme code to edit.", "A short setup wizard gets you ready in minutes."]),
    ("cta", ["Pickday.", "Let customers pick the day.", "Find it on the Shopify App Store."]),
]
LEAD, GAP, TAIL = 0.55, 0.38, 0.75
TAILS = {"hook": 0.5, "intro": 0.9, "cta": 1.8}


def main():
    k = Kokoro(f"{KD}/kokoro-v1.0.onnx", f"{KD}/voices-v1.0.bin")
    sr = 24000
    track, timeline, cues, t = [], [], [], 0.0
    for sid, sentences in SCRIPT:
        start = t
        parts = [np.zeros(int(LEAD * sr), np.float32)]
        t += LEAD
        for i, line in enumerate(sentences):
            audio, sr = k.create(line, voice=VOICE, speed=SPEED, lang="en-us")
            # trim leading/trailing near-silence
            idx = np.where(np.abs(audio) > 0.01)[0]
            audio = audio[max(0, idx[0] - 600): idx[-1] + 1200] if len(idx) else audio
            d = len(audio) / sr
            cues.append((t, t + d, line))
            parts.append(audio.astype(np.float32)); t += d
            if i < len(sentences) - 1:
                parts.append(np.zeros(int(GAP * sr), np.float32)); t += GAP
        tail = TAILS.get(sid, TAIL)
        parts.append(np.zeros(int(tail * sr), np.float32)); t += tail
        seg = np.concatenate(parts)
        # keep the scene duration on whole frames at 30 fps
        frames = int(round((t - start) * 30)); dur = frames / 30
        seg = np.pad(seg, (0, max(0, int(dur * sr) - len(seg))))[: int(dur * sr)]
        t = start + dur
        track.append(seg)
        timeline.append({"id": sid, "start": round(start, 4), "duration": round(dur, 4), "frames": frames,
                         "cues": [[round(a - start, 3), round(b - start, 3), s] for a, b, s in cues if a >= start]})
        print(f"{sid:9s} {dur:5.2f}s")
    voice = np.concatenate(track)
    sf.write(VID / "voice.wav", voice, sr)
    (VID / "timeline.json").write_text(json.dumps(timeline, indent=1))

    def ts(x):
        ms = int(round(x * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
    def wrap(line, width=42):
        if len(line) <= width:
            return line
        words, best = line.split(), None
        for i in range(1, len(words)):
            a, b = " ".join(words[:i]), " ".join(words[i:])
            score = max(len(a), len(b))
            if best is None or score < best[0]:
                best = (score, a + "\n" + b)
        return best[1]
    srt = []
    for n, (a, b, line) in enumerate(cues, 1):
        srt.append(f"{n}\n{ts(a)} --> {ts(b + 0.25)}\n{wrap(line)}\n")
    (FINAL / "pickday-promo.en.srt").write_text("\n".join(srt))
    print("total", round(len(voice) / sr, 2), "s")


if __name__ == "__main__":
    main()
