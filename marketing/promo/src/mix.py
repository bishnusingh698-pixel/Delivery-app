"""Final mix and encodes.  python3 src/mix.py [audio|video]   (both by default)
- voice (cleaned, compressed) + music (ducked under the voice) + sound effects, loudness-normalised
  to -14 LUFS / -1.5 dBTP in two passes (YouTube's reference level)
- build/frames/*.jpg (60 fps) -> 30 fps with a two-subframe blend (a 180-degree shutter's motion blur)
  H.264 High, CRF 16, closed 2-second GOP, 2 B-frames; AAC 192 kbps
- out/pickday-promo-1080p.mp4, out/pickday-promo-1080p-captioned.mp4, out/pickday-promo.en.srt,
  out/youtube-thumbnail-1280x720.png"""
import json, pathlib, shutil, subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
B, OUT = ROOT / "build", ROOT / "out"
OUT.mkdir(exist_ok=True)
def ff(*a, capture=False):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-y", *map(str, a)], capture_output=True, text=True)
    if r.returncode: raise SystemExit(r.stderr[-3000:])
    return r.stderr

import sys
steps = sys.argv[1:] or ["audio", "video"]
graph = ("[0:a]aresample=48000,highpass=f=80,equalizer=f=3200:t=q:w=1.2:g=2,"
         "acompressor=threshold=-21dB:ratio=3:attack=4:release=90:makeup=2,pan=stereo|c0=c0|c1=c0,asplit=2[v][key];"
         "[1:a]volume=0.32[m];[m][key]sidechaincompress=threshold=0.02:ratio=7:attack=10:release=420[md];"
         "[2:a]volume=0.9[fx];[v][md][fx]amix=inputs=3:duration=first:normalize=0[mix]")
if "audio" in steps:
  ff("-i", B / "voice.wav", "-i", B / "music.wav", "-i", B / "sfx.wav", "-filter_complex", graph, "-map", "[mix]", "-ar", 48000, "-c:a", "pcm_f32le", B / "premix.wav")
  log = ff("-i", B / "premix.wav", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-")
  m = json.loads(log[log.rindex("{"): log.rindex("}") + 1])
  ln = (f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:"
      f"measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
  ff("-i", B / "premix.wav", "-af", ln + ",aresample=48000", "-c:a", "pcm_s16le", B / "mix.wav")
  print("mix:", m["input_i"], "LUFS in ->", "-14 LUFS")
if "video" not in steps: raise SystemExit

fps = json.loads((B / "frames.json").read_text())["fps"]
video = ["-framerate", fps, "-i", B / "frames/f%05d.jpg", "-i", B / "mix.wav", "-map", "0:v", "-map", "1:a",
         "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-g", 60, "-bf", 2, "-profile:v", "high", "-pix_fmt", "yuv420p",
         "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
         "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest"]
blur = "tmix=frames=2:weights='1 1',fps=30" if fps == 60 else "null"
ff(*video[:6], "-vf", blur, *video[6:], OUT / "pickday-promo-1080p.mp4")
shutil.copy(B / "captions.srt", OUT / "pickday-promo.en.srt")
style = ("FontName=Inter,FontSize=12,Bold=1,PrimaryColour=&H00DBEAF1,OutlineColour=&H00271F23,BackColour=&H00271F23,"
         "BorderStyle=3,Outline=5,Shadow=0,MarginV=24,Alignment=2,Spacing=0.2")
srt = str(OUT / "pickday-promo.en.srt").replace(":", r"\:")
ff(*video[:6], "-vf", f"{blur},subtitles='{srt}':force_style='{style}'", *video[6:], OUT / "pickday-promo-1080p-captioned.mp4")
shutil.copy(B / "thumbnail-1280x720.png", OUT / "youtube-thumbnail-1280x720.png")
print("encoded", *sorted(p.name for p in OUT.iterdir()))
