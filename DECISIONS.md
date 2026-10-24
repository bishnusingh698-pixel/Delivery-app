# Decisions and deviations

Short notes on choices made where the brief left room, or where Shopify works differently today. Numbered so code comments can refer to them.

## Platform

**D-01 Template and UI kit.** Built on Shopify's current official template (`shopify-app-template-react-router`, React Router 7, `@shopify/shopify-app-react-router` 3.x, API version 2026-10). The template now uses **Polaris web components** (`<s-page>`, `<s-section>`, …) loaded by App Bridge instead of the older `@shopify/polaris` React package. That is what Shopify calls Polaris today and what "Built for Shopify" reviews expect, so the admin uses it. No other CSS framework is used. React 18 does not forward custom-element events, so `app/components/polaris.tsx` wraps each interactive component and wires events through refs.

**D-02 Functions in JavaScript.** Both Functions are JavaScript (compiled to WebAssembly by the Shopify CLI) instead of Rust, so they can bundle the exact same date-engine code the widget and admin use (`core/`). The engine avoids `Intl` and `Date` time zones because Function runtimes have no `Intl`; "now" in the store's zone comes from `shop.localTime` (date + 23 hourly `timeAfter` checks, see D-38, giving the time to the half hour).

**D-03 Function API versions.** Validation uses the new `cart.validations.generate.run` target and delivery customization uses `cart.delivery-options.transform.run` (`deliveryOptionHide` / `deliveryOptionRename`), API 2026-07.

**D-04 Thank-you page calendar file.** Checkout UI extensions run in a sandbox without DOM or Blob downloads, so a truly client-side `.ics` file is not possible there. The block offers (a) an "Add to Google Calendar" link built entirely in the extension (no server), and (b) an "Add to calendar (.ics)" link to a stateless server endpoint (`/ics/event`) that builds the file from the query string without touching the database. The parameters aren't signed: the endpoint only ever returns a calendar file built from validated, length-limited values, so there is nothing to protect. If the server is asleep the first click takes up to a minute; the Google link always works instantly.

**D-05 Time-zone note wording.** Browsers have no translated city names, but they do have translated time-zone names (`Intl.DateTimeFormat` with `timeZoneName: "longGeneric"`, e.g. "Indische Normalzeit"). The note therefore reads "Dates and times are in {zone}." using that translated name, falling back to the city from the IANA id.

## Data and cost

**D-06 Storefront never needs the server.** Settings are published to an app-installation metafield (`pickday.config`, read by Liquid as `app.metafields.pickday.config`) and capacity counts to `pickday.availability`. The Functions read their own copies from metafields on the validation and delivery-customization objects. The only server calls from the storefront are none at all in v1.

**D-07 Settings as one JSON document.** The brief suggested one table per concept (Location, Slot, Closure, Zone…). Settings are always read and written together, validated together, published together and exported/imported together, so they are stored as one versioned JSON document per shop (`Settings.data`, validated with zod). That is one small query per admin page instead of ten, which matters on Neon's free compute hours. Order data stays relational (`ScheduledOrder`, `ScheduledItem`, `CapacityCount`, `ProductCount`).

**D-08 Counts are rebuilt, not incremented.** On every order event the counts for the affected dates are recomputed from the stored orders. Retries, duplicates and out-of-order webhooks therefore can't drift capacity.

**D-09 Capacity is not race-proof in v1.** Capacity is enforced in the storefront from published counts (refreshed a few seconds after each order) and counted after ordering. Two shoppers can still book the last spot at the same second; the merchant sees the day as over capacity and can move one order. A hard limit would need a reservation call at checkout, which would make checkout depend on the server.

**D-10 Free plan limit.** Instead of not recording orders above the monthly limit, Pickday still records them (so capacity stays correct for shoppers — otherwise a full day would look empty) but does not tag them, write the order metafield or fire Flow triggers until the merchant upgrades. Upgrading backfills tags for the current month. The widget and checkout are never affected.

