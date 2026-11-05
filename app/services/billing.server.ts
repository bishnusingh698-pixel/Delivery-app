/**
 * Plan state. Shopify is the source of truth; we mirror it on the Shop row
 * (from the billing webhook and whenever the Plans page loads).
 */
import prisma from "../db.server";
import type { PlanId } from "../../core/types";
import { schedulePublish } from "./publish.server";
import { gql, type AdminGraphql } from "./graphql.server";

export function planFromName(name: string | null | undefined): PlanId {
  const n = (name ?? "").toLowerCase();
  if (n.includes("pro")) return "pro";
  if (n.includes("starter")) return "starter";
  return "free";
}

/** Apply a subscription status change. ACTIVE (incl. trial) = that plan; anything else = Free. */
export async function applySubscription(shop: string, sub: { id: string; name: string; status: string } | null): Promise<{ from: PlanId; to: PlanId } | null> {
  const active = sub && sub.status.toUpperCase() === "ACTIVE";
  const row = await prisma.shop.findUnique({ where: { shop }, select: { plan: true, subscriptionId: true } });
  if (!row) return null;
  // A cancelled old subscription must not downgrade a newer active one.
  if (!active && sub && row.subscriptionId && row.subscriptionId !== sub.id) return null;
  const plan = active ? planFromName(sub!.name) : "free";
  if (row.plan === plan && row.subscriptionId === (active ? sub!.id : null)) return null;
  await prisma.shop.update({ where: { shop }, data: { plan, subscriptionId: active ? sub!.id : null } });
  schedulePublish(shop, 500);
  return { from: row.plan as PlanId, to: plan };
}

/**
 * The store's current Pickday subscription, straight from Shopify (null = none, so Free).
 * Test subscriptions only count where Pickday makes test charges (development stores, BILLING_TEST).
 */
export async function activeSubscription(shop: string, admin: AdminGraphql): Promise<{ id: string; name: string; status: string } | null> {
  const data = await gql<{ currentAppInstallation: { activeSubscriptions: { id: string; name: string; status: string; test: boolean }[] } }>(
    admin,
    `#graphql
    query PickdayActiveSubscription { currentAppInstallation { activeSubscriptions { id name status test } } }`,
  );
  const row = await prisma.shop.findUnique({ where: { shop }, select: { isDevStore: true } });
  const subs = data.currentAppInstallation.activeSubscriptions.filter((x) => x.status.toUpperCase() === "ACTIVE" && (!x.test || billingTest(row)));
  const sub = subs.find((x) => planFromName(x.name) !== "free") ?? null;
  return sub ? { id: sub.id, name: sub.name, status: sub.status } : null;
}

/**
 * Whether plan charges are test charges (no money moves).
 * Development stores can only accept test charges, so they always get them: that is how the
 * merchant (and Shopify's App Store reviewers) try the real upgrade and downgrade flow for free.
 * BILLING_TEST=true makes every store use test charges (never in production).
 */
export const billingTest = (row?: { isDevStore?: boolean | null } | null) =>
  process.env.BILLING_TEST === "true" || process.env.NODE_ENV !== "production" || !!row?.isDevStore;
