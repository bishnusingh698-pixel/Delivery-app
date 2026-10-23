# Pickday audit (October 2026)

Source of truth for this round of work. Updated as items land (✅ = done, ⏳ = in progress, ⬜ = to do).

## 0. How the app works today (map)

| Flow | Where | Notes |
|---|---|---|
| Install / auth | `app/shopify.server.ts` (`afterAuth` → `services/install.server.ts`) | Creates `Shop` row + default `Settings`, publishes metafields. Runs on every auth. |
| Settings | One JSON document per shop (`Settings.data`), validated by zod (`services/settings-schema.server.ts`) | Saved per page through `patchSettingsAction`; every save republishes. |
| Publishing | `services/publish.server.ts` | Writes `pickday.config` + `pickday.availability` (app-installation metafields, read by Liquid), Function configs, thank-you config. Storefront never calls the server. |
| Storefront widget | `widget/src/*` → built into `extensions/pickday-theme/assets` | App embed + cart block + product block. Writes cart attributes `_pickday` + readable keys. Gates the checkout button. |
| Checkout | `extensions/pickday-validation` (cart validation Function), `extensions/pickday-delivery` (delivery customization Function) | Backstop for express checkout / direct links; hides non-matching rates. Both available on every plan for public apps. |
| Orders | `routes/webhooks.orders.tsx` → `services/orders.server.ts` | Idempotent, out-of-order safe; counts are rebuilt per date (`services/counts.server.ts`). Tags + order metafield + Flow. |
| Thank-you / order status | `extensions/pickday-thank-you` | Allowed on all plans (not an information/shipping/payment step). |
| Admin order block / actions | `extensions/pickday-admin` + `routes/api.order.$id.tsx`, `api.draft.$id.tsx` | Session-token authenticated. |
| Jobs | `routes/jobs.hourly.tsx`, `jobs.daily.tsx` (cron-job.org, secret header) | Republish, digest, pruning, embed check. |
| Uninstall / GDPR | `webhooks.app.uninstalled.tsx`, `webhooks.compliance.tsx` | Data kept 48 h for reinstall, deleted on `shop/redact`. |

Baseline checks before any change: `npm run typecheck` ✅, `npm run lint` ✅ (0 errors, 21 warnings), `npm test` ✅ (267 passed, 9 DB tests skipped without a database; with a fresh Postgres all 9 pass), `npm run build` ✅, `prisma migrate deploy` on an empty database ✅.

## 1. Bugs

Severity: **C** critical (wrong dates, stuck shoppers, broken install), **M** major, **m** minor.

