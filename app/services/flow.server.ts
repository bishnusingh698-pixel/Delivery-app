/**
 * Shopify Flow triggers (Notifications & integrations > Flow).
 * Fired only when the merchant turned Flow on and the plan includes it.
 */
import type { ScheduledOrder } from "@prisma/client";
import { loadSettings } from "../models/settings.server";
import { planOf, requireShop } from "../models/shop.server";
import { hasFeature } from "../../core/publish";
import { gql, type AdminGraphql } from "./graphql.server";

export type FlowEvent = "scheduled" | "rescheduled" | "cancelled";

const HANDLES: Record<FlowEvent, string> = {
  scheduled: "pickday-flow-scheduled",
  rescheduled: "pickday-flow-rescheduled",
  cancelled: "pickday-flow-cancelled",
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


export const DAILY_SUMMARY_HANDLE = "pickday-flow-daily-summary";

/** Shop-level "Daily summary ready" trigger. The caller checks the plan and the digest settings. */
export async function flowDailySummary(admin: AdminGraphql, payload: Record<string, unknown>): Promise<boolean> {
  const data = await gql<{ flowTriggerReceive: { userErrors: { field?: string[] | null; message: string }[] } }>(
    admin,
    `mutation($handle: String!, $payload: JSON!) { flowTriggerReceive(handle: $handle, payload: $payload) { userErrors { field message } } }`,
    { handle: DAILY_SUMMARY_HANDLE, payload },
  );
  const errs = data?.flowTriggerReceive?.userErrors ?? [];
  if (errs.length) console.error("[flow] daily summary", errs.map((e) => e.message).join("; "));
  return !errs.length;
}
