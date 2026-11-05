/**
 * Shopify Flow triggers (Notifications & integrations > Flow).
 * Fired only when the merchant turned Flow on and the plan includes it.
 */
import type { ScheduledOrder } from "@prisma/client";
import { loadSettings } from "../models/settings.server";
import { planOf, requireShop } from "../models/shop.server";
import { hasFeature } from "../../core/publish";
import { FLOW_HANDLES, orderPayload, type FlowEvent } from "./flow-payload";
import { gql, type AdminGraphql } from "./graphql.server";

export type { FlowEvent };

export const FLOW_TRIGGER_MUTATION = `mutation($handle: String!, $payload: JSON!) { flowTriggerReceive(handle: $handle, payload: $payload) { userErrors { field message } } }`;

/** Send one trigger. Flow answers a wrong payload with userErrors (not an exception): those throw too. */
export async function sendFlowTrigger(admin: AdminGraphql, handle: string, payload: Record<string, unknown>) {
  const res = await gql(admin, FLOW_TRIGGER_MUTATION, { handle, payload });
  const errors: { message: string }[] = res.flowTriggerReceive?.userErrors ?? [];
  if (errors.length) throw new Error(`flowTriggerReceive ${handle}: ${errors.map((e) => e.message).join("; ")}`);
}

export async function flowTrigger(shop: string, admin: AdminGraphql, event: FlowEvent, o: Pick<ScheduledOrder, "orderId" | "method" | "date" | "slotLabel" | "locationId">) {
  const { settings } = await loadSettings(shop);
  if (!settings.notifications.flowEnabled) return;
  if (!hasFeature(planOf(await requireShop(shop)), "flow")) return;
  try {
    await sendFlowTrigger(admin, FLOW_HANDLES[event], orderPayload(o, settings));
  } catch (e) {
    // Never fails the order change that fired it, but leaves a trace in the logs.
    console.error(`[flow] ${shop} ${event}`, (e as Error).message);
  }
}
