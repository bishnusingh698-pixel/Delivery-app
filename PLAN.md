# Pickday — build plan

Pickday lets shoppers choose a delivery date, pickup date or shipping dispatch date (plus an optional time slot) on the cart page, cart drawer or product page. Shopify Functions make checkout match that choice and block checkout when the choice is missing or invalid.

This file is the map of the code. Decisions and deviations from the brief are in `DECISIONS.md`; progress and test steps are in `CHECKLIST.md`.

## 1. Architecture

```
                       ┌─────────────────────────────── Shopify ────────────────────────────────┐
 Merchant (admin) ───► │ Embedded admin (App Bridge + Polaris web components)                   │
                       │   └─ iframe ► Render web service (React Router app)                    │
                       │ Admin UI extensions: order block, order action, draft-order action     │
                       │                                                                        │
 Shopper ───────────►  │ Online Store theme                                                      │
                       │   └─ Theme app extension: app embed + "cart" block + "product" block    │
                       │        reads  app.metafields.pickday.config / .availability  (Liquid)   │
                       │        writes cart attributes / line properties (/cart/update.js)       │
                       │ Checkout                                                                │
                       │   ├─ Validation Function      (reads its own metafield config)          │
                       │   ├─ Delivery customization   (reads its own metafield config)          │
                       │   └─ Thank-you / order status UI extension (reads order attributes)     │
                       │ Webhooks ─────────────────────────────────────────────────┐             │
                       └───────────────────────────────────────────────────────────┼─────────────┘
                                                                                   ▼
              cron-job.org ──► GET /healthz (no DB)        ┌──────────────────────────────────┐
                          ──► POST /jobs/hourly|daily ───► │ Render free web service (Node)   │
                                                           │  React Router + Prisma           │──► Neon Postgres (free)
                                                           │  publishes JSON to metafields    │──► Shopify Flow (daily summary)
                                                           └──────────────────────────────────┘
```

Key property: the storefront and the Functions never need the server. The server writes everything the shopper side needs into app-owned metafields when settings are saved, when an order changes capacity, and once an hour.

## 2. Repository layout

```
core/                         Shared, pure TypeScript. No I/O. Used by admin, widget, Functions, jobs.
  civil.ts                    Civil-date math without Intl (works inside Functions).
  tz.ts                       Time-zone helpers using Intl (browser + server only).
  types.ts                    Settings, published config, availability, selection types.
  defaults.ts                 Default settings + business-type presets.
  engine.ts                   The date engine: calendar, earliest date, selection check.
  rules.ts                    Product rules, country rules, mixed-cart logic.
  postcode.ts                 Postcode rule parsing and matching.
  selection.ts                Encode/decode the hidden cart attribute.
  publish.ts                  Settings ► compact storefront config / Function config.
  i18n/format.ts              ICU-style message formatter (placeholders + plurals).
  i18n/locales.ts             The 28 storefront locales, RTL list, locale matching.
locales/storefront/*.json     Shopper-facing strings, 28 locales (source of truth).
locales/storefront/_context.json  Context notes for every English string.
app/                          Embedded admin + server (Shopify React Router template).
  config/brand.ts             Branding: name, colours, logo, support email.
  i18n/admin/*.json           Admin strings (en, es, fr, de, pt, it, nl, ja).
  components/                 Small Polaris wrappers, settings form helpers.
  models/*.server.ts          Prisma access, always scoped by shop.
  services/*.server.ts        Publishing, Shopify GraphQL, orders, billing, Flow, holidays.
  routes/                     Pages, webhooks, jobs, feeds, APIs.
widget/src/                   Storefront widget (vanilla TypeScript, built with esbuild).
extensions/
  pickday-theme/              Theme app extension (embed + 2 blocks + built assets).
  pickday-validation/         Cart & checkout validation Function (JS).
  pickday-delivery/           Delivery customization Function (JS).
  pickday-thank-you/          Thank-you + order status block (checkout UI extension).
  pickday-order-block/        Admin order details block.
  pickday-order-action/       Admin action: orders.
  pickday-draft-action/       Admin action: draft orders.
  pickday-flow-*/             Flow triggers (created / changed / cancelled).
scripts/                      Build helpers (widget, locale bundles, translation checks).
tests/                        Vitest suites (engine, i18n, Functions, widget).
prisma/                       Schema + migrations (PostgreSQL / Neon).
```

## 3. Data model (Prisma)

