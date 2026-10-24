import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import type { ShopFlags } from "../models/shop.server";
import { forgetInstallation } from "../services/publish.server";

/**
 * app/uninstalled: mark the shop inactive and delete its sessions.
 * Settings and schedules are kept until shop/redact (48 h later) so a quick
 * reinstall keeps the merchant's setup. Theme code: none to remove (theme app
 * extension only).
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);
  await db.session.deleteMany({ where: { shop } });
  const row = await db.shop.findUnique({ where: { shop }, select: { flags: true } });
  // The app embed and the Functions are removed with the app: forget what we knew about them.
  const flags = { ...((row?.flags as ShopFlags | null) ?? {}) };
  delete flags.embedDetected;
  delete flags.embedCheckedAt;
  await db.shop.updateMany({
    where: { shop },
    data: {
      active: false,
      uninstalledAt: new Date(),
      plan: "free",
      subscriptionId: null,
      validationId: null,
      deliveryCustomizationId: null,
      flags,
      warnings: [],
      publishedAt: null,
      publishedFor: null,
    },
  });
  forgetInstallation(shop);
  return new Response();
};
