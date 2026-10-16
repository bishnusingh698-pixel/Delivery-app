# Pickday: Delivery Date Picker

*Let customers pick the day. Never get more orders than you can handle.*

Pickday is a public Shopify app. Shoppers choose a delivery date, pickup date or shipping dispatch date (and optionally a time slot) in the cart, cart drawer or on the product page. Checkout then shows only the matching shipping option and blocks the order if the date is missing or no longer valid. Merchants see their orders by day, print day sheets, route sheets and production lists, and get a daily summary email.

It is built to run for **$0 a month for up to about 100 stores**: one free Render web service, a free Neon Postgres database, free cron-job.org pings and the free Brevo email plan. The storefront and checkout never call the server (settings are saved inside each store as app-owned metafields), so shoppers are never affected when the free server is asleep.

Other documents:

| File | What's in it |
|---|---|
| `PLAN.md` | How the code is organised, data model, how each part works |
| `DECISIONS.md` | Every choice made where the brief was unclear, and why |
| `CHECKLIST.md` | Phase status, click-by-click test steps, acceptance test results |
| `PRIVACY.md` | What data is stored, for how long, and how it's deleted |
| `ROADMAP.md` | Ideas for later versions |
| `TRANSLATIONS.md` / `TRANSLATION_REVIEW.md` | How the 28 storefront languages were made and checked |
| `docs/APP_STORE_LISTING.md` | Draft App Store listing (English + 6 languages) |
| `.env.example` | Every setting the server needs |

---

## What I need from you

These are the steps only you can do (they need your accounts). Do them in this order. Each step says where to click.