**D-11 Function config size.** Function input is size-limited, so the Function copy of the config drops display-only data (addresses, instructions, widget styles, non-checkout texts). If it is still over 20 KB, postcode lists and zones are removed from the Function copy; the Function then validates against method-level rules only, and skips the date check for orders that use a zone (D-39), so it is never stricter. Home shows a warning suggesting fewer/shorter postcode rules.

## Behaviour choices

**D-12 Lead time counting.** Lead time counts from "now" if the cutoff hasn't passed, otherwise from the start of the next working day. With "count only working days", an order placed on a closed day also counts from the next working day. For delivery zones that deliver only on some weekdays, working days for lead time are still the method's own working days (the kitchen works Monday even if the North zone gets deliveries only on Tuesday and Thursday).

**D-13 Same-day.** Lead time 0 days already allows today. The separate "same-day" switch is an express option: it opens today before its own cutoff even if the normal lead time is longer, as long as no product in the cart needs extra time.

**D-14 Per-weekday cutoff table.** When "different cutoff per weekday" is on, an empty cell means no cutoff on that weekday.

**D-15 Readable cart attribute keys stay English.** Keys such as `Delivery date` are fixed so packing slips, Order Printer templates, Flow and other apps can rely on them. The values are written in the store's primary language.

**D-16 Booking window.** Counted from today (store time), also when "don't open dates before" is set. Merchants running pre-orders far ahead should increase the window.

**D-17 Vacation.** Days in vacation mode are closed, and preparation (lead time) starts on the first working day after the vacation.

## Storefront widget (P3)

**D-18 Express checkout buttons are never blocked by the widget.** The widget only intercepts the normal checkout button (and forms posting to checkout). Shop Pay / Apple Pay / Google Pay buttons are Shopify-rendered and must not be interfered with; the validation Function (P4) is the backstop that stops those orders at checkout with a translated message.

**D-19 Surcharges are real cart lines.** A fee for a weekday, date, slot or same-day is a hidden "Delivery fee" product variant added to the cart by the widget (no Plus-only cart transforms). On the cart page the page reloads once so the theme shows the new total; in a drawer the widget fires the common theme refresh events. The validation Function checks the fee line is present at checkout.

**D-20 Scopes.** `read_themes` (to check the app embed is on, for the setup checklist), `read_markets` (which countries the store sells to), `read_locations` (pickup locations), `read_products` (product rules), `write_products` and `write_publications` (the hidden fee product, which must be on the Online Store for the cart to add it), orders and draft orders (tags, metafields, scheduling from the admin), `write_validations` and `write_delivery_customizations` (the two Functions). No customer, analytics or theme-write scopes.

**D-21 Built widget files are committed.** `extensions/pickday-theme/assets/*.js|css` are generated by `npm run build:widget` and committed so `shopify app deploy` works from a fresh checkout; CI fails if they are out of date.

**D-22 Product page date.** In "one date per order" mode the product page shows the earliest date (and an optional picker); a date picked there is carried into the cart widget. In "date per item" mode the product page picker writes the date as a line item property and, if the date is required, blocks adding to cart until one is picked.

**D-23 Widget only loads where useful.** The script is loaded by the app embed on every page (deferred, about 20 KB gzipped) but reads the cart only once and never calls the Pickday server. Translations load lazily, one language at a time.

## Checkout and orders (P4)

**D-24 The validation Function is lenient by design.** It is a backstop, so when in doubt it lets the order through: the current time is read to the hour (Functions have no clock, only "is it after HH:00?" checks), pickup locations in another time zone are checked with their own offset (D-38), and when the published counts don't fit the Function input the "full" check is skipped. The widget enforces the exact rules before checkout.