| # | Sev | File:line | Bug | Root cause | Status |
|---|---|---|---|---|---|
| B1 | C | `core/engine.ts:251-264` | "Same-day" opens **every day** between today and the normal earliest date, and opens the week after a closed day early (e.g. lead 3 working days, Wed 10:00 → Thu/Fri wrongly bookable; on a closed Sunday Mon–Wed wrongly bookable). Same bug in the checkout Function (shares the engine). | `earliest.date` is overwritten with today, so `dayStatus` treats every later date as past the lead time. | ✅ |
| B2 | C | `widget/src/widget.ts` `view()` / `canCheckout()` | Store pickup **without any pickup location** (what the Bakery/Florist/… presets switch on) shows no date picker but still requires a date: the shopper can never check out. | Date picker only renders when `locationId` is set; there is no location to set. | ⬜ |
| B3 | C | `app/services/publish.server.ts:25-36` | After **uninstall + reinstall**, every publish fails until the server restarts: storefront has no config, checkout Functions keep stale rules. | App-installation id cached in memory forever; a reinstall gets a new installation id. | ⬜ |
| B4 | C | `shopify.app.toml`, `.env.example`, `render.yaml` scopes | Install hook queries `shopLocales` which needs `read_locales`; without it `syncShopInfo` throws, the store keeps the UTC time zone and nothing is published on install. | Missing scope. | ⬜ |
| B5 | M | `app/services/counts.server.ts:393-395` | Pickup daily/slot limits never apply when no location is set (counts stored under `pickup:_`, engine reads `pickup`). | Capacity key mismatch. | ✅ |
| B6 | M | `core/postcode.ts` | US ZIP+4 (`10115-1234`) never matches a 5-digit rule or range: US shoppers who type the full ZIP are told "we don't deliver there", and checkout blocks them. | Normalisation keeps all 9 digits. | ✅ |
| B7 | M | `widget/src/main.ts` gate | When a theme's cart drawer isn't recognised, clicking checkout in the drawer is silently blocked (the error is rendered where nobody can see it). | Gate blocks even when no widget is visible. Now: send the shopper to the cart page, where the picker is always placed; never trap them. | ⬜ |
| B8 | M | `core/rules.ts methodsFor` | Pickup is offered in countries where no pickup location serves; the shopper picks it and then has no location to choose. | Location country filter not applied to the method list. | ✅ |
| B9 | M | `webhooks.app.uninstalled.tsx` | Flags survive uninstall (`embedDetected: true`), so after reinstall Home says the embed is on and the checkout Function enforces dates before the embed is checked again. | Flags not reset. | ⬜ |
| B10 | M | Store time zone / currency / languages | Only synced on auth; a merchant who changes the store time zone keeps the old cutoffs until they reopen the app. | No `shop/update` webhook, no periodic sync. | ⬜ |
| B11 | M | Settings strings | A merchant text or label containing `</script>` breaks out of the storefront's JSON `<script>` block (self-XSS, theme breakage). | No check on `</` in published strings. | ⬜ |
| B12 | M | `services/reschedule.server.ts:96` | Changing an order's slot in a delivery **zone** with its own slots saves no slot label. | Slot lookup ignores zone slots. | ✅ |
| B13 | M | `core/engine.ts` + schema | Booking window can be set up to 730 days but the engine only scans 400. | Limits disagree. | ✅ |
| B14 | m | `app.settings.closures.tsx:142,293` | "View them" links ignore the dates (missing `range=custom`). | Link format. | ⬜ |
| B15 | m | `prisma/schema.prisma` | `ProductCount` has no `(shop, date)` index; recounts/prunes scan the table. | Missing index. | ⬜ |
| B16 | m | `services/jobs.server.ts` | Orders without a date (date not required) are never pruned. | `date < x` excludes NULL. | ⬜ |
| B17 | m | `webhooks.compliance.tsx` | `customers/data_request` logs only a count; the merchant can't answer the customer. | Activity entry lacks the order list. | ⬜ |
| B18 | m | `print.server.ts page()` | Printed sheets always left-to-right, also for Arabic/Hebrew admins. | `dir` never set. | ⬜ |
| B19 | m | `_index/route.tsx` | Public landing page still shows template placeholder text ("A short heading about [your app]") — App Store reviewers see it. | Template leftover. | ⬜ |
| B20 | m | `.env.example` / README | Neon pooled URL without `pgbouncer=true` can cause "prepared statement already exists" errors with Prisma on Neon's transaction pooler. | Docs. | ⬜ |

Checked and **not** bugs (kept): cutoff boundary (`>=` at exactly the cutoff = next day), leap days and yearly ranges over New Year (`core/civil.ts`), DST conversion (`zonedToUtc`), idempotent/out-of-order order webhooks, express checkout (validation Function is the backstop), counts rebuilt not incremented, shop scoping on every query, jobs secret compare, CSV formula injection guard.

Known limitation kept (documented in DECISIONS D-09): two shoppers can book the last spot within the same few seconds; the counts republish ~3 s after each order and the Function re-checks at checkout. A hard reservation would need the server during checkout (not free-tier safe).

## 2. UX problems

Admin
1. Navigation is organised by data type, not by task: 8 menu items plus a Settings hub with 10 cards. Turning on pickup needs 4 pages (Methods → Schedule → Slots & capacity → Pickup locations). → **Regroup into 7 task pages with an icon bar on top of every page.**
2. No real setup wizard: a "welcome" box with business type + country, then a 6-item checklist pointing at 6 different pages. → **3-step wizard (country & business, what you offer + pickup address, turn on the embed).**
3. The "live preview" on the Widget page is a static mock with fake dates; it doesn't show the merchant's real days, holidays or slots. → **Preview driven by the real date engine and the unsaved settings, shown next to the delivery/pickup rules too.**
4. Country only influences the holiday importer. Weekends, date format and first day of the week are US defaults everywhere. → **Country picker with per-country defaults.**
5. Holidays need a modal, a country select and ticking each holiday. → **One click: "Add {country} public holidays" (still editable).**
6. Free plan can't use closures/holidays, slots or more than one method — the app looks broken for new stores (Christmas bookable). → **Free plan gets every scheduling basic.**
7. Pages for removed concepts / jargon ("Methods & countries", "Slots & capacity", "Checkout matching") → plain words ("Local delivery", "Time slots and daily limits", "Show only the matching shipping option at checkout").
8. "View them" links on closures ignored dates (B14).