1. **Create the app in the Partner Dashboard.**
   1. Go to [partners.shopify.com](https://partners.shopify.com) → **Apps** → **Create app** → **Create app manually**.
   2. Name it `Pickday: Delivery Date Picker`. Click **Create**.
   3. On the app's page, copy the **Client ID** and **Client secret** into a note. You need them in step 4.
   4. Look at the browser address bar: the app's page URL ends with the app handle (for example `pickday-delivery-date-picker`). Write it down: it's `SHOPIFY_APP_HANDLE`.
2. **Create the database (Neon, free).**
   1. Sign up at [neon.tech](https://neon.tech) → **New project** → name `pickday`, region close to your Render region (Frankfurt = `aws-eu-central-1`).
   2. On the project dashboard click **Connect**. Copy the connection string with **Pooled connection** turned on: that's `DATABASE_URL`. Turn **Pooled connection** off and copy again: that's `DIRECT_URL`.
3. **Create the email account (Brevo, free, optional).** Only needed for the merchant daily summary email.
   1. Sign up at [brevo.com](https://www.brevo.com). Go to **Senders, Domains & Dedicated IPs** → **Domains** → add your domain and follow the DNS steps (so emails aren't marked as spam).
   2. Go to **SMTP & API** → **API Keys** → **Generate a new API key**. Copy it: that's `BREVO_API_KEY`. Your sender address (e.g. `digest@yourdomain.com`) is `EMAIL_FROM`.
4. **Put the server online (Render, free).**
   1. Sign up at [render.com](https://render.com) with your GitHub account.
   2. Click **New** → **Blueprint** → choose this repository → **Apply**. Render reads `render.yaml` and creates the `pickday` web service.
   3. Open the service → **Environment** and fill in: `SHOPIFY_API_KEY` (Client ID), `SHOPIFY_API_SECRET` (Client secret), `SHOPIFY_APP_URL` (the service URL shown at the top, e.g. `https://pickday.onrender.com`, no slash at the end), `SHOPIFY_APP_HANDLE`, `DATABASE_URL`, `DIRECT_URL`, and optionally `BREVO_API_KEY`, `EMAIL_FROM`, `SUPPORT_EMAIL`. `JOBS_SECRET` is generated for you; click the eye icon and copy it for step 6.
   4. Click **Save changes**. Wait for the deploy to say **Live**. Open `https://<your-service>.onrender.com/healthz`: it shows `ok`.
5. **Connect the code to your app and deploy the extensions.** On your computer (needs [Node.js 22](https://nodejs.org) and Git):
   ```bash
   git clone https://github.com/bishnusingh698-pixel/Delivery-app.git
   cd Delivery-app
   npm ci
   npx shopify app config link        # choose the app from step 1
   npm run deploy                     # uploads the theme extension, Functions, checkout and admin extensions
   ```
   When `config link` asks, keep the existing `shopify.app.toml` settings. Before deploying, open `shopify.app.toml` and replace `https://pickday.onrender.com` with your Render URL everywhere it appears. `npm run deploy` asks you to confirm the release: type `y`.
6. **Keep the server awake and run the scheduled jobs (cron-job.org, free).** Sign up at [cron-job.org](https://cron-job.org) and create 3 cron jobs (**Create cronjob**):
   | Title | URL | Schedule | Advanced settings |
   |---|---|---|---|
   | Pickday keep-awake | `https://<your-service>.onrender.com/healthz` | Every 10 minutes | Method GET |
   | Pickday hourly | `https://<your-service>.onrender.com/jobs/hourly` | Every hour at minute 2 | Method **POST**, header `X-Pickday-Secret` = your `JOBS_SECRET` |
   | Pickday daily | `https://<your-service>.onrender.com/jobs/daily` | Every day at 03:10 | Method **POST**, header `X-Pickday-Secret` = your `JOBS_SECRET` |
   Click **Test run** on each: the keep-awake job answers `ok`, the other two `started` (status 202). A 403 means the secret doesn't match.
7. **Ask for access to order addresses (for the printed sheets).** Partner Dashboard → your app → **API access** → **Protected customer data access** → **Request access**. Select **Protected customer data** and the fields **Name**, **Address** and **Phone**, with the reason "Printed delivery day sheets and route sheets; the data is read live when the merchant prints and never stored." Fill in the data protection questions (answers are in `PRIVACY.md`). Without this, sheets still print but without addresses.
8. **Test on a development store.** Partner Dashboard → **Stores** → **Add store** → **Development store**. Then in your app → **Test your app** → choose the store → **Install**. Follow `CHECKLIST.md` → "How to test" P1 to P6 (development stores get every Pro feature for free).
9. **Before submitting to the App Store:**
   1. In Render, make sure `BILLING_TEST` is `false`.
   2. Replace the placeholder support email (`SUPPORT_EMAIL`) and the website in `app/config/brand.ts`.
   3. Publish `PRIVACY.md` as a web page (for example a GitHub Pages site or your website) and put its link in the listing.
   4. Copy the texts from `docs/APP_STORE_LISTING.md` into Partner Dashboard → your app → **Distribution** → **Shopify App Store** → **Create listing**. Add screenshots (instructions in that file).
   5. Submit for review.
10. **Optional: upgrade the free Render plan** once you have more than about 100 stores or want instant admin loading (the free service takes up to a minute to wake after the keep-awake ping fails). Nothing in the code needs to change.

---

## Running it on your computer (developers)

Needs Node.js 22, a Shopify Partner account and a development store.

```bash
npm ci
cp .env.example .env               # fill in at least DATABASE_URL and DIRECT_URL
npx prisma migrate deploy          # create the tables
npm run dev                        # Shopify CLI: tunnel, install link, hot reload
```

A local Postgres works too: `DATABASE_URL=postgresql://user:pass@localhost:5432/pickday` (use the same value for `DIRECT_URL`).

### Checks

```bash
npm run typecheck                  # TypeScript for the app and the extensions
npm test                           # unit tests; set DATABASE_URL to also run the database tests
npm run build                      # builds the widget (fails if it's over 35 KB gzipped) and the app
npm run test:browser               # headless Chromium: widget at 320 px, 28 languages, right-to-left
```

GitHub Actions runs all of these on every push (see `.github/workflows/ci.yml`), with a Postgres service for the database tests.

### Where things are

- `core/` — the date engine and all rules, shared by the admin, the storefront widget and the checkout Functions.
- `widget/` — the storefront widget source; `npm run build:widget` writes it into `extensions/pickday-theme/assets/` (commit the result).
- `extensions/` — theme app extension, validation Function, delivery customization Function, thank-you/order-status block, admin order block and actions, Flow triggers.
- `app/` — the embedded admin (React Router, Polaris web components), webhooks, scheduled jobs.
- `locales/storefront/` — the 28 shopper-facing languages; `app/i18n/admin/` — the 8 admin languages.

## Costs at 100 stores

| Service | Free allowance | Pickday's use |
|---|---|---|
| Render web service | 750 instance hours/month, sleeps after 15 min idle | One service, kept awake by a 10-minute ping (about 744 h/month) |
| Neon Postgres | 0.5 GB storage, 190 compute hours/month, scales to zero | Small JSON settings per store, one row per order, old rows pruned daily; the keep-awake ping never touches the database |
| cron-job.org | Unlimited jobs | 3 jobs |
| Brevo | 300 emails/day | At most 1 email per store per day (100) |

## Support

Merchant help is inside the app (**Help** page: setup guide, 17 questions and answers, diagnostics). Support email: set `SUPPORT_EMAIL`.
