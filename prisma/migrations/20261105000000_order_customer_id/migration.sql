-- The Shopify customer id of the order (from the order webhook), so a customer's own date
-- change can be checked against it without the read_customers scope.
ALTER TABLE "ScheduledOrder" ADD COLUMN "customerId" TEXT;
CREATE INDEX "ScheduledOrder_shop_customerId_idx" ON "ScheduledOrder"("shop", "customerId");