| Table | Purpose |
|---|---|
| `Session` | Shopify sessions (template). |
| `Shop` | One row per store: domain, status, plan, time zone, currency, locales, flags (welcome done, checklist), share/feed tokens, warnings. |
| `Settings` | One row per shop: `data` JSON (whole settings document, validated with zod), `version`. |
| `ScheduledOrder` | One row per scheduled order: shop, order id/name, first name, method, date, slot, location, zone/area, status, items JSON, source updated-at (for out-of-order webhooks), history. |
| `ScheduledItem` | Per-item mode lines: date/slot per line. |
| `CapacityCount` | Materialised counts per shop + capacity key + date (+ slot): orders, items. Rebuilt from `ScheduledOrder` for the affected dates on every change. |
| `ProductCount` | Product daily-limit counts per shop + rule + date (+ location). |
| `ActivityLog` | Settings changes and manual date changes (90-day retention). |
| `DigestLog` | One row per shop per day sent (unique) — guarantees one daily summary per day. |
| `ShareCode` | One-time settings share codes (24 h). |
| `WebhookLog` | Webhook ids already processed (idempotency, 7-day retention). |

Settings live in one JSON document because they are always read, validated, published, exported and imported together. That keeps Neon traffic to one small query per page load. See DECISIONS.md D-07.

## 4. Metafields (all app-owned)

| Owner | Namespace / key | Reader | Content |
|---|---|---|---|
| App installation | `pickday` / `config` | Theme extension (Liquid → widget) | `StorefrontConfig` (below) |
| App installation | `pickday` / `availability` | Theme extension | `Availability` (counts for the booking window) |
| Validation | `$app:pickday` / `config` | Validation Function | `FunctionConfig` |
| Validation | `$app:pickday` / `vars` | Validation Function input variables | `{ ruleTags: string[], ruleCollections: string[] }` |
| Delivery customization | `$app:pickday` / `config` | Delivery Function | `DeliveryConfig` |
| Order | `$app:pickday` / `schedule` | Flow, reports, other apps | `OrderSchedule` |

### StorefrontConfig (compact JSON, keys shortened in code comments)

```jsonc
{
  "v": 3,                       // settings version
  "tz": "Europe/Berlin",        // store IANA zone
  "pl": "de",                   // store primary locale (readable attributes)
  "plan": "pro",                // feature gates the widget respects
  "mode": "order",              // "order" | "item"
  "mixed": "any",               // "any" | "all"
  "methods": [                  // in display order
    { "id": "delivery", "on": true, "countries": ["DE"], "req": true, "slots": true,
      "meaning": "delivery", "min": 30, "names": {"de": "Lieferung"},
      "sched": { "wd": [1,2,3,4,5], "lead": {"n":1,"u":"d","work":true},
                 "cut": {"all":"14:00","wd":[null,null,null,null,null,null,null]},
                 "same": {"on":false,"cut":"10:00"}, "win": 30, "nb": null, "tt": true },
      "cap": { "unit": "items", "day": 50, "wdMax": null, "slots": [{"id":"s1","a":"10:00","b":"12:00","wd":[1,2,3,4,5],"max":10,"fee":null}],
               "hide": 60, "low": 3, "ovr": [{"d":"2027-02-14","day":200,"slots":null}] } }
  ],
  "locations": [{ "id":"l1","name":"Main St","addr":"…","map":"https://…","tz":null,"countries":"all","ins":{"en":"…"},"custom":null }],
  "closures":  [{ "a":"2026-12-25","b":"2026-12-26","y":true,"m":"all","l":"all","lbl":"Christmas","k":"holiday","shift":false }],
  "specials":  [{ "d":"2027-05-09","m":"all","l":"all","slots":null,"day":null }],
  "vacation":  { "on": false, "a": null, "b": null, "msg": {} },
  "areas":     { "DE": { "mode":"postcode", "rules":["10115-10999","20*"], "ask": true } },
  "zones":     [{ "id":"z1","name":"North","country":"DE","match":{"pc":["10115-10199"],"areas":[],"regions":[]},
                  "sched": { /* partial overrides */ }, "cap": null }],
  "rules":     { "exclude": T, "lead": [{"t":T,"days":2}], "restrict": [{"t":T,"wd":[5,6],"r":[["04-10","04-18",true]],"d":[]}],
                 "limits": [{"id":"r1","t":T,"max":40,"loc":false,"name":"Sourdough"}], "methods": [{"t":T,"m":["pickup"]}],
                 "colProducts": {"gid…": ["123","456"]} },
  "fees":      [{ "id":"f1","kind":"weekday","wd":[0],"amt":"5.00","vid":"4711" }],
  "widget":    { "theme":"match","accent":"#1f6feb","radius":8,"input":"calendar","compact":false,"icons":true,
                 "spots":true,"pre":false,"drawerSel":"","css":"","brand":true },
  "texts":     { "de": { "heading": "Wann möchten Sie Ihre Bestellung?" } },   // merchant overrides only
  "debugUntil": null
}
```
`T` (target) = `{ "p": [productIds], "v": [variantIds], "c": [collectionIds], "g": [tags] }`.

