"""Real admin and checkout UI for the listing images, rendered as transparent PNG clippings.
python3 src/listing-parts.py (from marketing/promo) -> build/lparts/*.html, then listing.cjs shoots them.

The markup and CSS are the admin's own (copied once in marketing/src/scenes.py); here the sample
data follows the video's story: Juniper Street Bakery, Saturday 14 November 2026."""
import pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT.parent / "src"))
sys.dont_write_bytecode = True
import scenes as S  # noqa: E402  (also rewrites marketing/out/scenes, harmless)

OUT = ROOT / "build" / "lparts"; OUT.mkdir(parents=True, exist_ok=True)
CSS = S.CSS.replace("html,body{margin:0;width:1600px;height:900px;overflow:hidden}", "html,body{margin:0;background:transparent}")


def part(name, width, inner, pad=0, bg="#fff"):
    (OUT / f"{name}.html").write_text(f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}
body{{background:transparent}} #fig{{width:{width}px;background:{bg};padding:{pad}px}}</style></head>
<body><div id="fig">{inner}</div></body></html>""")


# capacity settings: 20 a day, slots 8 / 6 / 6 (the numbers the video uses)
cap = S.cap_admin
for a, b in [("<td style=\"text-align:right\">8</td></tr>\n      <tr><td>12:00 PM", "<td style=\"text-align:right\">8</td></tr>\n      <tr><td>12:00 PM"),
             ("12:00 PM–3:00 PM</td><td style=\"text-align:right\">8", "12:00 PM–3:00 PM</td><td style=\"text-align:right\">6"),
             ("3:00 PM–6:00 PM</td><td style=\"text-align:right\">8", "3:00 PM–6:00 PM</td><td style=\"text-align:right\">6")]:
    cap = cap.replace(a, b)
part("capacity", 400, cap, bg="#f1f1f1")

# checkout: the method the customer picked, and the block when the date is missing
picked = S.opt("Local delivery – Sat, Nov 14", "12:00 PM–3:00 PM · 220 Elm Ave, Brooklyn", True)
part("co-delivery", 640, S.co_card("Delivery", f'<div style="font-size:16px;color:#6b7a90;margin-bottom:10px">Shipping method</div>{picked}'))
part("co-payment", 640, S.co_card("Payment", S.block_inner))

part("orders", 860, S.orders_admin, bg="#f1f1f1")
part("holidays", 420, S.days_admin, bg="#f1f1f1")

email = S.email.replace("Tuesday, November 10", "Saturday, November 14")
part("email", 440, email)
print("listing parts ->", OUT)
