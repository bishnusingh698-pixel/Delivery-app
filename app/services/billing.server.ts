/**
 * Plan state. Shopify is the source of truth; we mirror it on the Shop row
 * (from the billing webhook and whenever the Plans page loads).
 */
import prisma from "../db.server";
import type { PlanId } from "../../core/types";
import { schedulePublish } from "./publish.server";
import { fromBillingName } from "../../core/plans";
import { loadSettings } from "../models/settings.server";
import { shopToday } from "../models/shop.server";
import { recountFuture } from "./counts.server";

/** Plan from a Shopify subscription name ("Starter", "Starter yearly", "Pro", "Pro yearly"). */
export function planFromName(name: string | null | undefined): PlanId {
  return fromBillingName(name).plan;
}

/** Apply a subscription status change. ACTIVE (incl. trial) = that plan; anything else = Free. */
export async function applySubscription(shop: string, sub: { id: string; name: string; status: string } | null): Promise<{ from: PlanId; to: PlanId } | null> {
  const active = sub && sub.status.toUpperCase() === "ACTIVE";
  const row = await prisma.shop.findUnique({ where: { shop }, select: { plan: true, subscriptionId: true, timeZone: true } });
  if (!row) return null;
  // A cancelled old subscription must not downgrade a newer active one.
  if (!active && sub && row.subscriptionId && row.subscriptionId !== sub.id) return null;
  const plan = active ? planFromName(sub!.name) : "free";
  if (row.plan === plan && row.subscriptionId === (active ? sub!.id : null)) return null;
  await prisma.shop.update({ where: { shop }, data: { plan, subscriptionId: active ? sub!.id : null } });
  // Zones and product limits are plan features: rebuild future counts under the new plan's keys.
  if (row.plan !== plan) await recountFuture(shop, (await loadSettings(shop)).settings, shopToday(row));
  schedulePublish(shop, 500);
  return { from: row.plan as PlanId, to: plan };
}

export const billingTest = () => process.env.BILLING_TEST === "true" || process.env.NODE_ENV !== "production";
