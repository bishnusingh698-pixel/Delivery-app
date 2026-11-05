import type { ActionFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { releaseAfterUpgrade } from "../services/orders.server";
import { activeSubscription, applySubscription } from "../services/billing.server";
import { logActivity } from "../models/settings.server";

/**
 * app_subscriptions/update: plan changes, trial ends, cancellations, frozen stores.
 * Webhooks can arrive late or out of order (a retried "Starter active" after "Pro active"), so the
 * plan is taken from Shopify's current active subscription, not from the message. The message is
 * only used when Shopify can't be asked.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, admin } = await authenticate.webhook(request);
  const s = (payload as { app_subscription?: { admin_graphql_api_id: string; name: string; status: string } }).app_subscription;
  if (!s) return new Response();
  let current: Awaited<ReturnType<typeof activeSubscription>> | undefined;
  if (admin) {
    try {
      current = await activeSubscription(shop, admin);
    } catch (e) {
      console.error("[billing] active subscription", shop, (e as Error).message);
    }
  }
  const change = await applySubscription(shop, current !== undefined ? current : { id: s.admin_graphql_api_id, name: s.name, status: s.status });
  // If this webhook beats the merchant back to the Plans page, the release happens here.
  if (change) {
    void unauthenticated
      .admin(shop)
      .then(({ admin: a }) => releaseAfterUpgrade(shop, a, change))
      .catch((e) => console.error("[billing] release limited", shop, (e as Error).message));
  }
  await logActivity(shop, "billing", `Subscription "${s.name}" is now ${s.status.toLowerCase()}`, "Shopify");
  return new Response();
};
