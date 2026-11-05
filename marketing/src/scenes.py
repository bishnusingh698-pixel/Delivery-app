"""Builds the six 1600x900 App Store listing images as HTML (rendered by shot.cjs).

Every UI in these images is either the real storefront widget / real print sheet
(captured by widget-shots.ts and print-shots.ts into out/parts) or a faithful copy of
the admin page markup and CSS (orders calendar, capacity, days off).
Run from marketing/: python3 src/scenes.py
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "out" / "scenes"
OUT.mkdir(parents=True, exist_ok=True)
P = "../parts/"

CSS = """
*{box-sizing:border-box}
html,body{margin:0;width:1600px;height:900px;overflow:hidden}
body{font-family:Inter,system-ui,sans-serif;color:#0b1b33;background:var(--bg,#eef4ff);position:relative;-webkit-font-smoothing:antialiased}
.copy{position:absolute;left:96px;top:0;bottom:0;width:560px;display:flex;flex-direction:column;justify-content:center}
.eyebrow{display:inline-flex;align-items:center;gap:10px;font-weight:700;font-size:20px;letter-spacing:.02em;color:#1f5fbf;margin-bottom:22px}
.eyebrow i{display:inline-block;width:34px;height:34px;border-radius:10px;background:#2c6ecb;position:relative}
.eyebrow i:after{content:"";position:absolute;left:11px;top:7px;width:8px;height:14px;border:solid #fff;border-width:0 4px 4px 0;transform:rotate(45deg)}
h1{font-family:"Inter Display",Inter,sans-serif;font-weight:800;font-size:68px;line-height:1.04;letter-spacing:-.02em;margin:0 0 24px}
h1 em{font-style:normal;color:#2c6ecb}
.sub{font-size:25px;line-height:1.42;color:#33445e;margin:0 0 30px;max-width:520px}
ul.ticks{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:14px}
ul.ticks li{font-size:21px;font-weight:600;color:#1b2b44;display:flex;align-items:center;gap:14px}
ul.ticks li:before{content:"";flex:none;width:26px;height:26px;border-radius:50%;background:#ff6a3d url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M6 12.5l4 4 8-9' fill='none' stroke='%23fff' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/18px no-repeat}
.stage{position:absolute;left:700px;right:0;top:0;bottom:0}
.card{position:absolute;background:#fff;border-radius:20px;box-shadow:0 2px 6px rgba(15,35,80,.06),0 24px 60px rgba(15,35,80,.16);overflow:hidden}
.card .cap{font-size:15px;font-weight:700;color:#5b6b84;letter-spacing:.06em;text-transform:uppercase;margin-bottom:12px}
.tag{position:absolute;background:#0b1b33;color:#fff;font-weight:700;font-size:18px;padding:10px 16px;border-radius:999px;box-shadow:0 10px 24px rgba(11,27,51,.25);white-space:nowrap}
.tag.o{background:#ff6a3d}
.tag.b{background:#2c6ecb}
img.w{display:block}
/* Polaris-like admin */
.adm{font-family:Inter,system-ui,sans-serif;font-size:13px;color:#303030;background:#f1f1f1}
.adm h3{font-size:14px;font-weight:650;margin:0 0 4px}
.adm .muted{color:#616161}
.adm .box{background:#fff;border-radius:12px;box-shadow:0 1px 0 rgba(26,26,26,.07),0 0 0 1px rgba(26,26,26,.06);padding:16px}
.nav{display:flex;gap:4px;padding:10px 14px;background:#fff;border-bottom:1px solid #e3e3e3}
.nav span{font-size:13px;font-weight:550;padding:6px 10px;border-radius:8px;color:#4a4a4a;display:flex;gap:6px;align-items:center}
.nav span.on{background:#ebebeb;color:#1a1a1a}
.nav b{display:inline-block;width:14px;height:14px;border-radius:4px;background:#8a8a8a;opacity:.55}
.nav span.on b{background:#2c6ecb;opacity:1}
.btn{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:6px 12px;border-radius:8px;background:#fff;box-shadow:0 0 0 1px #d4d4d4 inset,0 -1px 0 #b5b5b5 inset}
.btn.p{background:#303030;color:#fff;box-shadow:none}
.pdc-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;margin-top:8px}
.pdc-wd{font-size:12px;color:#616161;text-align:center;padding:4px 0}
.pdc-day{display:flex;flex-direction:column;align-items:stretch;gap:2px;min-height:84px;padding:6px;border:1px solid #e3e3e3;border-radius:8px;background:#fff;font-size:12px;text-align:start;min-width:0;overflow:hidden}
.pdc-day.today{border-color:#303030;border-width:2px}
.pdc-num{font-weight:600;font-size:13px}
.pdc-line{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pdc-bar{position:relative;display:block;height:16px;border-radius:4px;background:#f1f1f1;margin-top:auto;overflow:hidden}
.pdc-bar span{position:absolute;top:0;bottom:0;left:0;background:#91d0ff}
.pdc-bar.busy span{background:#ffd79d}.pdc-bar.full span{background:#fea3b4}
.pdc-bar em{position:relative;font-style:normal;font-size:11px;padding-left:4px}
.pdc-empty{}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.field{border:1px solid #8a8a8a;border-radius:8px;padding:6px 10px;font-size:13px;background:#fff;min-width:64px}
.toggle{width:32px;height:18px;border-radius:9px;background:#303030;position:relative;flex:none}
.toggle:after{content:"";position:absolute;right:2px;top:2px;width:14px;height:14px;border-radius:50%;background:#fff}
.cb{width:16px;height:16px;border-radius:4px;background:#303030;flex:none;position:relative}
.cb:after{content:"";position:absolute;left:5px;top:2px;width:4px;height:8px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}
.cb.off{background:#fff;border:1px solid #8a8a8a}.cb.off:after{display:none}
table.t{width:100%;border-collapse:collapse;font-size:13px}
table.t th{font-weight:600;color:#616161;text-align:left;padding:7px 8px;border-bottom:1px solid #e3e3e3;background:#f7f7f7}
table.t td{padding:8px;border-bottom:1px solid #ebebeb}
"""

def page(name, body, bg="#eef4ff"):
    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><style>{CSS}</style></head>
<body style="--bg:{bg}">{body}</body></html>"""
    (OUT / f"{name}.html").write_text(html)


def copy(eyebrow, h1, sub, ticks):
    lis = "".join(f"<li>{t}</li>" for t in ticks)
    return f"""<div class="copy"><div class="eyebrow"><i></i>{eyebrow}</div><h1>{h1}</h1><p class="sub">{sub}</p><ul class="ticks">{lis}</ul></div>"""


# 1 ─ Hero: the real picker in a cart -------------------------------------------------------
cart_rows = """
<div style="padding:24px 30px 14px;display:flex;align-items:center;gap:14px;border-bottom:1px solid #edf0f5">
  <div style="font-size:24px;font-weight:800">Your cart</div>
  <div style="display:flex;margin-left:6px"><span style="width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#f3d7a6,#d9a35b);border:2px solid #fff"></span><span style="width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#ffd1dc,#f28aa5);border:2px solid #fff;margin-left:-10px"></span></div>
  <div style="font-size:16px;color:#6b7a90">Sourdough loaf, Birthday cake</div>
</div>"""
page("01-hero", copy(
    "Delivery date picker",
    "Let customers <em>pick the day</em>",
    "A date and time-slot picker for local delivery, store pickup and shipping, right in your cart.",
    ["Works in the cart, cart drawer and product page", "Time slots and delivery instructions", "No theme code to edit"],
) + f"""
<div class="stage">
  <div class="card" style="left:120px;top:38px;width:605px;padding-bottom:26px">
    {cart_rows}
    <div style="padding:10px 30px 0"><img class="w" src="{P}w-hero.png" style="width:545px"></div>
    <div style="margin:10px 30px 0;background:#0b1b33;color:#fff;text-align:center;font-weight:700;font-size:18px;padding:15px;border-radius:12px">Check out</div>
  </div>
  <div class="tag o" style="left:600px;top:640px">Customer picks a time slot</div>
  <div class="tag b" style="left:600px;top:330px">Only open days can be picked</div>
</div>""")

# 2 ─ Limits ------------------------------------------------------------------------------------
cap_admin = """
<div class="adm" style="padding:14px">
  <div class="box">
    <h3>Time slots &amp; capacity</h3>
    <div class="muted" style="margin-bottom:14px">Offer time slots and limit how many orders you take per day or slot.</div>
    <div class="row" style="margin-bottom:12px"><span>Max per day</span><span class="field">20</span></div>
    <table class="t"><tr><th>Time slots</th><th style="text-align:right">Max per slot</th></tr>
      <tr><td>9:00 AM–12:00 PM</td><td style="text-align:right">8</td></tr>
      <tr><td>12:00 PM–3:00 PM</td><td style="text-align:right">8</td></tr>
      <tr><td>3:00 PM–6:00 PM</td><td style="text-align:right">8</td></tr></table>
    <div style="margin-top:14px;display:flex;gap:8px;align-items:center"><span class="cb"></span>Show how many spots are left</div>
    <div class="row" style="margin-top:8px;padding-left:24px"><span class="muted">Show when fewer than</span><span class="field" style="min-width:0;padding:3px 10px">4</span></div>
    <div class="row" style="margin-top:12px"><span>Date overrides</span><span class="btn">Add date override</span></div>
    <div class="muted" style="margin-top:12px;font-size:12px">Cancelled orders free their spot.</div>
  </div>
</div>"""
page("02-limits", copy(
    "Daily and per-slot limits",
    "Full days <em>close by themselves</em>",
    "Set how many orders you can handle per day or time slot. When a slot fills up, customers simply can't pick it.",
    ["Limits per day, weekday or slot", "Busy-day overrides", "Cut-off times and preparation time"],
) + f"""
<div class="stage">
  <div class="card" style="left:-10px;top:330px;width:380px">{cap_admin}</div>
  <div class="card" style="left:390px;top:200px;width:500px;padding:16px 15px 10px"><img class="w" src="{P}w-limits.png" style="width:470px"></div>
  <div class="tag o" style="left:560px;top:150px">Full slots can't be picked</div>
  <div class="tag" style="left:30px;top:276px">You set the limits</div>
</div>""")

# 3 ─ Checkout matching -------------------------------------------------------------------------
def co_card(title, inner):
    return f"""<div style="font-family:Inter,system-ui,sans-serif;padding:28px 32px 30px;background:#fff">
      <div style="font-size:24px;font-weight:700;margin-bottom:18px">{title}</div>{inner}</div>"""

opt = lambda label, sub, on: f"""<div style="display:flex;gap:16px;align-items:center;border:{'2px solid #2c6ecb' if on else '1px solid #d9dee6'};background:{'#f2f7ff' if on else '#fff'};border-radius:12px;padding:18px 20px">
  <span style="width:22px;height:22px;border-radius:50%;border:{'7px solid #2c6ecb' if on else '2px solid #b6bfcc'};flex:none"></span>
  <span><span style="font-weight:700;font-size:19px;display:block">{label}</span><span style="color:#6b7a90;font-size:16px">{sub}</span></span></div>"""

match_inner = f"""
<div style="font-size:16px;color:#6b7a90;margin-bottom:10px">Shipping method</div>
{opt("Store pickup – Tue, Nov 10", "Juniper Street Bakery, 14 Juniper St", True)}
"""
block_inner = """
<div style="border:1px solid #f1b8b4;background:#fdf1f0;border-radius:12px;padding:18px 20px;display:flex;gap:14px">
  <span style="flex:none;width:26px;height:26px;border-radius:50%;background:#c4321f;color:#fff;font-weight:800;font-size:16px;display:flex;align-items:center;justify-content:center">!</span>
  <span style="font-size:18px;line-height:1.45;color:#5a1a12">Please choose a delivery or pickup date in your cart before checking out.</span>
</div>"""
page("03-checkout", copy(
    "Checkout matching",
    "Checkout follows the <em>customer's choice</em>",
    "Checkout shows only the delivery method the customer picked, with their date, and stops orders without a valid date.",
    ["Picked pickup? Only pickup shows", "Missing or full date? The order stops", "The date shows on the thank-you page"],
) + f"""
<div class="stage">
  <div style="position:absolute;left:60px;top:96px;font-size:18px;font-weight:700;color:#1f5fbf">The customer picked store pickup on Tue, Nov 10</div>
  <div class="card" style="left:60px;top:136px;width:640px">{co_card("Delivery", match_inner)}</div>
  <div style="position:absolute;left:180px;top:476px;font-size:18px;font-weight:700;color:#1f5fbf">Another customer skipped the date</div>
  <div class="card" style="left:180px;top:516px;width:640px">{co_card("Payment", block_inner)}</div>
  <div class="tag b" style="left:560px;top:116px">Only the chosen method</div>
  <div class="tag o" style="left:600px;top:760px">No valid date, no order</div>
</div>""")

# 4 ─ Orders calendar ---------------------------------------------------------------------------
import datetime as dt
month = dt.date(2026, 11, 1)
lead = (month.weekday() + 1) % 7  # Sunday first
data = {6: (5, 3, 0, 8), 7: (9, 6, 0, 15), 9: (6, 4, 0, 10), 10: (11, 7, 0, 18), 11: (8, 5, 0, 13), 12: (10, 6, 0, 16),
        13: (12, 8, 0, 20), 14: (13, 7, 0, 20), 16: (4, 3, 0, 7), 17: (6, 2, 0, 8), 18: (7, 4, 0, 11), 19: (5, 3, 1, 9),
        20: (9, 6, 0, 15), 21: (11, 6, 0, 17), 23: (8, 4, 0, 12), 24: (14, 6, 0, 20), 25: (12, 8, 0, 20), 26: (2, 0, 0, 2),
        27: (6, 3, 2, 11), 28: (9, 6, 0, 15), 30: (3, 2, 0, 5)}
cells = "".join(f'<div class="pdc-wd">{w}</div>' for w in ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])
cells += '<div class="pdc-empty"></div>' * lead
for d in range(1, 31):
    v = data.get(d)
    inner = f'<span class="pdc-num">{d}</span>'
    if v:
        dlv, pk, sh, used = v
        if dlv: inner += f'<span class="pdc-line">Local delivery: <strong>{dlv}</strong></span>'
        if pk: inner += f'<span class="pdc-line">Store pickup: <strong>{pk}</strong></span>'
        if sh: inner += f'<span class="pdc-line">Shipping: <strong>{sh}</strong></span>'
        pct = min(100, round(used / 20 * 100))
        tone = "full" if pct >= 100 else "busy" if pct >= 80 else "ok"
        inner += f'<span class="pdc-bar {tone}"><span style="width:{pct}%"></span><em>{used} / 20</em></span>'
    cells += f'<div class="pdc-day{" today" if d == 5 else ""}">{inner}</div>'
nav = '<div class="nav">' + "".join(f'<span class="{"on" if n == "Orders" else ""}"><b></b>{n}</span>' for n in ["Home", "Orders", "Delivery", "Pickup", "Days off", "Appearance", "Settings", "Help"]) + "</div>"
orders_admin = f"""<div class="adm">{nav}
<div style="padding:16px 18px">
  <div class="row" style="margin-bottom:12px"><div><div style="font-size:20px;font-weight:700">Orders</div><div class="muted">Every order with a delivery, pickup or dispatch date.</div></div>
  <div style="display:flex;gap:6px"><span class="btn">List</span><span class="btn p">Calendar</span><span class="btn">Export CSV</span></div></div>
  <div class="box" style="padding:12px 14px">
    <div class="row"><span style="font-size:18px">‹</span><span style="font-weight:650;font-size:15px">November 2026</span><span style="font-size:18px">›</span></div>
    <div class="pdc-grid">{cells}</div>
  </div>
</div></div>"""
page("04-orders", copy(
    "Orders by day",
    "See every order <em>by day</em>",
    "A calendar of what's due each day, with how full each day is. Filter, export, and move orders to another date.",
    ["Calendar and list views", "Change dates from the order page", "Move many orders at once"],
) + f"""
<div class="stage">
  <div class="card" style="left:30px;top:70px;width:850px">{orders_admin}</div>
  <div class="tag o" style="left:560px;top:30px">Busy and full days stand out</div>
</div>""")

# 5 ─ Print + daily summary ---------------------------------------------------------------------
email = """<div style="font-family:Inter,system-ui,sans-serif;background:#fff">
  <div style="padding:18px 22px;border-bottom:1px solid #edf0f5;display:flex;gap:12px;align-items:center">
    <span style="width:40px;height:40px;border-radius:50%;background:#2c6ecb;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center">P</span>
    <span><b style="font-size:17px">Tomorrow's schedule</b><br><span style="color:#6b7a90;font-size:14px">To: kitchen and drivers · every day at 6:00 PM</span></span></div>
  <div style="padding:16px 22px 20px;font-size:15px;line-height:1.7;color:#1b2b44">
    <div style="font-weight:700;font-size:16px;margin-bottom:4px">Tuesday, November 10</div>
    <div>#1041 · Maya · Local delivery · 9:00–12:00</div>
    <div>#1044 · Daniel · Local delivery · 9:00–12:00</div>
    <div>#1047 · Priya · Local delivery · 12:00–15:00</div>
    <div>#1038 · Leo · Store pickup · 8:00–11:00</div>
    <div>#1049 · Hana · Store pickup · 11:00–14:00</div>
  </div></div>"""
page("05-print", copy(
    "Day sheets and daily email",
    "Start every day <em>ready to go</em>",
    "Print day sheets, route sheets and production lists, and get tomorrow's orders by email every day, free.",
    ["Day sheet grouped by method and slot", "Production list of what to make", "Daily summary email to your team"],
) + f"""
<div class="stage">
  <div class="card" style="left:20px;top:50px;width:700px;height:600px"><iframe src="{P}day-sheet.html" style="border:0;width:900px;height:772px;transform:scale(.7778);transform-origin:0 0"></iframe></div>
  <div class="card" style="left:450px;top:500px;width:430px">{email}</div>
  <div class="tag b" style="left:40px;top:680px">Print with one click</div>
  <div class="tag o" style="left:620px;top:460px">Daily summary email</div>
</div>""")

# 6 ─ Worldwide: holidays + languages -----------------------------------------------------------
hol = [("Armistice 1918", "Wed, Nov 11", True), ("Noël", "Fri, Dec 25", True), ("Jour de l'an", "Fri, Jan 1", True), ("Lundi de Pâques", "Mon, Apr 5", False)]
hol_rows = "".join(f'<div class="row" style="padding:8px 0;border-top:1px solid #ebebeb;font-size:14px"><span style="display:flex;gap:10px;align-items:center"><span class="cb{"" if on else " off"}"></span>{n}</span><span class="muted">{d}</span></div>' for n, d, on in hol)
days_admin = f"""<div class="adm" style="padding:14px"><div class="box">
  <h3 style="font-size:16px">Public holidays in France</h3>
  <div class="row" style="margin:10px 0 8px;font-size:14px"><span style="display:flex;gap:10px;align-items:center"><span class="toggle"></span>Close on public holidays in France</span></div>
  <div class="muted" style="margin-bottom:6px;font-size:12px">Ticked = closed. Untick to stay open that day (in every year).</div>
  {hol_rows}
  <div class="row" style="margin-top:12px;gap:8px;justify-content:flex-start"><span class="btn">Vacation</span><span class="btn">Closed days</span><span class="btn">Special opening days</span></div>
</div></div>"""
langs = ["English", "Français", "Deutsch", "Español", "Italiano", "Português", "Nederlands", "日本語", "한국어", "中文", "العربية", "עברית", "Polski", "Türkçe", "Svenska", "हिन्दी"]
pills = "".join(f'<span style="display:inline-block;background:#fff;border:1px solid #d6e2f5;border-radius:999px;padding:8px 14px;font-size:16px;font-weight:600;color:#1b2b44;margin:0 8px 8px 0">{l}</span>' for l in langs)
page("06-worldwide", copy(
    "Holidays and languages",
    "Your days off, <em>their language</em>",
    "Public holidays come back every year on their own. The picker speaks your customers' language, right-to-left included.",
    ["Public holidays, closed days and vacation", "Local working days and date formats", "Admin and storefront translated"],
) + f"""
<div class="stage">
  <div class="card" style="left:390px;top:60px;width:490px;padding:20px 22px 14px"><img class="w" src="{P}w-fr.png" style="width:446px"></div>
  <div class="card" style="left:0px;top:200px;width:420px">{days_admin}</div>
  <div style="position:absolute;left:0;top:660px;width:880px">{pills}</div>
  <div class="tag o" style="left:30px;top:150px">Closed on Armistice Day</div>
</div>""")
print("scenes written to", OUT)
