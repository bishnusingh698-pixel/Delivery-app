-- Per-item rows keep the order's delivery zone and the product tags at order time,
-- so zone limits and tag-based product rules count per-item orders correctly.
ALTER TABLE "ScheduledItem" ADD COLUMN "zoneId" TEXT;
ALTER TABLE "ScheduledItem" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
