# Pickday: Delivery Date Picker

*Let customers pick the day. Delivery, pickup and shipping dates with time slots, holidays and daily limits, for every Shopify plan.*

Pickday is a public Shopify app. Shoppers choose a delivery date, pickup date or shipping date (and optionally a time slot and delivery instructions) in the cart, cart drawer or on the product page. Checkout then shows only the matching shipping option and stops the order if the date is missing or no longer valid. Merchants see their orders by day, print day sheets, route sheets and production lists, follow them in their own calendar app, and get a free daily summary email through Shopify Flow. Customers can change their own date from their order page. Pickday itself sends no emails.

It works on **every Shopify plan** (no Shopify Plus features: a theme app extension, cart attributes and Shopify Functions, which public apps may use on all plans) and runs for **$0 a month**: one free Render web service, a free Neon Postgres database and free cron-job.org pings. No email service is needed. The storefront and checkout never call the server (settings live inside each store as app-owned metafields), so shoppers are never affected when the free server sleeps.

| File | What's in it |
|---|---|
| `AUDIT.md` | The latest audit: every bug found and fixed, UX problems, features added/removed, verification |
| `PLAN.md` | How the code is organised, data model, how each part works |
| `DECISIONS.md` | Every choice made where the brief was unclear, and why |
| `CHECKLIST.md` | Click-by-click test steps on a development store |
| `PRIVACY.md` | What data is stored, for how long, and how it's deleted |
| `ROADMAP.md` | Ideas for later versions |
| `TRANSLATIONS.md` / `TRANSLATION_REVIEW.md` | How the 28 storefront languages were made and checked |
| `docs/APP_STORE_LISTING.md` | Draft App Store listing |
| `.env.example` | Every setting the server needs |

## What merchants get

