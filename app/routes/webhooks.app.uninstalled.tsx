import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * app/uninstalled: mark the shop inactive and delete its sessions.
 * Settings and schedules are kept until shop/redact (48 h later) so a quick
 * reinstall keeps the merchant's setup. Theme code: none to remove (theme app
 * extension only).
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);
  await db.session.deleteMany({ where: { shop } });
  await db.shop.updateMany({
    where: { shop },
    data: { active: false, uninstalledAt: new Date(), plan: "free", subscriptionId: null, validationId: null, deliveryCustomizationId: null },
  });
  return new Response();
};
