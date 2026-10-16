# Roadmap

Ideas for after v1, roughly in order of value. Nothing here is promised.

## Next

1. **Hard capacity at checkout.** v1 counts orders after they're placed, so two shoppers can very rarely take the last spot at the same second (DECISIONS D-09). A reservation step (hold a spot for 15 minutes while the shopper is in checkout) would close this, at the cost of a server call during checkout. Needs a paid server tier to be reliable.
2. **Customer account: change my date.** Let shoppers move their own order (within merchant rules) from the order status page. Needs a customer account UI extension and an app proxy.
3. **Shopify POS.** A POS UI extension so in-store staff can take pre-orders with a pickup date.
4. **Driver view.** A mobile-friendly route page for drivers (no Shopify login), with stops in order and "delivered" buttons.
5. **Reports.** Busiest days, lead time actually used, cancellations, revenue per method, this year vs last year.
6. **Capacity across items in date-per-item mode** (DECISIONS D-41). Check all lines on the same day together at checkout, and apply zone and tag-based limits per item.

## Later

- Recurring orders / subscriptions: pick a weekday for every delivery.
- Multiple pickup windows per location per day with staff capacity.
- Google Maps distance-based delivery areas (needs a paid API; keep optional).
- Webhooks out (to Zapier/Make) in addition to Flow.
- More admin languages (the storefront already has 28).
- Headless/Hydrogen storefront component.
- Merchant-defined extra questions in the widget (gift message, delivery instructions).

## Housekeeping

- Move from the free Render plan to a paid instance once there are more than about 100 active stores, or if admin cold starts become a support issue.
- Re-check Shopify API versions every quarter (Functions and Admin API 2026-07/10 today).