- **Setup wizard** (under 2 minutes): country, business type, how customers get their order, pickup address, days, notice, cut-off time, public holidays, then turn on the app embed. A live preview shows the real picker while they answer.
- **Icon navigation** on every page: Home, Orders, Delivery, Pickup, Days off, Appearance, Settings, Help.
- **Delivery**: local delivery and shipping, each with working days, notice (hours or working days), cut-off (one time or per weekday), same-day option, booking window, time slots, daily and per-slot limits, countries, minimum order, delivery areas by postcode / area / region, and zones with their own days and limits.
- **Pickup**: any number of pickup locations, each with its own hours, slots, limits, time zone and days off; or pickup at the store with no location set up.
- **Days off**: public holidays for ~200 countries switched on with one click and renewed every year automatically (any single holiday can be skipped), closed days and yearly dates, vacation mode, special opening days, a year calendar, per-location days off.
- **Worldwide**: country selector that loads the usual working days (Friday–Saturday, Thursday–Friday and Saturday-only weekends included), first day of the week and date format; date format setting (store language, written month, MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD); 28 storefront languages with right-to-left Arabic and Hebrew; the admin in 8 languages; every cut-off and "today" in the store's time zone (or a pickup location's own).
- **Appearance**: colours (text on the accent colour stays readable automatically), corners, calendar or dropdown, compact layout, icons, position above or below the checkout button, cart drawer on/off, optional notes box (delivery instructions or gift message), every text per language, and a live preview that runs the real storefront widget with the unsaved settings.
- **Orders**: list and calendar with filters, CSV export, day and route sheets, production list, bulk date changes, date changes from the Shopify order page, a next-14-days chart and "Close a day" on Home.
- **Daily summary email**, free: Pickday fires a "Daily schedule" Shopify Flow trigger at the hour you choose, and Flow's free **Send internal email** action mails tomorrow's (or today's) orders to you and your staff. No email service or API key.
- **Customers change their own date** from their order in Shopify's customer accounts, until a deadline you set (for example 24 hours before), only to dates the cart would offer, with the same limits.
- **Product rules**, **delivery fees**, **checkout matching**, **notifications** (date snippets for Shopify's order emails, calendar feed, Shopify Flow) and **import/export**.

Plans: **Free** (every method, time slots, holidays, closed days, notes, daily summary, 1 pickup location, 50 scheduled orders a month), **Starter $7.99** (daily and per-slot limits, checkout matching, customer date changes, 3 locations, 500 orders), **Pro $14.99** (everything, unlimited). Development stores get Pro free.

---

## Deploy it for the first time (Render + Neon)

These steps need your accounts. Do them in this order; each says where to click. Allow about 45 minutes.

### 1. Create the app in the Shopify Partner Dashboard

1. Go to [partners.shopify.com](https://partners.shopify.com) → **Apps** → **Create app** → **Create app manually**.
2. Name it `Pickday: Delivery Date Picker` and click **Create**.
3. On the app's page copy the **Client ID** and **Client secret** into a note (steps 3 and 4).
4. The app's page URL ends with the app handle (for example `pickday-delivery-date-picker`). Write it down: it's `SHOPIFY_APP_HANDLE`.

### 2. Create the database (Neon, free)

1. Sign up at [neon.tech](https://neon.tech) → **New project** → name `pickday`, region close to your Render region (Frankfurt = `aws-eu-central-1`, Ohio = `aws-us-east-2`).
2. On the project dashboard click **Connect**. Copy the connection string with **Connection pooling** on: that's `DATABASE_URL`. Add `&pgbouncer=true&connect_timeout=15` at its end.
3. Turn **Connection pooling** off and copy again: that's `DIRECT_URL` (used only for migrations). Add `&connect_timeout=15`.

The tables are created automatically on the first start (`prisma migrate deploy`); the single migration works on an empty database.

### 3. Put the server online (Render, free)

1. Sign up at [render.com](https://render.com) with your GitHub account.
2. Click **New** → **Blueprint** → choose this repository → **Apply**. Render reads `render.yaml` and creates the `pickday` web service (Node 22, free plan, health check `/healthz`).
3. Open the service → **Environment** and fill in:

| Variable | Value | Required |
|---|---|---|
| `SHOPIFY_API_KEY` | Client ID from step 1 | yes |
| `SHOPIFY_API_SECRET` | Client secret from step 1 | yes |
| `SHOPIFY_APP_URL` | The service URL shown at the top, e.g. `https://pickday.onrender.com` (no slash at the end) | yes |
| `SHOPIFY_APP_HANDLE` | App handle from step 1 | yes |
| `SCOPES` | Pre-filled by `render.yaml` (same list as `shopify.app.toml`) | yes |
| `DATABASE_URL` | Pooled Neon URL from step 2 | yes |
| `DIRECT_URL` | Direct Neon URL from step 2 | yes |
| `JOBS_SECRET` | Generated by Render; click the eye icon and copy it for step 5 | yes |
| `NODE_ENV` | `production` (pre-filled) | yes |
| `NODE_VERSION` | `22.12.0` (pre-filled) | yes |
| `BILLING_TEST` | `false` (pre-filled). Set `true` only while testing charges on a real store | yes |
| `SUPPORT_EMAIL` | Your support address (shown on the Help page and the public page) | recommended |
| `SHOP_CUSTOM_DOMAIN` | Only for Shopify-internal custom admin domains; leave unset | no |

`PORT` is set by Render; `HOST` and `FRONTEND_PORT` are only used by `shopify app dev`.

4. Click **Save changes** and wait for the deploy to say **Live**. Open `https://<your-service>.onrender.com/healthz`: it shows `ok`.

### 4. Connect the code to your app and deploy the extensions

On your computer (needs [Node.js 22](https://nodejs.org) and Git):

```bash
git clone https://github.com/bishnusingh698-pixel/Delivery-app.git
cd Delivery-app
npm ci
```

Open `shopify.app.toml` and replace `https://pickday.onrender.com` with your Render URL in `application_url` and `redirect_urls`. Then:

```bash
npx shopify app config link        # choose the app from step 1; keep the existing settings
npm run deploy                     # uploads the theme extension, both Functions, the thank-you, customer account and admin extensions, Flow triggers
```

`npm run deploy` first writes your Render URL (from `shopify.app.toml`) into the customer account extension, then asks you to confirm the release: type `y`. This also registers the webhooks (orders, uninstall, shop update, theme changes, billing and the three mandatory privacy webhooks) and the access scopes.

### 5. Scheduled jobs and keep-awake (cron-job.org, free)

Sign up at [cron-job.org](https://cron-job.org) and create 3 jobs (**Create cronjob**):

| Title | URL | Schedule | Advanced |
|---|---|---|---|
| Pickday keep-awake | `https://<your-service>.onrender.com/healthz` | Every 10 minutes | Method GET |
| Pickday hourly | `https://<your-service>.onrender.com/jobs/hourly` | Every hour at minute 2 | Method **POST**, header `X-Pickday-Secret` = your `JOBS_SECRET` |
| Pickday daily | `https://<your-service>.onrender.com/jobs/daily` | Every day at 03:10 | Method **POST**, header `X-Pickday-Secret` = your `JOBS_SECRET` |

Click **Test run** on each: keep-awake answers `ok`, the others `started` (status 202). A 403 means the secret doesn't match. The hourly job rolls each store's dates and public holidays forward and fires the "Daily schedule" Flow trigger at each store's chosen hour; the daily job prunes old data, re-checks the app embed and syncs the store's time zone.

### 6. Partner Dashboard settings

1. **API access** → **Protected customer data access** → **Request access**. Select **Protected customer data** and the fields **Name**, **Address** and **Phone**, with the reason "Printed delivery day sheets and route sheets. Addresses, phone numbers and delivery instructions are read live when the merchant prints and never stored; only the order number and the customer's first name are stored." Answer the data protection questions with `PRIVACY.md`. Order webhooks need this approval to reach a live store.
2. **API access** → **Allow network access in checkout and account UI extensions** → **Allow network access**. The "Change date" button on the customer's order page (extension `pickday-customer-change`) calls your Render URL; without this approval Shopify doesn't let it load.
3. **App setup** → **Embedded app**: on (already set by `shopify.app.toml`).
4. **Distribution** → **Shopify App Store** (public). Charges are created by the app itself with Shopify's Billing API (Starter and Pro, 14-day trials), so leave Shopify's "Managed pricing" off and describe the three plans in the listing's pricing section.

### 7. Test on a development store

Partner Dashboard → **Stores** → **Add store** → **Development store**. Then your app → **Test your app** → choose the store → **Install**. The app opens on the setup wizard. Follow `CHECKLIST.md`.

### 8. Before submitting to the App Store

1. In Render, check `BILLING_TEST` is `false`.
2. Set `SUPPORT_EMAIL`, and the website in `app/config/brand.ts`.
3. Publish `PRIVACY.md` as a web page (for example GitHub Pages) and use its link in the listing.
4. Copy `docs/APP_STORE_LISTING.md` into **Distribution** → **Create listing**, add screenshots, submit.

Once you have more than about 100 active stores, move Render to a paid instance for instant admin loading. No code changes are needed.

---

## Running it on your computer (developers)

```bash
npm ci
cp .env.example .env               # fill in at least DATABASE_URL and DIRECT_URL
npx prisma migrate deploy          # create the tables
npm run dev                        # Shopify CLI: tunnel, install link, hot reload
```

A local Postgres works too: `DATABASE_URL=postgresql://user:pass@localhost:5432/pickday` (same value for `DIRECT_URL`).

### Checks

```bash
npm run typecheck                  # TypeScript: app, core, widget and extensions
npm run lint
npm test                           # unit, render and (with DATABASE_URL) database tests
npm run build                      # builds the widget (fails over 35 KB gzipped) and the app
npm run test:browser               # headless Chromium: widget fixes, 28 languages, RTL, 320 px, admin live preview
```

GitHub Actions runs all of these on every push (`.github/workflows/ci.yml`), with a Postgres service for the database tests.

### Where things are

- `core/` — the date engine and all rules, shared by the admin, the storefront widget and the checkout Functions (no `Intl` in Function code paths).
- `widget/` — the storefront widget; `npm run build:widget` writes it into `extensions/pickday-theme/assets/` (commit the result). The admin's live preview imports the same code.
- `extensions/` — theme app extension, validation Function, delivery customization Function, thank-you/order status block, admin order block and actions, Flow triggers.
- `app/` — the embedded admin (React Router, Polaris web components, App Bridge), webhooks, scheduled jobs.
- `locales/storefront/` — 28 shopper languages; `app/i18n/admin/` — 8 admin languages.

## Costs at 100 stores

| Service | Free allowance | Pickday's use |
|---|---|---|
| Render web service | 750 instance hours/month, sleeps after 15 min idle | One service, kept awake by a 10-minute ping |
| Neon Postgres | 0.5 GB storage, scales to zero | One small JSON settings row per store, one row per order, old rows pruned daily; the keep-awake ping never touches the database |
| cron-job.org | Unlimited jobs | 3 jobs |

Public holidays come from the bundled open-source `date-holidays` dataset: no paid API.

## Support

Merchant help is inside the app (**Help**: getting started, questions and answers, diagnostics). Support email: `SUPPORT_EMAIL`.
