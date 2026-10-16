# Pickday privacy policy

*Last updated: 16 October 2026*

Pickday ("the app") helps Shopify merchants let their customers choose a delivery, pickup or shipping date. This page explains what data the app handles, why, where it's kept and for how long. It applies to merchants who install the app and to their customers.

## Short version

- Pickday stores **the order number, the customer's first name, the items and the chosen date, time slot, method and delivery area** for each scheduled order. Nothing else about customers.
- **Addresses and phone numbers are never stored.** They're read from Shopify only at the moment a merchant prints a day sheet or route sheet, and discarded right after.
- **Pickday never emails customers.** It only sends the merchant an optional daily summary.
- Data is deleted automatically: everything for a store 48 hours after it uninstalls (when Shopify sends the deletion request), and old orders 400 days after their date.
- No tracking, no analytics, no advertising, no selling of data. The storefront widget sets no cookies.

## What data, and why

| Data | Whose | Why | Kept for |
|---|---|---|---|
| Store domain, name, time zone, language, currency, country, Shopify plan type | Merchant | To run the app in the store's language and time zone | Until uninstall + 48 h |
| Pickday settings (methods, schedules, locations, areas, texts…) | Merchant | The app's configuration | Until uninstall + 48 h |
| Name of the staff member who changed something | Merchant staff | Change history ("who moved this order") | 180 days |
| Up to 3 email addresses for the daily summary | Merchant staff | Sending the summary the merchant asked for | Until removed or uninstall |
| Order number, customer first name, items, chosen date, slot, method, pickup location, delivery area or postcode | Customer | Order lists, capacity counting, calendars, printed sheets | 400 days after the delivery date, or until uninstall + 48 h |
| Customer name, address, phone, order note | Customer | Printed day and route sheets only | **Not stored** (read live from Shopify when printing) |
| Shopper's cart choice (date, slot, method, postcode) | Customer | Saved by Shopify as cart attributes so checkout and the order know the choice | Held by Shopify, not by Pickday |

The storefront widget runs in the shopper's browser and talks only to Shopify (the cart). It does not contact Pickday's server, set cookies or use local storage except a per-session cache of product tags (no personal data).

## Where data is kept

- **Server:** Render (render.com), region Frankfurt, EU.
- **Database:** Neon (neon.tech), region EU (Frankfurt). Encrypted at rest and in transit.
- **Email (merchant summary only):** Brevo (brevo.com), EU.

Each of these acts as a processor under its own data processing terms. No other third parties receive data.

## Calendar feed

If a merchant creates a calendar feed, anyone with its secret address can read the merchant's upcoming orders (order number and first name, plus items if the merchant turns that on). The merchant can make a new address at any time, which disables the old one.

## Customer rights (GDPR, CCPA and similar)

Customers ask the merchant, who asks Shopify. Shopify then sends Pickday:

- **Data request:** Pickday records which of its stored orders belong to the customer (order number, first name, schedule) so the merchant can provide them.
- **Redaction request:** Pickday removes the customer's first name and change history from those orders.
- **Shop deletion (48 hours after uninstall):** Pickday deletes everything it holds for that store.

## Security

- All traffic uses HTTPS. Admin requests are authenticated with Shopify session tokens; webhooks are verified with Shopify's signature; scheduled jobs require a secret header.
- Every database query is limited to the requesting store.
- Access to the servers and database is limited to the app's developer, with two-factor authentication.

## Contact

Questions or requests: the support email shown in the app's Help page.
