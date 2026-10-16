# Build checklist

Updated after every phase. "Needs a live store" means the step can only be checked on a Shopify development store with the app installed (see README → "What I need from you").

## Phase status

| Phase | Status | What works |
|---|---|---|
| P1 Skeleton | ✅ Done | App template, Postgres schema + migration, install hook (shop row, default settings, publish), uninstall + privacy webhooks, `/healthz`, navigation with every page, admin i18n framework, Render blueprint. |
| P2 Engine + schedule settings | ✅ Done | Date engine + 30 automated tests; Settings hub; Methods & countries, Schedule (with live preview), Slots & capacity, Closures & holidays pages. |
| P3 Storefront widget | ✅ Done | Theme app extension (app embed, cart block, product block); widget for cart page, cart drawer and product page; 28 languages; checkout button gate; browser tests for long text and right-to-left. 20 KB gzipped. |
| P4 Functions, webhooks, extensions | ✅ Done | Validation Function (backstop) and delivery customization Function (checkout matching); orders webhook (idempotent, out-of-order safe, counts, tags, order metafield); billing webhook; Flow triggers; thank-you and order status block with calendar links; order page block, "Change delivery date" order action and draft order action. |
| P5 Orders, production, notifications, jobs | ✅ Done | Orders page (list with filters and search, month calendar with counts and capacity bars, order detail with change history and "Change date", bulk move with capacity preview, CSV export, day sheet and route sheet printing); Production list (print, CSV, per-slot split, prep-day offset); Notifications page (daily summary email, 5 copy-paste snippets with steps, secret calendar feed, Flow toggle); hourly and daily jobs (republish, digest, pruning, app embed check). |
| P6 Locations, areas, product rules, surcharges | ✅ Done | Pickup locations (import from Shopify, own hours and limits, instructions per language); delivery areas by postcode, named area or region, zones with their own days and limits, "Test an address"; product rules (no date needed, extra preparation time, available days, daily limits per product, method-only) with Shopify product and collection pickers; surcharges with an automatically managed hidden fee product. |
| P7 Billing, import/export, help, polish | ✅ Done | Plans page with Shopify billing (14-day trials, test mode, downgrade), usage bar and catch-up tagging after upgrade; Home (welcome questions with presets, 6-step checklist with app embed detection, overview, alerts, first-order celebration, quick actions); Help (5-step guide, 17 questions with search, diagnostics, debug mode, support email); Import/Export (file or one-time share code, product remapping by handle, recent changes); Widget & text (live preview, per-language text editor); admin in 8 languages; README, PRIVACY, ROADMAP, App Store listing draft. |

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
5. Open the order in Shopify admin. The **Delivery date** block shows the date. The order has tags like `Pickday`, `Method: Store pickup`, `Date: 2026-10-18`, `Slot: 10:00-12:00`.
6. Click **More actions > Pickday** (or **Change date** in the block). Pick another date and click **Save**. The block, the tags and the order's additional details show the new date.
7. Try to move it to a full day: the date isn't offered. Tick **Override**: it is, and saving works.
8. Create a draft order, click **More actions > Pickday**, choose a date and save. Complete the draft: the new order has the date.

## How to test P5 (needs a live store)

1. Place 3 test orders with dates (two for tomorrow, one next week). Open **Pickday > Orders**. All 3 are listed, soonest first.
2. Click **Tomorrow**: only the two orders for tomorrow are shown. Type the order number of one into the search box: only that order is shown. Clear it.
3. Click **Calendar**. Tomorrow shows "2" under the method name and, if you set a daily limit, a bar like "2 / 20". Click that day: the list opens filtered to it.
4. Tick both orders for tomorrow and click **Print day sheet**. A print window opens with the orders grouped by method and time slot, with items, notes and (for local delivery) the address.
5. With local delivery orders, click **Print route sheet** (Pro): orders are sorted by zone, then postcode, with address and phone.
6. Click **Export CSV** and open the file in Excel or Google Sheets: accents show correctly, one row per order.
7. Tick one order, click **Move to another date**, pick a date. The box shows how full that date is before and after. Click **Move**. The order now shows the new date, here and in Shopify admin (tags and additional details).
8. Click an order number. The detail page shows the schedule, items and change history (the move from step 7). Click **Change date**, tick **Ignore limits for this change**: closed and full days can be picked. Save.
9. Open **Pickday > Production**. Tomorrow's products are listed with total quantity and number of orders. Click **Print** and **Export CSV**.
10. Open **Pickday > Notifications**. Turn on **Send a daily summary**, choose a time one hour from now and add your email. Click **Save**. After that hour (cron-job.org must be set up), the email arrives with tomorrow's orders. It is sent at most once a day.
11. Click **Copy** on **Order confirmation email**, click **Where to paste this** and follow the 3 steps. Place a new order: the confirmation email shows "Delivery details" with the date. Click **I've added it**.
12. Click **Create calendar address**, copy it, and add it in Google Calendar (**Other calendars > + > From URL**). Your orders appear (Google refreshes every few hours). Click **Make a new address**: the old one stops working.
13. In Shopify Flow, create a workflow with the trigger **Schedule created**. Place an order: the workflow runs.

