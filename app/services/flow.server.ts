/**
 * Shopify Flow triggers (Notifications & integrations > Flow).
 * Fired only when the merchant turned Flow on and the plan includes it.
 */
import type { ScheduledOrder } from "@prisma/client";
import { loadSettings } from "../models/settings.server";
import { planOf, requireShop } from "../models/shop.server";
import { hasFeature } from "../../core/publish";
import { gql, type AdminGraphql } from "./graphql.server";

export type FlowEvent = "scheduled" | "rescheduled" | "upcoming";

const HANDLES: Record<FlowEvent, string> = {
  scheduled: "pickday-flow-scheduled",
  rescheduled: "pickday-flow-rescheduled",
  upcoming: "pickday-flow-upcoming",
};

const METHOD: Record<string, string> = { delivery: "Local delivery", pickup: "Pickup", shipping: "Shipping" };

export async function flowTrigger(shop: string, admin: AdminGraphql, event: FlowEvent, o: Pick<ScheduledOrder, "orderId" | "method" | "date" | "slotLabel" | "locationId">) {
  const { settings } = await loadSettings(shop);
  if (!settings.notifications.flowEnabled) return;
  if (!hasFeature(planOf(await requireShop(shop)), "flow")) return;
  const loc = settings.locations.find((l) => l.id === o.locationId)?.name ?? "";
  const payload = {
    order_id: Number(o.orderId),
    Method: METHOD[o.method] ?? o.method,
    Date: o.date ?? "",
    "Time slot": o.slotLabel ?? "",
    "Pickup location": loc,
  };
  await gql(
    admin,
    `mutation($handle: String!, $payload: JSON!) { flowTriggerReceive(handle: $handle, payload: $payload) { userErrors { field message } } }`,
    { handle: HANDLES[event], payload },
  );
}

