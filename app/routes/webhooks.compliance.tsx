import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logActivity } from "../models/settings.server";

/**
 * Mandatory privacy webhooks (one endpoint, three topics).
 *
 * What Pickday stores about customers: order number, customer first name and
 * the chosen date/slot/location/area per scheduled order. No addresses, emails
 * or phone numbers (those are fetched live from Shopify when printing).
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const p = payload as Record<string, any>;

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST": {
      const ids = ((p.orders_requested as number[]) ?? []).map(String);
      const rows = await db.scheduledOrder.findMany({
        where: { shop, orderId: { in: ids } },
        select: { orderName: true, customerFirst: true, method: true, date: true, slotLabel: true },
      });
      // The merchant answers the customer; this entry lists exactly what Pickday holds for them.
      const list = rows.map((r) => `${r.orderName}: ${r.customerFirst ?? "-"}, ${r.method}, ${r.date ?? "no date"}${r.slotLabel ? ` ${r.slotLabel}` : ""}`).join("; ");
      await logActivity(
        shop,
        "privacy",
        `Customer data request: Pickday holds ${rows.length} scheduled order(s) for this customer (first name and schedule only)${list ? `: ${list}` : ""}`,
        "Shopify",
        { orders: rows },
      );
      break;
    }
    case "CUSTOMERS_REDACT": {
      const ids = ((p.orders_to_redact as number[]) ?? []).map(String);
      if (ids.length) {
        await db.scheduledOrder.updateMany({ where: { shop, orderId: { in: ids } }, data: { customerFirst: null, area: null, history: [] } });
      }
      break;
    }
    case "SHOP_REDACT": {
      // Sent 48 hours after uninstall. If the store has installed Pickday again since, its data is in use: keep it.
      const current = await db.shop.findUnique({ where: { shop }, select: { active: true } });
      if (current?.active) {
        await logActivity(shop, "privacy", "Shop data deletion request skipped: the app was reinstalled", "Shopify").catch(() => {});
        break;
      }
      await db.$transaction([
        db.scheduledItem.deleteMany({ where: { shop } }),
        db.scheduledOrder.deleteMany({ where: { shop } }),
        db.capacityCount.deleteMany({ where: { shop } }),
        db.productCount.deleteMany({ where: { shop } }),
        db.activityLog.deleteMany({ where: { shop } }),
        db.digestLog.deleteMany({ where: { shop } }),
        db.shareCode.deleteMany({ where: { shop } }),
        db.webhookLog.deleteMany({ where: { shop } }),
        db.settings.deleteMany({ where: { shop } }),
        db.session.deleteMany({ where: { shop } }),
        db.shop.deleteMany({ where: { shop } }),
      ]);
      break;
    }
  }
  return new Response();
};