## How to test P6 (needs a live store)

1. **Pickup locations:** open **Settings > Pickup locations**, click **Import from Shopify**, add your location. Turn on **Own schedule and limits**, close it on Mondays, click **Save**. On the storefront choose Store pickup: Mondays are not offered for that location.
2. **Delivery areas** (Pro): open **Settings > Delivery areas**, add your country, choose **Postcodes**, enter one postcode, save. In **Test an address**, type that postcode: "Delivered: Yes"; another postcode: "No". On the storefront choose Local delivery and type a postcode outside the list: the picker says you don't deliver there.
3. **Zones:** add a zone "North" with your postcode and **Different days**: Tuesday only. On the storefront, that postcode only offers Tuesdays. Place an order; on **Orders > Print route sheet** it is listed under North.
4. **Product rules** (Pro): under **Products that don't need a date**, pick a product. A cart with only that product shows no picker and checkout isn't blocked. Under **Needs extra preparation time**, pick another product with 2 days: with it in the cart the first date moves 2 days later.
5. **Available days:** add a rule "Only on Saturdays" for a product: with it in the cart only Saturdays can be picked.
6. **Surcharges** (Pro): add "Saturday delivery", weekday Saturday, 5.00, save. In Shopify **Products**, a "Delivery fee" product exists (tag `pickday-hidden`). On the storefront pick a Saturday: a "Delivery fee" line with "Fee: Saturday delivery" appears in the cart; pick a Friday: it goes away. Check out: the fee is charged.

## How to test P7 (needs a live store)

1. Install on a fresh development store. Home shows **Welcome to Pickday**: choose "Bakery or cakes" and your country, click **Set it up for me**. The checklist appears with step 1 open.
2. Click **Open theme editor**: the theme editor opens with the Pickday embed selected. Switch it on, click **Save**, come back and click **Check again**: step 1 turns green.
3. **Plans**: on a development store everything is free (a blue banner says so). On a real store, click **Upgrade to Starter**: Shopify's approval page shows $7.99 with a 14-day trial.
4. **Help**: search "drawer": one question is shown. Click **Fix and resend settings**: a green banner confirms. Click **Turn on for 24 hours** under Debug mode, open your storefront with the browser console open: Pickday notes appear.
5. **Import / Export**: click **Create share code** and copy it. In a second development store, open Import / Export, paste the code, click **Use code**: a preview lists the sections that will change. Click **Import and replace**. Try the same code again: "That code doesn't exist or has expired."
6. **Widget & text**: change the accent colour and roundness: the preview updates. Choose Deutsch, change "Choose a date" text, save, and open the German storefront: your text is shown.
7. Change your Shopify admin language (your profile → Language) to Español: Pickday's admin is in Spanish.

## Acceptance tests

