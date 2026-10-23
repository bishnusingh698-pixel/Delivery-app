import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getShop } from "../models/shop.server";
import { logActivity } from "../models/settings.server";
import { withLock } from "../services/lock.server";
import { firstDelivery, forgetDelivery, recordOrder, type OrderTopic } from "../services/orders.server";
import type { OrderPayload } from "../services/order-parse";

/**
 * orders/create, orders/updated, orders/edited, orders/cancelled.
 * Records the order before answering when that takes under a few seconds, so a failure
 * is answered with an error and Shopify delivers it again. Duplicate deliveries are skipped.
 */
/** Shopify waits 5 seconds for an answer. */
const ANSWER_WITHIN_MS = 3500;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, admin, webhookId } = await authenticate.webhook(request);
  const row = await getShop(shop);
  if (!row?.active) return new Response();
  if (!(await firstDelivery(webhookId ?? request.headers.get("x-shopify-webhook-id"), shop, topic))) return new Response();

  // orders/edited sends { order_edit: { order_id, ... } }; refetching is not needed because
  // Shopify also sends orders/updated with the full order after an edit.
  if (topic === "ORDERS_EDITED") return new Response();

  const order = payload as unknown as OrderPayload;
  // One order webhook per store at a time (create and updated often arrive together).
  const work = withLock(`order:${shop}`, () => recordOrder(shop, order, admin ?? null, topic as OrderTopic));
  // Wait a few seconds so a failure can be answered with an error and Shopify retries it.
  // If the database is slow, answer anyway and let the work finish in the background.
  const outcome = await Promise.race([work.then(() => "done" as const, (e: Error) => e), new Promise<"slow">((r) => setTimeout(() => r("slow"), ANSWER_WITHIN_MS))]);
  if (outcome instanceof Error) {
    await forgetDelivery(webhookId ?? request.headers.get("x-shopify-webhook-id"));
    await logActivity(shop, "error", `Couldn't record order ${order?.name ?? ""} (Shopify will retry): ${outcome.message}`).catch(() => {});
    return new Response("Retry", { status: 500 });
  }
  if (outcome === "slow") {
    work.catch((e) => logActivity(shop, "error", `Couldn't record order ${order?.name ?? ""}: ${(e as Error).message}`).catch(() => {}));
  }
  return new Response();
};
