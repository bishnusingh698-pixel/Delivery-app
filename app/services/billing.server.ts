/**
 * Plan state. Shopify is the source of truth; we mirror it on the Shop row
 * (from the billing webhook and whenever the Plans page loads).
 */
import prisma from "../db.server";
import type { PlanId } from "../../core/types";
import { schedulePublish } from "./publish.server";

export function planFromName(name: string | null | undefined): PlanId {
  const n = (name ?? "").toLowerCase();
  if (n.includes("pro")) return "pro";
  if (n.includes("starter")) return "starter";
  return "free";
}

/** Apply a subscription status change. ACTIVE (incl. trial) = that plan; anything else = Free. */
export async function applySubscription(shop: string, sub: { id: string; name: string; status: string } | null) {
  const active = sub && sub.status.toUpperCase() === "ACTIVE";
  const row = await prisma.shop.findUnique({ where: { shop }, select: { plan: true, subscriptionId: true } });
  if (!row) return;
  // A cancelled old subscription must not downgrade a newer active one.
  if (!active && sub && row.subscriptionId && row.subscriptionId !== sub.id) return;
  const plan = active ? planFromName(sub!.name) : "free";
  if (row.plan === plan && row.subscriptionId === (active ? sub!.id : null)) return;
  await prisma.shop.update({ where: { shop }, data: { plan, subscriptionId: active ? sub!.id : null } });
  schedulePublish(shop, 500);
}
