"""Writes the 1920x1080 animated HTML scenes of the promo video (out/video/scenes/*.html).

Feature scenes reuse the listing-image layouts (out/scenes, built by scenes.py) scaled 1.2x,
with entrance animations timed to the voiceover cues in out/video/timeline.json.
render-video.cjs then steps every CSS animation frame by frame and encodes with ffmpeg.
"""
import json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SC = ROOT / "out" / "scenes"
VS = ROOT / "out" / "video" / "scenes"; VS.mkdir(parents=True, exist_ok=True)
TL = {s["id"]: s for s in json.loads((ROOT / "out" / "video" / "timeline.json").read_text())}
P = "../../parts/"
LOGO = (ROOT / "src" / "logo.svg").read_text()

ANIM = """
@keyframes up{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
@keyframes rise{from{opacity:0;transform:translateY(60px) scale(.97)}to{opacity:1;transform:none}}
@keyframes pop{0%{opacity:0;transform:scale(.6)}70%{opacity:1;transform:scale(1.06)}100%{opacity:1;transform:scale(1)}}
@keyframes fadein{from{opacity:0}to{opacity:1}}
@keyframes fadeout{from{opacity:1}to{opacity:0}}
@keyframes drift{from{transform:scale(1)}to{transform:scale(1.01)}}
.a-up{animation:up .7s cubic-bezier(.2,.8,.2,1) both}
.a-rise{animation:rise .9s cubic-bezier(.2,.8,.2,1) both}
.a-pop{animation:pop .55s cubic-bezier(.2,.8,.2,1) both}
.a-in{animation:fadein .5s ease both}
"""


