# Decisions and deviations

Short notes on choices made where the brief left room, or where Shopify works differently today. Numbered so code comments can refer to them.

## Platform

**D-01 Template and UI kit.** Built on Shopify's current official template (`shopify-app-template-react-router`, React Router 7, `@shopify/shopify-app-react-router` 3.x, API version 2026-10). The template now uses **Polaris web components** (`<s-page>`, `<s-section>`, …) loaded by App Bridge instead of the older `@shopify/polaris` React package. That is what Shopify calls Polaris today and what "Built for Shopify" reviews expect, so the admin uses it. No other CSS framework is used. React 18 does not forward custom-element events, so `app/components/polaris.tsx` wraps each interactive component and wires events through refs.

**D-02 Functions in JavaScript.** Both Functions are JavaScript (compiled to WebAssembly by the Shopify CLI) instead of Rust, so they can bundle the exact same date-engine code the widget and admin use (`core/`). The engine avoids `Intl` and `Date` time zones because Function runtimes have no `Intl`; "now" in the store's zone comes from `shop.localTime` (date + 48 `timeAfter` checks, giving the time to the half hour).

**D-03 Function API versions.** Validation uses the new `cart.validations.generate.run` target and delivery customization uses `cart.delivery-options.transform.run` (`deliveryOptionHide` / `deliveryOptionRename`), API 2026-07.

**D-04 Thank-you page calendar file.** Checkout UI extensions run in a sandbox without DOM or Blob downloads, so a truly client-side `.ics` file is not possible there. The block offers (a) an "Add to Google Calendar" link built entirely in the extension (no server), and (b) an "Add to calendar (.ics)" link to a stateless server endpoint (`/ics/event`) that builds the file from signed query parameters without touching the database. If the server is asleep the first click takes up to a minute; the Google link always works instantly.

**D-05 Time-zone note wording.** Browsers have no translated city names, but they do have translated time-zone names (`Intl.DateTimeFormat` with `timeZoneName: "longGeneric"`, e.g. "Indische Normalzeit"). The note therefore reads "Dates and times are in {zone}." using that translated name, falling back to the city from the IANA id.

## Data and cost

**D-06 Storefront never needs the server.** Settings are published to an app-installation metafield (`pickday.config`, read by Liquid as `app.metafields.pickday.config`) and capacity counts to `pickday.availability`. The Functions read their own copies from metafields on the validation and delivery-customization objects. The only server calls from the storefront are none at all in v1.

**D-07 Settings as one JSON document.** The brief suggested one table per concept (Location, Slot, Closure, Zone…). Settings are always read and written together, validated together, published together and exported/imported together, so they are stored as one versioned JSON document per shop (`Settings.data`, validated with zod). That is one small query per admin page instead of ten, which matters on Neon's free compute hours. Order data stays relational (`ScheduledOrder`, `ScheduledItem`, `CapacityCount`, `ProductCount`).

**D-08 Counts are rebuilt, not incremented.** On every order event the counts for the affected dates are recomputed from the stored orders. Retries, duplicates and out-of-order webhooks therefore can't drift capacity.

**D-09 Capacity is not race-proof in v1.** Capacity is enforced in the storefront from published counts (refreshed a few seconds after each order) and counted after ordering. Two shoppers can still book the last spot at the same second; the merchant sees the day as over capacity and can move one order. A hard limit would need a reservation call at checkout, which would make checkout depend on the server.

**D-10 Free plan limit.** Instead of not recording orders above the monthly limit, Pickday still records them (so capacity stays correct for shoppers — otherwise a full day would look empty) but does not tag them, write the order metafield or fire Flow triggers until the merchant upgrades. Upgrading backfills tags for the current month. The widget and checkout are never affected.

**D-11 Function config size.** Function input is size-limited, so the Function copy of the config drops display-only data (addresses, instructions, widget styles, non-checkout texts). If it is still over 20 KB, postcode lists and zones are removed from the Function copy; the Function then validates against method-level rules only (more lenient, never stricter). Home shows a warning suggesting fewer/shorter postcode rules.

## Behaviour choices

**D-12 Lead time counting.** Lead time counts from "now" if the cutoff hasn't passed, otherwise from the start of the next working day. With "count only working days", an order placed on a closed day also counts from the next working day. For delivery zones that deliver only on some weekdays, working days for lead time are still the method's own working days (the kitchen works Monday even if the North zone gets deliveries only on Tuesday and Thursday).

**D-13 Same-day.** Lead time 0 days already allows today. The separate "same-day" switch is an express option: it opens today before its own cutoff even if the normal lead time is longer, as long as no product in the cart needs extra time.

**D-14 Per-weekday cutoff table.** When "different cutoff per weekday" is on, an empty cell means no cutoff on that weekday.

**D-15 Readable cart attribute keys stay English.** Keys such as `Delivery date` are fixed so packing slips, Order Printer templates, Flow and other apps can rely on them. The values are written in the store's primary language.

**D-16 Booking window.** Counted from today (store time), also when "don't open dates before" is set. Merchants running pre-orders far ahead should increase the window.

**D-17 Vacation.** Days in vacation mode are closed, and preparation (lead time) starts on the first working day after the vacation.

## Not yet decided / proposed

Further decisions are added as phases land.
