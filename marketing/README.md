# Marketing kit: App Store icon, listing images, promo video

Everything here is generated from the app's own code, so the images show the real storefront
picker (`extensions/pickday-theme/assets/pickday.js`) and the real day sheet
(`app/services/print.server.ts`). The orders calendar, capacity and days-off cards copy the
admin's markup and CSS. The sample store "Juniper Street Bakery" and its orders are made up.

Listing copy, alt text, YouTube title/description/chapters and the rule checks live in the
shared "Pickday listing and YouTube copy" doc; `docs/APP_STORE_LISTING.md` has the English text too.

## Rebuild

Needs Node 22, Python 3.11+ with `pillow numpy soundfile kokoro-onnx`, ffmpeg with libass, and Chromium for Playwright.
Kokoro model files (`kokoro-v1.0.onnx`, `voices-v1.0.bin`) from
https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0 in `$KOKORO_DIR`.

```bash
npm ci && npm run build:widget
npx tsx marketing/src/widget-shots.ts          # real widget states -> out/parts/w-*.png
SHOPIFY_API_KEY=x SHOPIFY_API_SECRET=x SHOPIFY_APP_URL=https://x.test DATABASE_URL=postgres://x \
  npx tsx marketing/src/print-shots.ts         # real day sheet -> out/parts/day-sheet.html
cd marketing
node src/shot.cjs src/logo.svg out/logo-1200.png 1200 1200
python3 src/scenes.py && for f in out/scenes/*.html; do node src/shot.cjs $f ${f%.html}.png 1600 900; done
python3 src/voiceover.py                       # voice.wav, timeline.json, captions (.srt)
python3 src/video.py && node src/render-video.cjs
python3 src/music.py "$(python3 -c "import json;t=json.load(open('out/video/timeline.json'));print(t[-1]['start']+t[-1]['duration'])")"
# then concat + mix: see the ffmpeg commands at the end of this file
```

Dates in the images follow today's date (the widget runs live), so rebuilding moves them.

```bash
cd out/video
printf "file 'clips/%s.mp4'\n" hook intro picker limits checkout orders print world easy cta > concat.txt
ffmpeg -y -f concat -safe 0 -i concat.txt -c copy video-only.mp4
ffmpeg -y -i voice.wav -i music.wav -filter_complex "[0:a]aresample=48000,pan=stereo|c0=c0|c1=c0,highpass=f=70,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,asplit=2[v][sc];[1:a]aresample=48000,volume=0.1,aecho=0.8:0.7:60|120:0.25|0.15[m];[m][sc]sidechaincompress=threshold=0.03:ratio=4:attack=20:release=500[md];[v][md]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]" -map "[a]" -ar 48000 mix.wav
ffmpeg -y -i video-only.mp4 -i mix.wav -c:v copy -c:a aac -b:a 192k -movflags +faststart -shortest ../final/pickday-promo-1080p.mp4
cd ../final && ffmpeg -y -i pickday-promo-1080p.mp4 -vf "subtitles=pickday-promo.en.srt:force_style='FontName=Inter,FontSize=11,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H18331B0B,BackColour=&H18331B0B,BorderStyle=3,Outline=4,Shadow=0,MarginV=20,Alignment=2'" -c:v libx264 -crf 17 -c:a copy -movflags +faststart pickday-promo-1080p-captioned.mp4
```