### Availability

```jsonc
{ "v": 1, "at": "2026-10-16T08:00:00Z",
  "c": { "delivery": { "2026-10-18": [12, 30, { "s1": [2, 5] }] },   // [orders, items, slots{id:[orders,items]}]
         "pickup:l1": { … } },
  "p": { "r1": { "2026-10-18": 40 } } }                                // product limits (rule[@location])
```

### FunctionConfig (validation)
Same shapes as StorefrontConfig but without widget, texts (except validation-message overrides), counts and display-only fields. Kept well under 10 KB for normal shops; large postcode lists are dropped from the Function copy (the Function then falls back to method-level rules, see D-11).

## 5. Function inputs and outputs

**Validation** (`cart.validations.generate.run`):
- Input: `buyerJourney.step`, `cart.attribute(_pickday)`, lines (qty, `attribute(_pickday)`, merchandise: variant id, product id, `isGiftCard`, `requiresShipping`, `hasTags(tags:$ruleTags)`, `inCollections(ids:$ruleCollections)`), delivery address country/zip/province, `cost.subtotalAmount`, `localization.language/country`, `presentmentCurrencyRate`, `shop.localTime.date` + 48 `timeAfter` aliases (current time to the half hour), `validation.metafield(config)`.
- Output: `{ operations: [{ validationAdd: { errors: [{ message, target: "$.cart" }] } }] }`. Never blocks during `CART_INTERACTION` (so adding to cart is never blocked).

**Delivery customization** (`cart.delivery-options.transform.run`):
- Input: `cart.attribute(_pickday)`, delivery groups → options (handle, title, deliveryMethodType), `localization.language`, `deliveryCustomization.metafield(config)`.
- Output: `deliveryOptionHide` for non-matching options, `deliveryOptionRename` for kept options. If nothing would remain, no hide operations at all.

## 6. Cart data written by the widget

Readable cart attributes (fixed English keys; values in the store's main language):
`Delivery method`, `Delivery date` (e.g. `Freitag, 18. Oktober 2026 (2026-10-18)`), `Time slot`, `Pickup location`, `Delivery area`.
Hidden attribute `_pickday`: `{"v":1,"m":"pickup","d":"2026-10-18","s":"s1","t":"10:00-12:00","l":"l1","z":"z1","a":"10117","c":"DE","lbl":"Fr., 18. Okt., 10:00–12:00","lc":"de"}`.
Per-item mode: line properties `Delivery date`, `Time slot` (readable) and `_pickday` (`{"d":…,"s":…,"t":…,"lbl":…}`) on each line, method/location in the cart attribute.

## 7. Translation file structure

- `locales/storefront/en.json`: flat keys, ICU-style messages, e.g. `"spotsLeft": "{count, plural, one {# spot left} other {# spots left}}"`.
- `locales/storefront/_context.json`: per key, where it shows, max length, placeholders.
- 27 more files with identical keys. `scripts/check-translations.ts` (run in tests) checks keys, placeholders, plural forms per `Intl.PluralRules`, and English leftovers.
- Build: `scripts/build-widget.mjs` emits `extensions/pickday-theme/assets/pickday-i18n-<locale>.js` (one small file per locale, only the active one is loaded), and the Functions/thank-you extension import the JSON at build time.
- Admin: `app/i18n/admin/<lang>.json`, nested keys, English fallback. Adding a language = add a file + one line in `app/i18n/index.ts`.

## 8. Build phases

| Phase | Scope |
|---|---|
| P1 | Template, auth, install/uninstall, privacy webhooks, nav with all pages, Render/Neon config, `/healthz`, i18n frameworks. |
| P2 | Date engine + tests; Methods & countries, Schedule (preview + simulate time), Slots & capacity, Closures & holidays; publishing. |
| P3 | Storefront widget: embed + blocks, cart page, drawer, product page, translations, RTL, markets, re-validation, required enforcement. |
| P4 | Validation + delivery Functions, order webhooks, tags, metafields, counts, thank-you block, admin block + actions. |
| P5 | Orders (list, calendar, detail, change, bulk reschedule, CSV, day/route sheets), Production, Notifications (digest, snippets, ICS, Flow), jobs. |
| P6 | Locations, delivery areas, product rules, date-per-item, surcharges. |
| P7 | Billing + gating, import/export + share codes, activity log, help, onboarding, a11y/perf pass, translation review, listing draft. |