Storefront widget
1. Pickup without an address breaks checkout (B2).
2. Drawer themes not recognised trap the shopper (B7).
3. No place for delivery instructions / gift message — one of the most requested extras. → **Optional "Delivery instructions" box (saved as an order attribute).**
4. Dates are always written in the locale's long style; merchants who print `MM/DD/YYYY` want that on packing slips. → **Date format setting** for the saved order date and the shopper summary.

App Store reviewer view
1. Template placeholder text on the public page (B19).
2. Missing scope makes install fail silently (B4).
3. GDPR data request answer is weak (B17).

## 3. Features: add / change / remove

| Change | Why | Status |
|---|---|---|
| **Top icon navigation** on every page (Home, Orders, Delivery, Pickup, Days off, Appearance, Settings, Help) + matching Shopify sidebar menu | Merchant can reach anything in one click, also on mobile (scrolls sideways). | ⬜ |
| **Delivery page**: Local delivery and Shipping, each on one page: on/off, name, days, lead time, cutoff, same-day, time slots, daily limits, where offered, minimum order, live preview | Replaces Methods + Schedule + Slots & capacity (3 pages). | ⬜ |
| **Pickup page**: on/off, default hours and slots, pickup locations with their own hours/limits/blocked dates | Replaces Methods (pickup) + Schedule + Pickup locations. | ⬜ |
| **Days off page**: holidays (one-click per country), closures, recurring yearly dates, vacation mode, special open days | Renamed Closures; one-click holidays. | ⬜ |
| **Appearance page**: colours, labels, layout, texts per language, real live preview | Renamed Widget & text; preview uses the engine. | ⬜ |
| **Settings page**: Store country & regional defaults, date format, first day of week, shopper options (method order, default, date mode, delivery instructions), links to Product rules, Fees, Checkout, Notifications, Import/Export, Plan | One place for everything that isn't a schedule. | ⬜ |
| **Setup wizard** (3 steps, < 2 minutes) | Merchant goes live fast; creates a pickup location from the address so pickup works at once. | ⬜ |
| **Country defaults** (`core/regions.ts`): working days, weekend, date format, first day of week for ~70 countries + fallback | Worldwide correctness. | ⬜ |
| **Date format** setting (auto / MM/DD/YYYY / DD/MM/YYYY / YYYY-MM-DD / written month) | Requested; used for the order's "Delivery date" and the shopper summary. | ⬜ |
| **Delivery instructions** field in the widget (optional, per method) | Most requested extra; free. | ⬜ |
| **Next 14 days** load chart on Home | See busy days at a glance. | ⬜ |
| **Generous Free plan**: all methods, time slots, holidays/closures, 1 location, 50 orders/month. Starter: limits, checkout matching, 3 locations, 500 orders. Pro: everything. | New stores get a working picker; paid plans still sell capacity and advanced rules. | ⬜ |
| `shop/update` webhook + daily sync of time zone/currency/languages | B10. | ⬜ |
| Remove: Methods, Schedule, Slots & capacity pages and their routes (merged); template landing copy | Less to learn. | ⬜ |

## 4. Order of work

1. ✅ Audit (this file).
2. ✅ Critical/major engine + server bugs B1–B6, B8, B12, B13 with tests.
3. ⬜ Data/infra: scopes (B4), uninstall/reinstall (B3, B9), `shop/update` (B10), schema index (B15), pruning (B16), GDPR (B17), `</` guard (B11), Neon docs (B20), fresh single migration.
4. ⬜ Regional defaults + date format + holidays one-click (core + server).
5. ⬜ Widget: B2, B7, date format, delivery instructions; rebuild assets; storefront translations (28 languages).
6. ⬜ Admin redesign: icon nav, Delivery, Pickup, Days off, Appearance, Settings, wizard, Home chart, engine preview; remove merged pages; plan changes.
7. ⬜ Admin translations (8 languages) for new text.
8. ⬜ Docs: README (Render + Neon + Partner Dashboard), DECISIONS, CHECKLIST, PRIVACY, `.env.example`, `render.yaml`.
9. ⬜ Verification: re-read changed files, tricky date tests (time zones, DST, holidays, cutoff boundary, month/year ends, leap day), full install → order flow review, typecheck, lint, tests, build, browser test.
