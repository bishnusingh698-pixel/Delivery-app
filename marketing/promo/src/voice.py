"""Voiceover, word timings and captions for the promo video.

    python3 src/voice.py            (from marketing/promo)

Reads src/script.json, speaks every line with Kokoro TTS, finds when each word is said with
pocketsphinx forced alignment, places the scenes on the music's beat grid and writes:
  build/voice.wav       the full voiceover track (24 kHz mono)
  build/timeline.json   scenes (start, duration) with every line and word time, scene-local seconds
  build/captions.srt    caption cues of at most two short lines, cut on word timings
Kokoro model files: $KOKORO_DIR (default /tmp/claude-0/voices): kokoro-v1.0.onnx, voices-v1.0.bin
"""
import json, math, os, pathlib, re, subprocess, tempfile
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro
from pocketsphinx import Decoder

ROOT = pathlib.Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"; BUILD.mkdir(exist_ok=True)
SCRIPT = json.loads((ROOT / "src" / "script.json").read_text())
KD = os.environ.get("KOKORO_DIR", "/tmp/claude-0/voices")
SR = 24000
BEAT = 60 / SCRIPT["bpm"]
EXTRA = {"pickday": "P IH K D EY", "shopify": "SH AA P IH F AY"}


def norm_tokens(line):
    """Display tokens and, for each, the dictionary words pocketsphinx should hear."""
    out = []
    for tok in line.split():
        words = [w for w in re.split(r"[-\s]", re.sub(r"[^\w'\-]", "", tok.lower())) if w]
        words = [w.strip("'") for w in words if w.strip("'")]
        out.append((tok, words))
    return out


def align(audio, line, dec):
    toks = norm_tokens(line)
    words = [w for _, ws in toks for w in ws]
    with tempfile.TemporaryDirectory() as td:
        sf.write(f"{td}/a.wav", audio, SR)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", f"{td}/a.wav", "-ar", "16000", "-ac", "1", "-sample_fmt", "s16", f"{td}/b.wav"], check=True)
        pcm, _ = sf.read(f"{td}/b.wav", dtype="int16")
    for w in words:
        if dec.lookup_word(w) is None:
            dec.add_word(w, EXTRA.get(w) or " ".join("AH" for _ in w[:3]), True)
    dec.set_align_text(" ".join(words))
    dec.start_utt(); dec.process_raw(pcm.tobytes(), full_utt=True); dec.end_utt()
    segs = [(re.sub(r"\(\d+\)$", "", s.word), s.start_frame / 100, (s.end_frame + 1) / 100) for s in dec.seg()]
    segs = [s for s in segs if s[0] not in ("<s>", "</s>", "<sil>", "[NOISE]")]
    dur = len(audio) / SR
    if [s[0] for s in segs] != words:  # alignment failed: spread by length
        print("  ! alignment fallback for:", line)
        total = sum(len(w) + 1 for w in words); t = 0; segs = []
        for w in words:
            d = dur * (len(w) + 1) / total; segs.append((w, t, t + d)); t += d
    out, i = [], 0
    for tok, ws in toks:
        part = segs[i:i + len(ws)]; i += len(ws)
        out.append({"w": tok, "s": round(part[0][1], 3), "e": round(min(dur, part[-1][2]), 3)})
    return out


def main():
    k = Kokoro(f"{KD}/kokoro-v1.0.onnx", f"{KD}/voices-v1.0.bin")
    dec = Decoder(lm=None, loglevel="ERROR")
    track, scenes, t = [], [], 0.0
    for sc in SCRIPT["scenes"]:
        start = t
        parts = [np.zeros(int(sc["lead"] * SR), np.float32)]
        local = sc["lead"]; lines = []
        for i, text in enumerate(sc["lines"]):
            audio, sr = k.create(text, voice=SCRIPT["voice"], speed=SCRIPT["speed"], lang="en-us")
            idx = np.where(np.abs(audio) > 0.008)[0]
            audio = audio[max(0, idx[0] - 480): idx[-1] + 1440].astype(np.float32)
            words = align(audio, text, dec)
            d = len(audio) / SR
            lines.append({"text": text, "s": round(local, 3), "e": round(local + d, 3),
                          "words": [{"w": w["w"], "s": round(local + w["s"], 3), "e": round(local + w["e"], 3)} for w in words]})
            parts.append(audio); local += d
            if i < len(sc["lines"]) - 1:
                parts.append(np.zeros(int(sc["gap"] * SR), np.float32)); local += sc["gap"]
        beats = math.ceil((local + sc["tail"]) / BEAT - 1e-6)
        dur = round(beats * BEAT, 4)
        seg = np.concatenate(parts)
        seg = np.pad(seg, (0, max(0, int(round(dur * SR)) - len(seg))))[: int(round(dur * SR))]
        track.append(seg)
        scenes.append({"id": sc["id"], "start": round(start, 4), "dur": dur, "beats": beats, "lines": lines})
        print(f"{sc['id']:14s} start {start:6.2f}  dur {dur:5.2f}  ({beats} beats)")
        t = start + dur
    voice = np.concatenate(track)
    sf.write(BUILD / "voice.wav", voice, SR)
    tl = {"bpm": SCRIPT["bpm"], "beat": BEAT, "total": round(t, 4), "scenes": scenes}
    (BUILD / "timeline.json").write_text(json.dumps(tl, indent=1, ensure_ascii=False))
    (BUILD / "timeline.js").write_text("window.TIMELINE = " + json.dumps(tl, ensure_ascii=False) + ";\n")
    write_srt(scenes)
    print(f"total {t:.2f}s")


def write_srt(scenes, limit=40):
    def ts(x):
        ms = int(round(x * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
    cues = []
    for sc in scenes:
        for ln in sc["lines"]:
            chunk = []
            for i, w in enumerate(ln["words"]):
                chunk.append(w)
                text = " ".join(x["w"] for x in chunk)
                nxt = ln["words"][i + 1]["w"] if i + 1 < len(ln["words"]) else None
                breakable = w["w"][-1] in ",.?!" or nxt is None
                if nxt is None or (breakable and len(text) > 14) or len(text + " " + (nxt or "")) > limit * 2:
                    cues.append((sc["start"] + chunk[0]["s"], sc["start"] + chunk[-1]["e"], text)); chunk = []
    # a cue on screen for under a second can't be read: fold it into the next one when they fit together
    merged = []
    for c in cues:
        if merged and merged[-1][1] - merged[-1][0] < 1.0 and c[0] - merged[-1][1] < 0.3 and len(merged[-1][2] + " " + c[2]) <= limit * 2:
            a, _, t = merged.pop(); c = (a, c[1], t + " " + c[2])
        merged.append(c)
    cues = merged
    srt = []
    for n, (a, b, text) in enumerate(cues, 1):
        nxt_start = cues[n][0] if n < len(cues) else b + 1
        end = min(b + 0.35, nxt_start - 0.02)
        srt.append(f"{n}\n{ts(a)} --> {ts(end)}\n{wrap(text, limit)}\n")
    (BUILD / "captions.srt").write_text("\n".join(srt))


def wrap(line, width):
    if len(line) <= width:
        return line
    words, best = line.split(), None
    for i in range(1, len(words)):
        a, b = " ".join(words[:i]), " ".join(words[i:])
        score = max(len(a), len(b))
        if best is None or score < best[0]:
            best = (score, a + "\n" + b)
    return best[1]


if __name__ == "__main__":
    import sys
    if "--captions" in sys.argv:   # rewrite captions.srt from the existing timeline, no speech synthesis
        write_srt(json.loads((BUILD / "timeline.json").read_text())["scenes"])
    else:
        main()
