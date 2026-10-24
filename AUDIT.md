# Pickday audit (October 2026, round 2)

Source of truth for this round of work. Updated as items land (✅ done, ⏳ in progress, ⬜ to do).

## 0. How the app works (map)

| Flow | Where | Notes |
|---|---|---|
| Install / auth | `app/shopify.server.ts` `afterAuth` → `services/install.server.ts` | Creates the `Shop` row + default `Settings`, publishes metafields. Runs on every auth, idempotent. |
| Onboarding | `routes/app._index.tsx` | Today: a "welcome" box (business type + country) and a 6-item checklist. |
| Settings | One JSON document per shop (`Settings.data`), validated by zod (`services/settings-schema.server.ts`) | Each page posts the sections it edits (`patchSettingsAction`); every save republishes. |
| Publishing | `services/publish.server.ts` + `core/publish.ts` | `pickday.config` + `pickday.availability` (app-installation metafields, read by Liquid), Function configs, thank-you config. The storefront never calls the server. |
| Storefront widget | `widget/src/*` → `extensions/pickday-theme/assets` | App embed + cart block + product block. Writes cart attribute `_pickday` + readable attributes. Gates the checkout button. |
| Checkout | `extensions/pickday-validation` (cart validation Function), `extensions/pickday-delivery` (delivery customization Function) | Backstop for express checkout and direct links; hides non-matching rates. Both work on every plan for public apps. No Plus-only checkout UI extensions. |
| Orders | `routes/webhooks.orders.tsx` → `services/orders.server.ts` | Idempotent, out-of-order safe; counts rebuilt per date (`services/counts.server.ts`). Tags + order metafield + Flow. |
| Thank-you / order status | `extensions/pickday-thank-you` | Allowed on all plans. |
| Admin order block / actions | `extensions/pickday-admin` + `routes/api.order.$id.tsx`, `api.draft.$id.tsx` | Session-token authenticated. |
| Jobs | `routes/jobs.hourly.tsx`, `jobs.daily.tsx` (cron-job.org, secret header) | Republish (dates and holidays roll forward), pruning, embed check, shop info sync. |
| Uninstall / GDPR | `webhooks.app.uninstalled.tsx`, `webhooks.compliance.tsx` | Data kept 48 h for a reinstall, deleted on `shop/redact`. |

Baseline checks before this round: `npm run typecheck` ✅, `npm run lint` ✅ (0 errors, 21 warnings), `npm test` ✅ (278 passed, 9 DB tests skipped without a database), `npm run build` ✅.

Final checks after this round: `npm run typecheck` ✅ (app + extensions), `npm run lint` ✅ (0 errors, 20 warnings), `npm test` ✅ (324 passed, including the 9 database tests against Postgres), `npm run build` ✅ (widget 22.2 KB gzipped of a 35 KB budget), browser tests ✅ (38 widget checks + admin live preview), `prisma migrate deploy` on an empty database ✅.

## 1. Bugs

Severity: **C** critical (wrong dates, stuck shoppers, broken install), **M** major, **m** minor.

### Fixed in round 1 (kept for reference)

B1 same-day opened every day before the lead time (C) ✅ · B3 reinstall left a stale app-installation id (C) ✅ · B4 missing `read_locales` scope (C) ✅ · B5 pickup limits without a location never applied (M) ✅ · B6 US ZIP+4 never matched (M) ✅ · B8 pickup offered where no location serves (M) ✅ · B9 flags survived uninstall (M) ✅ · B10 time zone only synced on auth (M) ✅ · B11 `</script>` in merchant text (M) ✅ · B12 zone slot labels on reschedule (M) ✅ · B13 window limit mismatch (M) ✅ · B14–B20 minor ✅.

### Open / new in round 2