"Automated" = covered by `npm test` or `npm run test:browser` and passing. "Needs a live store" = the code is in place but it can only be confirmed on a development store (Shopify checkout, webhooks, theme editor and calendars can't run here). Steps for each are in the "How to test" sections above.

| # | Test | Result |
|---|---|---|
| 1 | Fresh install → welcome → checklist; theme editor link turns the step green | Needs a live store (embed detection logic automated) |
| 2 | Kolkata store / UTC server / New York shopper: same days before and after 2 PM cutoff, time zone note | ✅ Automated (engine time-zone and cutoff tests; widget note) — confirm on a live store |
| 3 | German Monday-first, Arabic mirrored RTL, Japanese date format | ✅ Automated (browser test, 28 languages, RTL screenshots) |
| 4 | Local delivery only for Germany: US market sees Shipping only | ✅ Automated (country rules) — confirm with Markets on a live store |
| 5 | Postcode range 10115–10999 accepts "10 117"; area-list country shows a dropdown | ✅ Automated (postcode tests; area mode in widget) |
| 6 | Imported holiday closed and labelled; special open Sunday selectable | ✅ Automated (engine tests) |
| 7 | Slot max 2 → "Full" after 2 orders; capacity by items | ✅ Automated (counts + engine); "within ~1 minute" needs a live store |
| 8 | Product daily limit 40 → "Sold out for Sourdough" only for carts with it | ✅ Automated (engine product limits) |
| 9 | Date restriction 10–18 April limits the calendar; mixed cart with no common date explained | ✅ Automated (engine restrictions) |
| 10 | Selection survives reload/drawer; +3-day item clears a too-early date with message | ✅ Automated (browser: saved attributes; engine re-validation) — drawer needs a live theme |
| 11 | Gift-card-only cart: widget hidden, checkout allowed | ✅ Automated (Function + rules tests) |
| 12 | Missing date blocked in cart and by the validation Function on a direct checkout link | ✅ Automated (browser gate + Function tests) — live checkout needs a store |
| 13 | Checkout matching shows only the chosen pickup, renamed; never hides everything; Home warning | ✅ Automated (Function tests); Home warning comes from order webhook mismatch |
| 14 | Per-item mode: two dates on order, Orders, Production | ✅ Automated (order parsing + DB tests) — pages need a live store |
| 15 | Sunday fee added, Monday removed, checkout blocks if fee removed | ✅ Automated (Function surcharge tests, fee product tests) — cart behaviour needs a live store |
| 16 | Order shows date in details, tags, metafield, lists; thank-you date and .ics | Needs a live store (parsing, tags and .ics generation automated) |
| 17 | Change a date and bulk-move 5 orders; tags, attributes, counts update; back arrow keeps filters | ✅ Automated (reschedule DB tests) — UI needs a live store |
| 18 | Draft order schedule carries into the order | Needs a live store |
| 19 | Cancelling frees capacity and product limits | ✅ Automated (orders DB test) |
| 20 | ICS feed works in Google Calendar; regenerating invalidates the old URL | Needs a live store (feed format automated) |
| 21 | Flow "Schedule created" fires with correct data | Needs a live store |
| 22 | Digest sent once even if the job runs twice | ✅ By design (log row written before sending, unique per store and day) — confirm on a live store |
| 23 | Export from store A, import into B with product remapping; share code works once and expires | ✅ Automated (round trip); remapping by product handle and one-time codes need two live stores |
| 24 | Free plan 31st order → upgrade banner; checkout still works | ✅ Logic automated (usage alerts, limited orders still recorded) — confirm on a live store |
| 25 | Server stopped: storefront and Functions still work | ✅ By design (metafields only; widget makes no server calls) — confirm on a live store |
| 26 | Keyboard and screen reader usable; reduced motion respected | ✅ Automated (keyboard navigation in browser test; reduced-motion CSS); screen reader pass needs a person |
| 27 | Uninstall leaves no theme code; reinstall works | ✅ By design (theme app extension only) — confirm on a live store |
| 28 | Widget size target met; cart page not slower | ✅ Automated (20.3 KB gzipped, budget 35 KB, deferred loading) |
| 29 | Translations: keys, placeholders, plurals in 28 locales; no English leftovers; pseudo-loc; review list | ✅ Automated (translation tests, browser overflow test); TRANSLATION_REVIEW.md lists strings for native review |

## Automated checks (run `npm test`)

- Date engine: lead time, per-weekday cutoffs, working-day counting, closures, special open days, vacation, booking window, launch date, product restrictions, extra lead time, daily limits, capacity by orders and by items, slot limits, per-date overrides, admin overrides, multiple time zones, DST, leap years, country rules, postcode ranges, zones, surcharges.
- Storefront translations (27 languages): keys, placeholders, plural forms for 0–1000, no English left over, length limits.
- Admin translations: every key used by the code exists in English.
- Checkout Functions: valid choice passes, adding to cart never blocked, missing/closed/full/past-cutoff dates blocked in the shopper's language, wrong country, minimum order, date per item, gift cards, no config; checkout matching hides/renames correctly and never hides everything.
- Orders (with Postgres): new order counted, duplicate and older webhooks ignored, date change moves the count, cancel frees capacity, over-limit orders recorded but flagged; admin reschedule refuses full days unless overridden, keeps other order attributes, updates tags and history.
- Calendar links and .ics files.
- Email snippets: right Liquid object per template, balanced tags.
- Settings pages: postcode rule checking and address test, collection membership paging, Shopify location import, fee product variants (one per amount, never deleted), settings export/import round trip, Home checklist and alerts.
- Scheduled jobs: only the exact `X-Pickday-Secret` is accepted (missing or short secrets refuse everything); app embed detection in the theme settings.

## Browser checks (run `npm run test:browser`)

- Built widget in headless Chromium at 320px: renders, checkout blocked without a date, picking a date and slot saves cart attributes, arrow keys move between days, no overflow with pseudo-localised text or in any of the 28 languages, Arabic and Hebrew mirrored (screenshots in `tests/browser/screenshots/`).
