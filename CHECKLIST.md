# Build checklist

Updated after every phase. "Needs a live store" means the step can only be checked on a Shopify development store with the app installed (see README → "What I need from you").

## Phase status

| Phase | Status | What works |
|---|---|---|
| P1 Skeleton | ✅ Done | App template, Postgres schema + migration, install hook (shop row, default settings, publish), uninstall + privacy webhooks, `/healthz`, navigation with every page, admin i18n framework, Render blueprint. |
| P2 Engine + schedule settings | 🟡 In progress | Date engine + 30 automated tests. |
| P3 Storefront widget | ⏳ | |
| P4 Functions, webhooks, extensions | ⏳ | |
| P5 Orders, production, notifications, jobs | ⏳ | |
| P6 Locations, areas, product rules, surcharges | ⏳ | |
| P7 Billing, import/export, help, polish | ⏳ | |

## How to test P1 (needs a live store)

1. Deploy (README → Render) and install the app on a development store.
2. The app opens on **Home**. The left menu shows Home, Orders, Production, Settings, Widget & text, Notifications & integrations, Plans, Help.
3. Click each menu item: every page opens with a title and a one-line subtitle.
4. Open `https://<your-render-url>/healthz` in a browser: it shows `ok` instantly.
5. In Neon's SQL editor run `select shop, "timeZone", plan from "Shop";` — your store is listed with its time zone.

## Automated checks (run `npm test`)

- Date engine: lead time, per-weekday cutoffs, working-day counting, closures, special open days, vacation, booking window, launch date, product restrictions, extra lead time, daily limits, capacity by orders and by items, slot limits, per-date overrides, admin overrides, multiple time zones, DST, leap years, country rules, postcode ranges, zones, surcharges.
