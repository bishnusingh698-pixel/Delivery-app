# Build checklist

Updated after every phase. "Needs a live store" means the step can only be checked on a Shopify development store with the app installed (see README → "What I need from you").

## Phase status

| Phase | Status | What works |
|---|---|---|
| P1 Skeleton | ✅ Done | App template, Postgres schema + migration, install hook (shop row, default settings, publish), uninstall + privacy webhooks, `/healthz`, navigation with every page, admin i18n framework, Render blueprint. |
| P2 Engine + schedule settings | ✅ Done | Date engine + 30 automated tests; Settings hub; Methods & countries, Schedule (with live preview), Slots & capacity, Closures & holidays pages. |
| P3 Storefront widget | ✅ Done | Theme app extension (app embed, cart block, product block); widget for cart page, cart drawer and product page; 28 languages; checkout button gate; browser tests for long text and right-to-left. 20 KB gzipped. |
| P4 Functions, webhooks, extensions | ✅ Done | Validation Function (backstop) and delivery customization Function (checkout matching); orders webhook (idempotent, out-of-order safe, counts, tags, order metafield); billing webhook; Flow triggers; thank-you and order status block with calendar links; order page block, "Change delivery date" order action and draft order action. |
| P5 Orders, production, notifications, jobs | ⏳ | |
| P6 Locations, areas, product rules, surcharges | ⏳ | |
| P7 Billing, import/export, help, polish | ⏳ | |

## How to test P1 (needs a live store)

1. Deploy (README → Render) and install the app on a development store.
2. The app opens on **Home**. The left menu shows Home, Orders, Production, Settings, Widget & text, Notifications & integrations, Plans, Help.
3. Click each menu item: every page opens with a title and a one-line subtitle.
4. Open `https://<your-render-url>/healthz` in a browser: it shows `ok` instantly.
5. In Neon's SQL editor run `select shop, "timeZone", plan from "Shop";` — your store is listed with its time zone.

## How to test P2 (needs a live store)

1. In the app click **Settings**. You see cards for every settings area; Pro-only ones show a lock badge on lower plans.
2. Click **Methods & countries**. Turn on **Store pickup**, change its name, click **Save** in the bar at the top. Reload: the change is kept.
3. Click **Schedule**. Set the cutoff to 14:00 and lead time to 1 working day. The preview on the right says "Right now it's … Earliest available …". Use **Simulate time** to pick 15:00: the earliest date moves one working day later.
4. Click **Slots & capacity**. Click **Generate slots**, choose 09:00–17:00 every 2 hours, click **Add**. Four slots appear. Set a max of 5 on one.
5. Click **Closures & holidays**. Click **Import holidays**, tick two, click **Import**. They appear in the list and in the year calendar.

## How to test P3 (needs a live store)

1. In Shopify admin go to **Online Store > Themes > Customize**. Click the **App embeds** icon, turn on **Pickday date picker**, click **Save**.
2. Open your store, add a product to the cart, open the cart drawer. The date picker appears above the checkout button.
3. Click **Check out** without picking a date (with "date required" on). The page doesn't leave the cart and a red message asks for a date.
4. Pick a date and a time slot. A green summary appears: "Delivery on Fri, 18 Oct, 10:00–12:00", with **Change**.
5. Go to the cart page. The same choice is shown. Click **Check out**: it continues.
6. Change your storefront language (or add `/fr` to the URL if French is published): the widget is in French, dates in French format.
7. Optional: in the theme editor add the **Pickday date picker** block to the cart page or the **Pickday delivery estimate** block to the product page.

## How to test P4 (needs a live store)

1. In Shopify admin go to **Settings > Checkout > Checkout rules** (or **Customizations**). "Pickday date check" is listed and active. Under **Shipping and delivery > Delivery customizations**, "Pickday checkout matching" is active.
2. On the storefront add a product, choose **Store pickup** and a date in the cart, then click **Check out**. At the delivery step only the pickup option is shown, named like "Main Street – Fri, 18 Oct".
3. Go back to the cart, clear the date (click **Change**, then remove it via a different method), and use the browser address bar to go straight to `/checkout`. Checkout shows "Please choose a delivery or pickup date in your cart before checking out." and won't let you pay.
4. Place an order with a date. On the thank-you page a "Your delivery schedule" box shows the date and **Google Calendar** / **Apple or Outlook (.ics)** links. Click each: the event has the right date and time.
5. Open the order in Shopify admin. The **Delivery date** block shows the date. The order has tags like `Pickday`, `Pickup`, `2026-10-18`.
6. Click **More actions > Pickday** (or **Change date** in the block). Pick another date and click **Save**. The block, the tags and the order's additional details show the new date.
7. Try to move it to a full day: the date isn't offered. Tick **Override**: it is, and saving works.
8. Create a draft order, click **More actions > Pickday**, choose a date and save. Complete the draft: the new order has the date.

## Automated checks (run `npm test`)

- Date engine: lead time, per-weekday cutoffs, working-day counting, closures, special open days, vacation, booking window, launch date, product restrictions, extra lead time, daily limits, capacity by orders and by items, slot limits, per-date overrides, admin overrides, multiple time zones, DST, leap years, country rules, postcode ranges, zones, surcharges.
- Storefront translations (27 languages): keys, placeholders, plural forms for 0–1000, no English left over, length limits.
- Admin translations: every key used by the code exists in English.
- Checkout Functions: valid choice passes, adding to cart never blocked, missing/closed/full/past-cutoff dates blocked in the shopper's language, wrong country, minimum order, date per item, gift cards, no config; checkout matching hides/renames correctly and never hides everything.
- Orders (with Postgres): new order counted, duplicate and older webhooks ignored, date change moves the count, cancel frees capacity, over-limit orders recorded but flagged; admin reschedule refuses full days unless overridden, keeps other order attributes, updates tags and history.
- Calendar links and .ics files.

## Browser checks (run `npm run test:browser`)

- Built widget in headless Chromium at 320px: renders, checkout blocked without a date, picking a date and slot saves cart attributes, arrow keys move between days, no overflow with pseudo-localised text or in any of the 28 languages, Arabic and Hebrew mirrored (screenshots in `tests/browser/screenshots/`).