def wrap(body_html, css, dur, bg="#eef4ff", scale=1.18):
    """Full 1920x1080 page; content authored at 1600x900 and scaled, with a slow drift and a fade-out."""
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{css}{ANIM}
html,body{{margin:0;width:1920px;height:1080px;overflow:hidden;background:{bg}}}
#v{{position:absolute;left:{(1920 - 1600 * scale) / 2:.1f}px;top:{(1080 - 900 * scale) / 2:.1f}px;width:1600px;height:900px;transform-origin:0 0;transform:scale({scale})}}
#d{{position:absolute;inset:0;animation:drift {dur}s linear both}}
#f{{position:absolute;inset:0;animation:fadeout .35s ease both;animation-delay:{dur - 0.35}s}}
</style></head><body><div id="f"><div id="v"><div id="d" style="--bg:{bg}">{body_html}</div></div></div></body></html>"""


def feature(scene_file, sid, tag_cues=None, extra="", tweak=None):
    src = (SC / scene_file).read_text()
    css = re.search(r"<style>(.*)</style>", src, re.S).group(1)
    css = css.replace("html,body{margin:0;width:1600px;height:900px;overflow:hidden}", "")
    body = re.search(r"<body[^>]*>(.*)</body>", src, re.S).group(1).replace("../parts/", P)
    if tweak:
        body = tweak(body)
    cues = [c[0] for c in TL[sid]["cues"]]
    dur = TL[sid]["duration"]
    # copy column
    body = re.sub(r"(<div class=\"eyebrow\")", lambda m: m.group(0).replace('class="eyebrow"', f'class="eyebrow a-up" style="animation-delay:{0.2}s"'), body, 1)
    body = body.replace("<h1>", '<h1 class="a-up" style="animation-delay:.35s">', 1)
    body = body.replace('<p class="sub">', '<p class="sub a-up" style="animation-delay:.55s">', 1)
    li = [0]
    def lis(m):
        li[0] += 1
        # each tick appears with the sentence it belongs to, or staggered after the sub line
        at = 0.75 + 0.15 * li[0]
        return f'<li class="a-up" style="animation-delay:{at:.2f}s">'
    body = re.sub(r"<li>", lis, body)
    # cards
    n = [0]
    def card(m):
        n[0] += 1
        at = 0.45 + 0.35 * (n[0] - 1)
        if n[0] > 1 and len(cues) > 1 and sid in ("checkout", "print"):
            at = cues[1] - 0.2
        return m.group(0).replace('class="card"', f'class="card a-rise" data-at="{at:.2f}"').replace('style="', f'style="animation-delay:{at:.2f}s;', 1)
    body = re.sub(r'<div class="card"[^>]*style="[^"]*"', card, body)
    # tags
    tc = tag_cues or ([cues[1], cues[2] if len(cues) > 2 else cues[1] + 1.2] if len(cues) > 1 else [2, 3])
    k = [0]
    def tag(m):
        at = tc[min(k[0], len(tc) - 1)] + 0.15
        k[0] += 1
        return m.group(0).replace('style="', f'style="animation-delay:{at:.2f}s;', 1).replace('class="tag', 'class="a-pop tag', 1)
    body = re.sub(r'<div class="tag[^"]*" style="[^"]*"', tag, body)
    (VS / f"{sid}.html").write_text(wrap(body + extra, css, dur))


def custom(sid, html, css="", bg="#eef4ff"):
    (VS / f"{sid}.html").write_text(wrap(html, BASE + css, TL[sid]["duration"], bg))


BASE = """*{box-sizing:border-box}body{font-family:Inter,system-ui,sans-serif;color:#0b1b33;-webkit-font-smoothing:antialiased}
.center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
h1{font-family:"Inter Display",Inter,sans-serif;font-weight:800;letter-spacing:-.02em;margin:0}
em{font-style:normal;color:#2c6ecb}
"""

# ── hook ──────────────────────────────────────────────────────────────────────────────────────────
c = [x[0] for x in TL["hook"]["cues"]]
tickets = ""
import random
random.seed(4)
for i in range(14):
    at = 0.9 + i * 0.22 if i < 9 else c[2] + (i - 9) * 0.18
    x = 40 + (i % 3) * 120 + random.randint(-14, 14)
    y = 470 - (i // 3) * 64 + random.randint(-6, 6)
    rot = random.randint(-8, 8)
    tickets += f'<div class="a-pop" style="position:absolute;left:{x}px;top:{y}px;width:150px;padding:12px 14px;border-radius:12px;background:#fff;box-shadow:0 8px 20px rgba(15,35,80,.15);transform:rotate({rot}deg);font-size:15px;font-weight:700;animation-delay:{at:.2f}s"><span style="color:#6b7a90;font-weight:600">Order</span> #{1040 + i}</div>'
hook = f"""
<div style="position:absolute;left:110px;top:0;bottom:0;width:780px;display:flex;flex-direction:column;justify-content:center">
  <div class="a-up" style="animation-delay:.3s;font-size:30px;font-weight:700;color:#1f5fbf;margin-bottom:22px">Bakeries · Florists · Meal prep · Local shops</div>
  <h1 class="a-up" style="font-size:88px;line-height:1.02;animation-delay:{c[2]:.2f}s">Too many orders<br>on <em style="color:#e2492a">one day?</em></h1>
  <div class="a-up" style="animation-delay:{c[2] + 2.2:.2f}s;margin-top:34px;display:inline-flex;align-self:flex-start;background:#fff;border-radius:22px 22px 22px 6px;padding:18px 26px;font-size:30px;font-weight:600;box-shadow:0 10px 30px rgba(15,35,80,.14)">“When will mine arrive?”</div>
</div>
<div style="position:absolute;left:960px;top:150px;width:520px;height:620px">
  <div class="a-rise" style="animation-delay:.5s;position:absolute;left:0;top:0;width:520px;height:620px;background:#fff;border-radius:28px;box-shadow:0 24px 60px rgba(15,35,80,.16)">
    <div style="padding:30px 34px;font-size:30px;font-weight:800">Saturday</div>
    <div style="position:absolute;left:34px;right:34px;bottom:34px;height:18px;border-radius:9px;background:#f1f1f1;overflow:hidden"><div class="a-in" style="position:absolute;inset:0;background:#fea3b4;animation-delay:{c[2]:.2f}s"></div></div>
  </div>
  {tickets}
</div>"""
custom("hook", hook)

# ── intro ─────────────────────────────────────────────────────────────────────────────────────────
c = [x[0] for x in TL["intro"]["cues"]]
logo_small = '<img src="../../logo-1200.png" style="width:260px;height:260px;display:block">'
custom("intro", f"""
<div class="center">
  <div class="a-pop" style="animation-delay:.2s;width:260px;height:260px;border-radius:58px;overflow:hidden;box-shadow:0 30px 70px rgba(23,71,160,.35)">{logo_small}</div>
  <h1 class="a-up" style="animation-delay:.6s;font-size:96px;margin-top:44px">Pickday</h1>
  <div class="a-up" style="animation-delay:{c[1]:.2f}s;font-size:44px;font-weight:600;color:#33445e;margin-top:14px">Let customers <em>pick the day</em>.</div>
</div>""")

# ── features ──────────────────────────────────────────────────────────────────────────────────────
c = [x[0] for x in TL["picker"]["cues"]]
def picker_tweak(body):
    # show the real widget first empty, then with the customer's day and slot chosen
    return body.replace(f'<img class="w" src="{P}w-hero.png" style="width:545px">',
        f'<div style="position:relative"><img class="w" src="{P}w-hero.png" style="width:545px;visibility:hidden">'
        f'<img src="{P}w-empty.png" style="position:absolute;left:0;top:0;width:545px">'
        f'<img class="a-in" src="{P}w-hero.png" style="position:absolute;left:0;top:0;width:545px;background:#fff;animation-delay:{c[1] + 0.6:.2f}s"></div>')
feature("01-hero.html", "picker", tag_cues=[c[2], c[1] + 0.6], tweak=picker_tweak)
c = [x[0] for x in TL["limits"]["cues"]]
feature("02-limits.html", "limits", tag_cues=[c[1], 0.9])
feature("03-checkout.html", "checkout")
c = [x[0] for x in TL["orders"]["cues"]]
change_card = f"""
<div class="card a-rise" style="left:1070px;top:560px;width:470px;animation-delay:{c[2]:.2f}s;padding:24px 26px;font-family:Inter,system-ui,sans-serif">
  <div style="font-size:14px;font-weight:700;color:#6b7a90;letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px">Customer account · Order #1041</div>
  <div style="font-size:20px;font-weight:700;margin-bottom:4px">Local delivery</div>
  <div style="font-size:18px;color:#33445e;margin-bottom:18px">Tue, Nov 10 · 9:00 AM–12:00 PM</div>
  <div style="display:inline-block;background:#2c6ecb;color:#fff;font-weight:700;font-size:17px;padding:12px 18px;border-radius:10px">Change delivery date</div>
</div>"""
feature("04-orders.html", "orders", tag_cues=[c[1]], extra=change_card)
feature("05-print.html", "print")
c = [x[0] for x in TL["world"]["cues"]]
feature("06-worldwide.html", "world", tag_cues=[0.9])

# ── easy ──────────────────────────────────────────────────────────────────────────────────────────
c = [x[0] for x in TL["easy"]["cues"]]
tiles = [("Every Shopify plan", "No Plus features needed"), ("No theme code", "Turn on the app embed"), ("Setup wizard", "Answer a few questions")]
tl = "".join(f'<div class="a-rise" style="animation-delay:{0.5 + i * 0.35 if i < 2 else c[1]:.2f}s;width:400px;background:#fff;border-radius:26px;padding:40px 36px;box-shadow:0 24px 60px rgba(15,35,80,.14);text-align:left"><div style="width:58px;height:58px;border-radius:16px;background:#ff6a3d;margin-bottom:26px;position:relative"><span style="position:absolute;left:19px;top:11px;width:16px;height:28px;border:solid #fff;border-width:0 6px 6px 0;transform:rotate(45deg)"></span></div><div style="font-size:34px;font-weight:800;margin-bottom:10px">{a}</div><div style="font-size:22px;color:#33445e">{b}</div></div>' for i, (a, b) in enumerate(tiles))
custom("easy", f"""<div class="center"><h1 class="a-up" style="animation-delay:.2s;font-size:72px;margin-bottom:60px">Set up in <em>minutes</em></h1>
<div style="display:flex;gap:40px">{tl}</div></div>""")

# ── cta ───────────────────────────────────────────────────────────────────────────────────────────
c = [x[0] for x in TL["cta"]["cues"]]
logo_mid = '<img src="../../logo-1200.png" style="width:200px;height:200px;display:block">'
custom("cta", f"""
<div class="center" style="color:#fff">
  <div class="a-pop" style="animation-delay:.2s;width:200px;height:200px;border-radius:46px;overflow:hidden;box-shadow:0 30px 70px rgba(0,0,0,.35)">{logo_mid}</div>
  <h1 class="a-up" style="animation-delay:.45s;font-size:100px;margin-top:40px;color:#fff">Pickday</h1>
  <div class="a-up" style="animation-delay:{c[1]:.2f}s;font-size:46px;font-weight:600;margin-top:10px;color:#dce8ff">Let customers <span style="color:#ffb59c">pick the day</span>.</div>
  <div class="a-up" style="animation-delay:{c[2]:.2f}s;margin-top:54px;display:inline-flex;align-items:center;gap:16px;background:#fff;color:#0b1b33;border-radius:999px;padding:18px 34px;font-size:30px;font-weight:700">
    <svg width="30" height="30" viewBox="0 0 24 24"><circle cx="10" cy="10" r="7" fill="none" stroke="#0b1b33" stroke-width="2.6"/><path d="M15.5 15.5L21 21" stroke="#0b1b33" stroke-width="2.6" stroke-linecap="round"/></svg>
    Search “Pickday” in the App Store</div>
</div>""", bg="#123f8f")
print("video scenes:", sorted(p.name for p in VS.glob("*.html")))
