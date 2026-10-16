import type { ActionFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { releaseAfterUpgrade } from "../services/orders.server";
import { applySubscription } from "../services/billing.server";
import { logActivity } from "../models/settings.server";

/** app_subscriptions/update: plan changes, trial ends, cancellations, frozen stores. */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const s = (payload as { app_subscription?: { admin_graphql_api_id: string; name: string; status: string } }).app_subscription;
  if (s) {
    const change = await applySubscription(shop, { id: s.admin_graphql_api_id, name: s.name, status: s.status });
    // If this webhook beats the merchant back to the Plans page, the release happens here.
    if (change) {
      void unauthenticated
        .admin(shop)
        .then(({ admin }) => releaseAfterUpgrade(shop, admin, change))
        .catch((e) => console.error("[billing] release limited", shop, (e as Error).message));
    }
    await logActivity(shop, "billing", `Subscription "${s.name}" is now ${s.status.toLowerCase()}`, "Shopify");
  }
  return new Response();
};
