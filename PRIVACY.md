# Pickday privacy policy

*Last updated: 6 November 2026*

Pickday ("the app") helps Shopify merchants let their customers choose a delivery, pickup or shipping date. This page explains what data the app handles, why, where it's kept and for how long. It applies to merchants who install the app and to their customers.

## Short version

- Pickday stores **the order number, the customer's first name, the customer's Shopify customer ID (a number, for orders placed with a customer account), the items and the chosen date, time slot, method and delivery area** for each scheduled order. Nothing else about customers: no email, phone number or address.
- **Addresses and phone numbers are never stored.** They're read from Shopify only at the moment a merchant prints a day sheet or route sheet, and discarded right after.
- **Pickday sends no emails at all**, neither to customers nor to merchants. Shopify keeps sending its own order emails. If a merchant sets up the optional daily summary, Shopify Flow (in the merchant's own store) sends it to the merchant's staff; it contains order totals, not customer details.
- **Reminders and alerts (optional, Pro)**: Pickday can tell Shopify Flow, inside the merchant's own store, that an order's date is coming up or that a day is almost full. Flow then runs whatever the merchant set up (for example their email or SMS app). Pickday sends the order's reference and its date, slot and pickup place, nothing else, and sends no message itself.
- **Reports** are worked out from the data above; nothing extra is collected for them.
- **Customers can change their own date** (if the merchant allows it) from their order page in Shopify's customer accounts. Pickday checks the order belongs to the signed-in customer by comparing their Shopify customer ID with the one Shopify sent with the order. It doesn't store the customer's email.
- Data is deleted automatically: everything for a store 48 hours after it uninstalls (when Shopify sends the deletion request), and old orders 400 days after their date.
- No tracking, no analytics, no advertising, no selling of data. The storefront widget sets no cookies.

## What data, and why

| Data | Whose | Why | Kept for |
|---|---|---|---|
| Store domain, name, time zone, language, currency, country, Shopify plan type | Merchant | To run the app in the store's language and time zone | Until uninstall + 48 h |
| Pickday settings (methods, schedules, locations, areas, texts…) | Merchant | The app's configuration | Until uninstall + 48 h |
| Name of the staff member who changed something | Merchant staff | Change history ("who moved this order") | With the order (400 days after its date); 180 days in the activity log |
| Order number, customer first name, Shopify customer ID, items, chosen date, slot, method, pickup location, delivery area or postcode | Customer | Order lists, capacity counting, calendars, printed sheets | 400 days after the delivery date, or until uninstall + 48 h |
| Customer name, address, phone, order note, delivery instructions | Customer | Printed day and route sheets only | **Not stored** (read live from Shopify when printing) |
| Shopper's cart choice (date, slot, method, postcode, optional delivery instructions) | Customer | Saved by Shopify as cart attributes so checkout and the order know the choice | Held by Shopify, not by Pickday |

The storefront widget runs in the shopper's browser and talks only to Shopify (the cart). It does not contact Pickday's server or set cookies. Two optional links do reach Pickday's server, and only when the customer clicks them: the "Apple or Outlook (.ics)" calendar download on the thank-you page (the date, time and pickup address are in the link; nothing is stored) and the "Change date" button in the customer's account. It keeps two things in the browser's session storage, which is cleared when the tab closes: the postcode or delivery area the shopper typed (so they aren't asked again on the next page) and a cache of product tags (no personal data).

## Who is responsible (GDPR roles)

- **For customer data, the merchant is the controller and Pickday is a processor** acting on the merchant's instructions: Pickday only uses order data to run the date picker, order lists, sheets and calendars for that store. Customers exercise their rights through the merchant (see below). A data processing agreement is available on request.
- **For the merchant's own account data** (store name, staff names in the change history), Pickday is the controller.
- **Legal basis:** performing the contract with the merchant (Art. 6(1)(b) GDPR) and, for the customer data processed for the merchant, the merchant's own basis, usually performing their sales contract with the customer.

**Who we are:** [YOUR NAME OR COMPANY NAME], [POSTAL ADDRESS], [SUPPORT EMAIL]. (Fill this in before publishing this page.)

## Where data is kept

- **Server:** Render (render.com), region Frankfurt, EU.
- **Database:** Neon (neon.tech), region EU (Frankfurt). Encrypted at rest and in transit.

Each of these acts as a sub-processor under its own data processing terms. Both are US companies, so data may be accessible from the United States even though it is stored in the EU; such transfers rely on the safeguards in their data processing agreements (for example the EU Standard Contractual Clauses). No other third parties receive data. Shopify itself holds the full order, under the merchant's agreement with Shopify.

## Calendar feed

If a merchant creates a calendar feed, anyone with its secret address can read the merchant's upcoming orders (order number and first name, plus items if the merchant turns that on). The merchant can make a new address at any time, which disables the old one.

## Customer rights (GDPR, CCPA and similar)

Customers ask the merchant, who asks Shopify. Shopify then sends Pickday:

- **Data request:** Pickday records which of its stored orders belong to the customer (order number, first name, schedule) so the merchant can provide them.
- **Redaction request:** Pickday removes the customer's first name, customer ID, delivery postcode/area and change history from those orders (the orders Shopify lists, and any other order with that customer's ID), and deletes the record of any earlier data request for them (it listed their first name).
- **Shop deletion (48 hours after uninstall):** Pickday deletes everything it holds for that store.

Customers and merchants can also complain to their data protection authority (in the EU, the authority of their country; in the UK, the ICO). The same approach covers similar laws elsewhere, such as the UK GDPR, California's CCPA, Saudi Arabia's PDPL and India's DPDP Act: Pickday holds the minimum (first name, customer ID and the schedule), only for the merchant, and deletes it on request.

## Security

- All traffic uses HTTPS. Admin requests are authenticated with Shopify session tokens; webhooks are verified with Shopify's signature; scheduled jobs require a secret header.
- Every database query is limited to the requesting store.
- Access to the servers and database is limited to the app's developer, with two-factor authentication.

## Contact

Questions or requests: the support email shown in the app's Help page.
