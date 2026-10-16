import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getShop } from "../models/shop.server";
import { logActivity } from "../models/settings.server";
import { firstDelivery, recordOrder, type OrderTopic } from "../services/orders.server";
import type { OrderPayload } from "../services/order-parse";

/**
 * orders/create, orders/updated, orders/edited, orders/cancelled.
 * Answers Shopify straight away and records the order in the background, so a
 * slow database never makes Shopify retry. Duplicate deliveries are skipped.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, admin, webhookId } = await authenticate.webhook(request);
  const row = await getShop(shop);
  if (!row?.active) return new Response();
  if (!(await firstDelivery(webhookId ?? request.headers.get("x-shopify-webhook-id"), shop, topic))) return new Response();

  // orders/edited sends { order_edit: { order_id, ... } }; refetching is not needed because
  // Shopify also sends orders/updated with the full order after an edit.
  if (topic === "ORDERS_EDITED") return new Response();

  const order = payload as unknown as OrderPayload;
  void recordOrder(shop, order, admin ?? null, topic as OrderTopic).catch((e) =>
    logActivity(shop, "error", `Couldn't record order ${order?.name ?? ""}: ${(e as Error).message}`).catch(() => {}),
  );
  return new Response();
};
