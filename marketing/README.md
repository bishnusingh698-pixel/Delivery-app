# Marketing kit: App Store icon, listing images, promo video

Everything here is generated from the app's own code, so the images show the real storefront
picker (`extensions/pickday-theme/assets/pickday.js`) and the real day sheet
(`app/services/print.server.ts`). The orders calendar, capacity and days-off cards copy the
admin's markup and CSS. The sample store "Juniper Street Bakery" and its orders are made up.

Listing copy, alt text, YouTube title/description/chapters and the rule checks live in the
shared "Pickday listing and YouTube copy" doc; `docs/APP_STORE_LISTING.md` has the English text too.

## Rebuild the icon and listing images

Needs Node 22, Python 3.11+ with `pillow numpy`, and Chromium for Playwright.

```bash
npm ci && npm run build:widget
npx tsx marketing/src/widget-shots.ts          # real widget states -> out/parts/w-*.png
SHOPIFY_API_KEY=x SHOPIFY_API_SECRET=x SHOPIFY_APP_URL=https://x.test DATABASE_URL=postgres://x \
  npx tsx marketing/src/print-shots.ts         # real day sheet -> out/parts/day-sheet.html
cd marketing
node src/shot.cjs src/logo.svg out/logo-1200.png 1200 1200
python3 src/scenes.py && for f in out/scenes/*.html; do node src/shot.cjs $f ${f%.html}.png 1600 900; done
```

Dates in the images follow today's date (the widget runs live), so rebuilding moves them.

## Promo video (`promo/`)

One theme, end to end: **tear-off day sheets**. Every scene is a page of a desk calendar pad, printed
in two risograph inks (blue `#2546b3`, fluorescent orange `#ff5a2c`) on cream stock, and torn off at
each cut. Display type is Archivo Condensed, accents are Fraunces Italic, labels are IBM Plex Mono.
Words are set the moment the voice says them; ink circles, ticks and strikes are drawn on the real
UI; orders arrive as tickets, rules are punched on label tape, limits are a punch card, the day is
stamped FULL. The app's own UI and print pages appear as printed figures (Fig. 1–3): the storefront
picker in English and in Arabic (right to left, mirrored by the widget itself), and the real day
sheet, route sheet and production list. The logo appears untouched, as a sticker.

How it is made: `src/stage.html` builds all 11 sheets with GSAP on one paused timeline, and
`window.seek(t)` draws any frame exactly (everything random is seeded), so frames render in parallel.
The camera is fixed and the print grain holds still: grain that moved every frame made the first
encode 730 MB, and a still grain brings the 1:38 cut to about 90 MB with no visible difference.
Music and sound effects are synthesised in `src/audio.py` (no samples) and follow the edit.

Needs Python with `numpy soundfile kokoro-onnx pocketsphinx`, ffmpeg with libass, and Playwright with
Chromium. Kokoro model files (`kokoro-v1.0.onnx`, `voices-v1.0.bin`) from
https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0 in `$KOKORO_DIR`.

```bash
cd marketing/promo && npm ci
python3 src/voice.py            # voice.wav, word timings (timeline.json/js), captions.srt; scenes snap to a 100 BPM grid
python3 src/textures.py         # paper, grain, ink and rubber-stamp textures
cd ../.. && SHOPIFY_API_KEY=x SHOPIFY_API_SECRET=x SHOPIFY_APP_URL=https://x.test DATABASE_URL=postgres://x \
  npx tsx marketing/promo/src/parts.ts && cd marketing/promo   # real UI + print pages, fixed story dates
node src/preview.cjs 3.5 9.4 20.6   # spot-check frames -> build/preview/
node src/render.cjs 60 3        # 60 fps JPEG frames, 3 parallel browsers -> build/frames/ (+ build/sfx.json); RESUME=1 fills gaps
python3 src/audio.py            # build/music.wav, build/sfx.wav
node src/thumb.cjs              # build/thumbnail-1280x720.png
python3 src/mix.py              # out/: 1080p mp4, captioned mp4, .srt, thumbnail
```

App Store listing images use the same pad of sheets: a feature image and six 1600 × 900 screenshots,
each built around real UI (the widget shots in `out/parts/` from `widget-shots.ts`, the admin and checkout
markup from `src/scenes.py`, and the promo's print pages):

```bash
cd marketing/promo
python3 src/listing-parts.py && node src/listing.cjs   # -> out/listing/listing-0[0-6]-*.png
```

`python3 src/voice.py --captions` rewrites the captions alone. The story dates are fixed (today is
Thursday 5 November 2026, the shopper picks Saturday 14), so rebuilds are identical.