**D-25 "Buy it now" and a required date.** Buy-it-now and express buttons skip the cart, so no date is chosen. The product page block has a setting "Hide 'Buy it now' for products that need a date" (on by default) that hides Shopify's dynamic checkout button with CSS for those products only; no theme code is edited. Without the block on the product page, the validation Function stops such orders at checkout with "Please choose a delivery or pickup date in your cart". Express checkout buttons in the cart are never intercepted (D-18).

**D-26 Admin changes win.** After a merchant changes an order's date (order page or Orders page), later order updates from Shopify keep that date. The order's own attributes are rewritten too, so packing slips and other apps show the new date.

**D-27 Orders over the plan limit.** Recorded and counted against capacity (so nothing is overbooked) but not tagged, not given the order metafield and not sent to Flow until the merchant upgrades (D-10).

## Orders, production and notifications (P5)

**D-28 Addresses and phones are never stored.** Day sheets and route sheets fetch them live from Shopify at print time (needs protected customer data level 2 for name, address and phone; see README). If Shopify refuses, the sheets still print without them. Pickday's database keeps order number, first name, items, date and area only.

**D-29 Bulk moves reuse the single-order path.** Each order in a bulk move goes through the same checks as "Change date" (unless "Ignore limits" is ticked), so counts, tags, attributes, history and Flow triggers stay consistent. Customers are never emailed.

**D-30 No email from Pickday.** Pickday sends no emails and has no email provider or API key (the earlier Brevo summary was removed in round 2). The daily summary is a Shopify Flow trigger instead (D-61); Shopify sends all customer emails, and the snippets add the date to them.

**D-31 Calendar feed is a secret link.** Anyone with the URL can read it, so it holds only order number, first name, method and slot (items only if the merchant opts in) and can be regenerated. Window: 30 days back to 180 days ahead. Calendar apps cache it, so changes show up with a delay.