| # | Sev | File:line | Bug | Root cause | Status |
|---|---|---|---|---|---|
| B2 | C | `widget/src/widget.ts` `view()` ~590, `canCheckout()` | Store pickup **without any pickup location** (what the presets switch on) shows no date picker but still requires a date: the shopper can never check out. | Date picker only renders when `locationId` is set. | ✅ |
| B7 | M | `widget/src/main.ts` gate ~105 | Theme cart drawer not recognised → checkout click silently blocked; the error renders where nobody can see it. Also new themes (Horizon) use other drawer markup. | Gate blocks even when no widget is visible; only a fixed list of drawer selectors. | ✅ |
| B21 | M | `widget/src/widget.ts` `canCheckout()` | Minimum order not reached: the picker is hidden but the shopper is told "choose a date" (they can't). | Gate ignores the min-order state. | ✅ |
| B22 | M | `widget/src/main.ts` `setHidden()` | In one-date-per-order mode the product-page picker writes `Delivery date` **line properties**. If the shopper then picks another date in the cart, the order carries two different dates (line vs order attribute) → wrong date on packing slips. | Product page writes line properties in both modes. | ✅ |
| B23 | M | `app.settings.closures.tsx` holiday import | Imported public holidays are one-off dates for the next 12 months; nothing renews them, so next year's Christmas becomes bookable silently. | Holidays copied as fixed dates. Fix: holiday **sets** (country/region) expanded on every publish for the rolling booking window. | ✅ |
| B24 | M | `widget/src/styles.css` `--pd-on-accent` | Text on the accent colour is always white: a light accent (yellow, pastel) makes the selected day and slot unreadable. | No contrast calculation. | ✅ |
| B25 | M | `core/defaults.ts`, `install.server.ts` | Every new store gets Mon–Fri working days and Monday/Sunday week start from the browser, also in Saudi Arabia, Israel, Iran… | No per-country defaults. | ✅ |
| B26 | m | `services/reschedule.server.ts` 441, draft 486 | Admin date change writes `Delivery date` as a bare ISO date (storefront writes "Friday, 18 October 2026 (2026-10-18)"); draft-order scheduling leaves stale `Time slot` / `Pickup location` attributes. | Different formatting paths. | ✅ |
| B27 | m | `webhooks.compliance.tsx` `CUSTOMERS_REDACT` | The stored postcode/area of the customer's orders is kept. | Only `customerFirst` and history cleared. | ✅ |
| B28 | m | `services/orders-query.server.ts` `parseFilters("week")` | "This week" always starts on Monday, also for US stores. | Hard-coded. Use the store's week start. | ✅ |
| B29 | m | `routes/app.orders._index.tsx` bulk move | Moving pickup orders keeps a slot id only if it exists in the method's default slots, not a location's own slots. | Slot lookup ignores locations. | ✅ |
| B30 | m | `app.settings.closures.tsx` modal | Editing a closure shows "Add closure"; yearly ranges stored as `MM-DD` can't be edited (date field empty). | Heading/format. | ✅ |
| B31 | m | `render.yaml` buildCommand | Relies on Prisma's postinstall to generate the client. | Explicit `prisma generate` missing. | ✅ |
| B33 | M | `core/tz.ts` `zonedToUtc` | A time inside a daylight-saving gap (02:30 on the spring-forward day, or 00:00 in zones that change at midnight like America/Santiago) was moved **backward** an hour instead of forward, so "start of the month" in such zones counted an hour of the previous month. Found by the Phase 3 DST tests. | Two fixed-point iterations without gap detection. Now: candidates from the offsets a day before and after; first exact match, else the later one. | ✅ |
| B34 | M | `widget/src/main.ts` gate | On the cart page, a theme whose checkout button sits outside `main` / the cart form got no picker and the error rendered nowhere: same trap as B7. Found while re-reading B7's fix. | Auto-placement only looked inside `main` and the cart form. Now the picker is placed next to the button the shopper clicked. | ✅ |
| B32 | m | Widget, free plan | "Powered by Pickday" link on the storefront of free stores: merchants can't remove it and App Store reviewers dislike storefront promotion. | Branding feature. Removed. | ✅ |

Checked and **not** bugs: cutoff boundary (`>=` at exactly the cutoff = next day), leap days and yearly ranges over New Year (`core/civil.ts`), DST conversion (`zonedToUtc`), idempotent / out-of-order order webhooks, express checkout (validation Function is the backstop), counts rebuilt not incremented, shop scoping on every query, jobs secret compare, CSV formula injection guard, session-token auth on admin extension APIs, GDPR shop/redact after reinstall.

Known limitation kept (DECISIONS D-09): two shoppers can book the last spot within the same few seconds; counts republish ~3 s after each order and the Function re-checks at checkout. A hard reservation would need the server during checkout (not free-tier safe).

## 2. UX problems

Admin
1. Organised by data type: 8 menu items plus a Settings hub with 10 cards. Turning on pickup needs 4 pages (Methods → Schedule → Slots & capacity → Pickup locations). → **7 task-based sections with an icon bar on top of every page.**
2. No setup wizard: a welcome box plus a 6-step checklist pointing at 6 pages. → **3-step wizard (< 2 minutes).**
3. The "live preview" is a static mock with fake dates. → **The real storefront widget, running the real engine on the unsaved settings.**
4. Country only drives the holiday importer. → **Country selector with regional defaults** (working days, week start, date format, holidays).
5. Holidays need a modal, a country select and ticking each holiday, and expire after a year (B23). → **One switch: "Closed on {country} public holidays", renewed automatically, each holiday can be skipped.**
6. Free plan can't use closures/holidays, time slots or more than one method: a new store's picker offers Christmas Day. → **Free plan includes every scheduling basic.**
7. Jargon: "Methods & countries", "Slots & capacity", "Checkout matching", "Surcharges". → plain words.
8. No quick "we're closed today" action. → **"Close a day" on Home.**

Storefront widget
1. B2, B7, B21, B22, B24.
2. No delivery instructions / gift message. → **Optional notes box** (cart attribute, shown on the order).
3. Dates always in the long locale style. → **Date format setting** (auto / MM/DD/YYYY / DD/MM/YYYY / YYYY-MM-DD / written month).
4. Week start always from the shopper's language. → Store setting (auto or Sunday/Monday/Saturday).
5. Placement fixed above the checkout button. → **Position option** (above or below the checkout button) and a switch for the cart drawer.

App Store reviewer view
1. Storefront branding link (B32).
2. Everything else already in order (GDPR, scopes, embed, billing, no theme code edits).

## 3. Features: add / change / remove

| Change | Why | Status |
|---|---|---|
| **Icon navigation bar** on top of every page (Home, Orders, Delivery, Pickup, Days off, Appearance, Settings, Help) + same Shopify sidebar menu | One click to anything, also on mobile (scrolls sideways). | ✅ |
| **Delivery page**: Local delivery + Shipping tabs; on/off, name, days, lead time, cutoff, same-day, booking window, time slots, limits, where offered, minimum order, areas & zones link, live preview | Replaces Methods + Schedule + Slots & capacity. | ✅ |
| **Pickup page**: on/off, default hours/slots/limits, pickup locations with own hours, limits and days off | Replaces Methods (pickup) + Schedule + Locations. | ✅ |
| **Days off page**: public holidays (one switch, auto-renewing, skip any), closures, yearly dates, vacation mode, special open days, year calendar | Replaces Closures & holidays. | ✅ |
| **Appearance page**: colours, layout, position, labels/texts per language, real live preview | Replaces Widget & text. | ✅ |
| **Settings page**: store & region (country, date format, week start), shopper options (method order, default method, date per order/item, notes box), links to product rules, fees, checkout, notifications, import/export, plan | Everything that isn't a schedule in one place. | ✅ |
| **Setup wizard** (3 steps) | Live in under 2 minutes. | ✅ |
| **Regional defaults** (`core/regions.ts`): working days, week start, date format for ~90 countries | Worldwide correctness (B25). | ✅ |
| **Holiday sets** expanded at publish time | B23. | ✅ |
| **Date format** setting | Merchants print `MM/DD/YYYY`. | ✅ |
| **Delivery instructions / gift message** box | Most requested extra. | ✅ |
| **Next 14 days** chart on Home + **Close a day** quick action | See busy days, close fast. | ✅ |
| **Widget position**, drawer switch, automatic text contrast | Styling without code (B24). | ✅ |
| **Generous Free plan**: every method, time slots, holidays and closures, notes, 1 location, 50 orders/month. Starter: daily and slot limits, checkout matching, 3 locations, 500 orders. Pro: everything. | New stores get a correct picker; paid plans sell capacity and advanced rules. | ✅ |
| Remove: storefront "Powered by" link; Methods, Schedule, Slots & capacity, Locations and Settings-hub pages (merged) | Less to learn, reviewer-safe. | ✅ |
| Remove: the merchant daily summary email (Brevo), its settings, `DigestLog` table, `BREVO_API_KEY`/`EMAIL_FROM` and 18 admin texts | Owner request: no email service, zero cost. It only ever emailed the merchant's staff, never customers; Home, Orders and the calendar feed cover the same need. Customers still get Shopify's own order emails (with the date via the snippets). Only `SUPPORT_EMAIL` (a displayed address) remains. | ✅ |
| **Daily summary email, free, through Shopify Flow** ("Daily schedule" trigger + Flow's Send internal email; setup steps and copyable text on Notifications) | Replaces the removed Brevo email at zero cost and with no API key; asked for again by the owner. On every plan. | ✅ |
| **Customers change their own date** from their order in customer accounts (order action, deadline and change limit set by the merchant) | Found missing in every competitor listing reviewed (Zapiet, Stellar, Bird, Pickeasy, Flare); cuts "can I move my delivery?" emails. Starter and Pro. | ✅ |

## 4. Verification notes

- `tests/tricky-dates.test.ts`: DST in New York (spring forward / fall back), Sydney, Santiago (midnight change); Kolkata, Kathmandu, Chatham offsets; cutoff at 13:59 vs 14:00; Friday after cutoff; month end; year end with New Year closed; leap day; yearly Feb 29 rule; window across the year; UK holidays over New Year and lunar Saudi holidays from the real dataset; the checkout Function's hour-level check (benefit of the doubt inside the cutoff hour).
- `tests/regional.test.ts`: regional defaults, date formats, contrast, holiday sets renewing every year, plans, wizard.
- `tests/admin/pages.render.test.tsx`: every redesigned page renders with realistic data and no untranslated keys.
- `tests/browser/widget.browser.ts` (38 checks): B2, B7, B21, B24, B34, notes box, 28 languages, RTL, 320 px.
- `tests/browser/preview.browser.ts`: the admin live preview runs the real widget, reacts to setting changes and shows holidays.
- `tests/db/*` run against a real Postgres.

## 5. Order of work

1. ✅ Audit (this file).
2. ✅ Core: regions, holiday sets, date format, notes, widget options, plan changes, contrast; tests.
3. ✅ Server: publish expands holidays, install uses regional defaults, B26–B29, B31.
4. ✅ Widget: B2, B7, B21, B22, B24, notes, date format, week start, position; rebuild; 28 storefront languages for new text.
5. ✅ Admin redesign: icon nav, wizard, Home chart + close a day, Delivery, Pickup, Days off, Appearance (live widget preview), Settings; remove merged pages.
6. ✅ Admin translations (8 languages) for new text.
7. ✅ Docs: README (Render + Neon + Partner Dashboard), DECISIONS, CHECKLIST, PRIVACY, `.env.example`, `render.yaml`.
8. ✅ Verification: re-read changed files, tricky date tests (time zones, DST, holidays, cutoff boundary, month/year ends, leap day), full install → order flow review, typecheck, lint, tests (incl. DB), build, browser test.