**D-32 Data retention.** Daily job: webhook logs after 7 days, activity log after 180 days, capacity counts 3 days after the date, schedules 400 days after the date (so "last year" comparisons work), all data of stores uninstalled for 60 days (if Shopify's shop/redact never arrived).

**D-33 Email snippets, not template edits.** Pickday can't and won't change notification templates. It gives copy-paste Liquid that reads the order's "Delivery date" attribute and re-formats the ISO date, so the date follows the template's language where Shopify supports it.

## Locations, areas, products, fees (P6)

**D-34 One fee variant per amount.** The hidden "Delivery fee" product gets one variant per distinct amount. Two fees with the same amount that apply to the same order are charged once (the cart line names both). Variants are never deleted, so old orders keep working. The product is tagged `pickday-hidden`; merchants with automated collections should exclude that tag.

**D-35 Collection rules are resolved on save.** Product rules that use collections are expanded to product ids (up to 2,000 per collection) when the merchant saves, for the order webhook. The storefront and checkout check collection membership live. If a collection changes later, saving Product rules again refreshes it.

**D-36 Region codes without country prefix.** Delivery regions are stored as province codes ("CA"), matched with or without "US-".

**D-37 Plan location limit counts all locations,** enabled or not, to keep the rule easy to explain.

**D-38 Checkout gives the benefit of the doubt within the hour.** Shopify tells the validation Function only which hour it is in the shop's time zone. The Function checks the choice at the start and at the end of that hour and lets the order through if either passes, so a valid order is never blocked; a cutoff can be missed by up to 59 minutes at checkout (the widget itself uses the exact time). Pickup locations in another time zone get their offset from the shop published with the config, refreshed hourly so daylight-saving changes are followed.

**D-39 Checkout re-checks the delivery address.** For delivery, the postcode or region typed at checkout must still be covered (message "Sorry, we don't deliver to … yet"), and its zone decides the schedule. In "pick your area" mode the shopper's chosen area is trusted. When the config had to be trimmed (D-11) and the order uses a zone, the date check is skipped rather than judged by the wrong rules.

**D-40 Importing settings from another store keeps your own notifications.** The calendar feed and the Flow switch are never copied from another store. Imported fees get this store's own fee variants straight away.

**D-41 Known limit: date per item and capacity.** In date-per-item mode each line is checked on its own at checkout, so two lines on the same nearly-full day can together go over the limit by one order. Zone limits and tag-based product limits also aren't applied per item, and surcharges are not added in date-per-item mode. The daily counts stay correct (the day shows as full afterwards); a fix is on the roadmap.


**D-42 No date required until the app embed is found on.** The app checks whether the Pickday app embed is on in the live theme: right away when the live theme changes (themes/publish and themes/update webhooks), whenever Home or the Appearance page opens, and daily. Until it is found on (never checked yet, check failed, found off), the published checkout config says so and the validation Function blocks nothing, because shoppers have no way to pick or fix a date. Home shows a critical alert while it is off.

**D-43 Checkout checks the pickup location and leaves fees out of the minimum.** A pickup choice must name a location that exists, is switched on and serves the delivery country. Pickday's own fee lines don't count toward a method's minimum order, in the widget and at checkout.

**D-44 Shipping rates are not renamed unless the merchant asks.** Adding the date to the rate name applies to Local delivery and Pickup by default. Renaming carrier/shipping rates is a separate switch, off by default, because 3PL and rate-name automations can depend on the original name.

**D-45 Order webhooks are recorded before answering when possible.** The webhook waits up to 3.5 seconds for the order to be recorded. If recording fails, it answers with an error and forgets the delivery id so Shopify's retry is processed. If the database is slow, it answers and finishes in the background (the small remaining risk is a restart during that time).

**D-46 A shop that reinstalled keeps its data.** `shop/redact` arrives 48 hours after an uninstall. If the shop has installed Pickday again by then, the request is logged and nothing is deleted.

**D-47 Share codes are stored as a SHA-256 hash.** The code itself is shown once. Creating a code and its use are logged in the source store's activity log, the import in the importing store's. No extra attempt limit: entering a code needs a logged-in admin and a 10-character code has about 50 bits.

**D-48 Production server.** `server.mjs` replaces `react-router-serve` with the same Express setup plus two changes: request logs hide calendar feed tokens, and `/feeds` and `/ics` are limited to 30 requests per minute per IP (in memory, enough for one instance).

**D-49 Dates always Gregorian with Latin digits** in the widget, so Thai, Arabic and other locales match Shopify's checkout and the order. A "use local digits" option is not offered yet.

**D-50 Some document requests not followed.** From the October 2026 repair document:
- Capacity stays checked at checkout when the counts fit (D-24) instead of an opt-in "strict capacity" switch: blocking a full day is the point of limits, and the check already lets orders through when it can't be sure.
- No app proxy (D-06): the storefront never calls the server.
- No product rule index: tags are read from Liquid and `/products/<handle>.js`, collections from the list refreshed on save and daily (D-35).
- A zone with its own limit has a separate limit from the method's daily limit; a location's own schedule replaces the method's entirely.
- Special open days win over vacation mode, and calendar-day lead time after the cutoff counts from the next working day (D-12).
- Test orders count toward capacity, so a test order can be used to check the setup.

## Round 2 (October 2026 redesign)

**D-51 Public holidays are sets, not copied dates.** A holiday set is a country (and optional region) plus the holidays the merchant skips. It's expanded into closures for the booking window on every publish (at least daily, by the hourly job), so holidays renew every year with no action. Skips are stored by the dataset's rule ("12-25", "easter 1"), which stays the same every year. Moveable and lunar holidays keep the "may shift" note. Single dates the merchant adds by hand stay ordinary closures.

**D-52 Every plan gets a correct picker.** A delivery-date app that lets customers book Christmas Day or offers only one method looks broken. Free now includes every method, time slots, holidays, closed days and the notes box (1 pickup location, 50 scheduled orders a month). Starter sells what prevents overbooking (daily and per-slot limits) plus checkout matching and 3 locations (500 orders). Pro keeps the advanced rules and tools.

**D-53 No storefront branding.** The free plan's "Powered by Pickday" link is removed: merchants couldn't turn it off, and storefront promotion is a common App Store review objection.

**D-54 Regional defaults are suggestions.** The country decides the first working days, first day of the week and the usual numeric date format (`core/regions.ts`); the wizard and the country selector apply them, and every value stays editable. Changing the country later never changes working days unless the merchant ticks that box. Date format defaults to "in the store's language" for new stores, because a written date ("Friday, 18 October") is clearer for shoppers; merchants who print `MM/DD/YYYY` pick it once.

**D-55 The date format applies to what is written, not the calendar.** It changes the order's "Delivery date" attribute (still followed by the ISO date in brackets, which the email snippets parse; not repeated when the format is already ISO), the cart summary, dropdown and product page text. The calendar grid keeps the shopper's language.

**D-56 Notes box.** Optional, per method, saved as the cart attribute "Delivery instructions" (fixed English key like the others, D-15) so it reaches the order, packing slips and Flow. Pickday doesn't store it; day and route sheets read it live from Shopify. It's never required: a required free-text field blocks checkout for no good reason.

**D-57 The checkout button never traps a shopper.** When a date is required but no picker is visible (a theme layout the widget doesn't recognise), the widget puts the picker right next to the button the shopper clicked; if the merchant turned the drawer picker off, it sends them to the cart page. The validation Function remains the backstop for express buttons.

**D-58 A date chosen on a product page is the cart's choice.** In one-date-per-order mode the product page picker writes the cart attribute straight away (also with an empty cart), never line properties, so an order can't carry two different dates. Date-per-item mode keeps line properties.

**D-59 The admin preview is the storefront widget.** Delivery, Pickup, Appearance and the wizard run `widget/src` itself on the unsaved settings with an in-memory cart, so the preview can't drift from what shoppers see. It's rebuilt on every change (cheap), so a picked date in the preview resets when a setting changes.

**D-60 Admin structure.** Seven task sections plus Help, reachable from an icon bar on every page and the Shopify sidebar: Home, Orders (with Production), Delivery (local delivery + shipping, with Delivery areas), Pickup (with locations), Days off, Appearance, Settings (store & region, what customers choose, order tags, and links to product rules, fees, checkout, notifications, import/export, plan). The old Methods, Schedule, Slots & capacity, Closures, Locations and Widget pages are merged into these and removed.

**D-61 Daily summary through Shopify Flow, not an email service.** A "Daily schedule" Flow trigger fires once a day at the merchant's hour (store time) with today's or tomorrow's totals, a per-slot/location line and an Orders page link; the merchant adds Flow's free **Send internal email** action (the Notifications page gives the steps and a copyable subject and message). Why: zero cost, no API key or sub-processor, mail comes from the store's own sender address, and merchants can route it to Slack or anything else Flow supports. Flow is free on every non-Plus plan. Sent up to 3 hours late if the server was asleep; one atomic claim per store-local day stops duplicates. On every plan (it costs nothing to run). Only field types documented for app triggers are used (single line text, decimal number, URL), with letters-and-spaces keys.

**D-62 Customers change their own date in customer accounts.** An order action (menu button + modal, `customer-account.order.action.*`, available on every plan) lets a signed-in customer pick another date and slot for an unfulfilled order, until `hoursBefore` the current slot start (or midnight) in the method's time zone, at most `maxChanges` times. Same engine, limits and rules as the cart (`checkSelection`), same write path as an admin change (attributes, tags, metafield, history, Flow "Schedule changed" on Pro). The server re-checks ownership live (order's customer id = session token `sub`) and answers "not found" otherwise; method and pickup location can't be changed by the customer (that changes shipping cost). Off by default; Starter and Pro. The extension needs network access approval and the app URL, which `npm run deploy` writes from `shopify.app.toml`. Not offered: date changes on the legacy order status page (no extension point there) and on orders with a date per item.

## Not yet decided / proposed

Further decisions are added as phases land.
