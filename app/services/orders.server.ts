/**
 * Recording scheduled orders from webhooks (and admin changes).
 *
 * - Idempotent: the same webhook delivered twice changes nothing.
 * - Out-of-order safe: a payload older than what we stored is ignored.
 * - Counts are rebuilt for every date touched (old and new), never incremented.
 */
import type { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { loadSettings, logActivity } from "../models/settings.server";
import { addWarning, flagsOf, planOf, requireShop, setFlags, shopToday } from "../models/shop.server";
import { zonedToUtc } from "../../core/tz";
import { PLAN_ORDER_LIMIT } from "../../core/publish";
import type { Settings } from "../../core/types";
import { recountDates } from "./counts.server";
import { assertNoUserErrors, gid, gql, type AdminGraphql } from "./graphql.server";
import { methodMismatch, orderTags, parseOrder, type OrderPayload, type ParsedOrder } from "./order-parse";
import { schedulePublish } from "./publish.server";
import { monthlyUsage } from "./usage.server";
import { flowTrigger } from "./flow.server";

export type OrderTopic = "ORDERS_CREATE" | "ORDERS_UPDATED" | "ORDERS_EDITED" | "ORDERS_CANCELLED";

/** Record (or update) one order. Returns what happened, for logs and tests. */
export async function recordOrder(shop: string, payload: OrderPayload, admin: AdminGraphql | null, topic: OrderTopic | "ADMIN" = "ORDERS_UPDATED") {
  const { settings } = await loadSettings(shop);
  const parsed = parseOrder(payload, settings);
  const existing = await prisma.scheduledOrder.findUnique({ where: { shop_orderId: { shop, orderId: String(payload.id) } } });
  const sourceAt = payload.updated_at ? new Date(payload.updated_at) : null;
  if (existing?.sourceUpdatedAt && sourceAt && sourceAt < existing.sourceUpdatedAt) return "stale";

  if (!parsed) {
    // Choice removed (or never made). Only matters if we had recorded it.
    if (!existing || topic === "ORDERS_EDITED") return "ignored";
    if (existing.status === "cancelled") return "unchanged";
    await prisma.scheduledOrder.update({ where: { id: existing.id }, data: { status: "cancelled" } });
    await prisma.scheduledItem.deleteMany({ where: { shop, orderId: existing.orderId } });
    await afterChange(shop, settings, [existing.date]);
    if (admin && !existing.limited) await flowTrigger(shop, admin, "cancelled", existing).catch(() => {});
    return "removed";
  }

  // Admin reschedules (stored in history) win over the original cart choice until the order changes them again.
  const keepAdminDate = existing && Array.isArray(existing.history) && (existing.history as unknown[]).length > 0 && topic !== "ADMIN";
  const data = {
    orderName: parsed.orderName,
    customerFirst: parsed.customerFirst,
    method: keepAdminDate ? existing!.method : parsed.method,
    date: keepAdminDate ? existing!.date : parsed.date,
    slotId: keepAdminDate ? existing!.slotId : parsed.slotId,
    slotLabel: keepAdminDate ? existing!.slotLabel : parsed.slotLabel,
    locationId: keepAdminDate ? existing!.locationId : parsed.locationId,
    zoneId: parsed.zoneId,
    area: parsed.area,
    status: parsed.status,
    items: parsed.items as unknown as Prisma.InputJsonValue,
    itemCount: parsed.itemCount,
    sourceUpdatedAt: parsed.updatedAt,
  };

  const same =
    existing &&
    existing.status === data.status &&
    existing.date === data.date &&
    existing.slotId === data.slotId &&
    existing.method === data.method &&
    existing.locationId === data.locationId &&
    existing.itemCount === data.itemCount &&
    stable(existing.items) === stable(data.items);
  if (same) {
    await prisma.scheduledOrder.update({ where: { id: existing!.id }, data: { sourceUpdatedAt: data.sourceUpdatedAt } });
    return "unchanged";
  }

  let limited = existing?.limited ?? false;
  if (!existing) {
    const row = await requireShop(shop);
    const limit = PLAN_ORDER_LIMIT[planOf(row)];
    if (limit !== null) limited = (await monthlyUsage(shop, row)).count >= limit;
  }

  const oldDates = existing ? [existing.date] : [];
  const oldItems = existing ? (await prisma.scheduledItem.findMany({ where: { shop, orderId: existing.orderId }, select: { date: true } })).map((i) => i.date) : [];
  const saved = existing
    ? await prisma.scheduledOrder.update({ where: { id: existing.id }, data })
    : await prisma.scheduledOrder.create({ data: { shop, orderId: parsed.orderId, limited, ...data } });

  await prisma.$transaction([
    prisma.scheduledItem.deleteMany({ where: { shop, orderId: parsed.orderId } }),
    prisma.scheduledItem.createMany({
      data:
        parsed.status === "cancelled"
          ? []
          : parsed.perItem.map((i) => ({ shop, orderId: parsed.orderId, lineId: i.lineId, productId: i.productId, variantId: i.variantId, title: i.title, qty: i.qty, date: i.date, slotId: i.slotId, method: parsed.method, locationId: parsed.locationId })),
    }),
  ]);

  await afterChange(shop, settings, [...oldDates, ...oldItems, saved.date, ...parsed.perItem.map((i) => i.date)]);

  if (!existing) {
    const row = await requireShop(shop);
    if (!flagsOf(row).firstOrderAt) await setFlags(shop, { firstOrderAt: new Date().toISOString() });
    if (methodMismatch(parsed, settings.checkoutMatching.rateMap)) await addWarning(shop, "checkoutMismatch", parsed.orderName);
  }

  if (!saved.limited && admin && parsed.status === "cancelled" && existing && existing.status !== "cancelled") {
    await flowTrigger(shop, admin, "cancelled", saved).catch(() => {});
  }
  if (!saved.limited && admin && parsed.status !== "cancelled") {
    const dateChanged = !existing || existing.date !== saved.date || existing.slotId !== saved.slotId || existing.method !== saved.method;
    if (dateChanged) {
      await writeToShopify(shop, admin, settings, { ...parsed, method: saved.method as ParsedOrder["method"], date: saved.date, slotId: saved.slotId, slotLabel: saved.slotLabel, locationId: saved.locationId }, existing?.tags ?? []).catch((e) =>
        logActivity(shop, "error", `Couldn't tag order ${parsed.orderName}: ${(e as Error).message}`),
      );
      if (!existing) await flowTrigger(shop, admin, "scheduled", saved).catch(() => {});
    }
  }
  return existing ? "updated" : "created";
}

/** JSON with sorted keys (jsonb reorders keys and drops undefined). */
function stable(v: unknown): string {
  return JSON.stringify(JSON.parse(JSON.stringify(v ?? null)), (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x,
  );
}

async function afterChange(shop: string, settings: Settings, dates: (string | null | undefined)[]) {
  await recountDates(shop, settings, dates.filter(Boolean) as string[]);
  schedulePublish(shop);
}

const SCHEDULE_MF = { namespace: "$app:pickday", key: "schedule" };

/** Tags + order metafield (for Order Printer, Flow, other apps). */
export async function writeToShopify(shop: string, admin: AdminGraphql, settings: Settings, o: ParsedOrder, previousTags: string[]) {
  const orderGid = gid("Order", o.orderId);
  const loc = settings.locations.find((l) => l.id === o.locationId)?.name ?? null;
  const tags = settings.tagging.enabled ? orderTags(o, settings.tagging.prefix, loc) : [];
  const remove = previousTags.filter((t) => !tags.includes(t));
  if (remove.length) {
    const r = await gql(admin, `mutation($id: ID!, $tags: [String!]!) { tagsRemove(id: $id, tags: $tags) { userErrors { message } } }`, { id: orderGid, tags: remove });
    assertNoUserErrors(r.tagsRemove, "tagsRemove");
  }
  if (tags.length) {
    const r = await gql(admin, `mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { message } } }`, { id: orderGid, tags });
    assertNoUserErrors(r.tagsAdd, "tagsAdd");
  }
  const value = JSON.stringify({ method: o.method, date: o.date, slot: o.slotLabel, location: loc, items: o.perItem.length ? o.perItem.map((i) => ({ lineId: i.lineId, date: i.date })) : undefined });
  const r = await gql(
    admin,
    `mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { message } } }`,
    { m: [{ ownerId: orderGid, ...SCHEDULE_MF, type: "json", value }] },
  );
  assertNoUserErrors(r.metafieldsSet, "metafieldsSet");
  await prisma.scheduledOrder.update({ where: { shop_orderId: { shop, orderId: o.orderId } }, data: { tags } });
}

/** Has this webhook delivery been processed already? Records it if not. */
export async function firstDelivery(id: string | null, shop: string, topic: string): Promise<boolean> {
  if (!id) return true;
  try {
    await prisma.webhookLog.create({ data: { id, shop, topic } });
    return true;
  } catch {
    return false;
  }
}

const planRank = (p: string) => (p === "pro" ? 2 : p === "starter" ? 1 : 0);

/**
 * Run after any plan change (from the Plans page or the billing webhook, whichever
 * sees it first): on an upgrade, release this month's limited orders.
 */
export async function releaseAfterUpgrade(shop: string, admin: AdminGraphql, change: { from: string; to: string } | null) {
  if (!change || planRank(change.to) <= planRank(change.from)) return 0;
  const row = await requireShop(shop);
  const monthStart = shopToday(row).slice(0, 8) + "01";
  return releaseLimited(shop, admin, zonedToUtc(monthStart, "00:00", row.timeZone || "UTC"));
}

/**
 * After an upgrade: orders recorded over the old plan limit this month get their
 * tags and metafield now (D-10). Older limited orders stay as they are.
 */
export async function releaseLimited(shop: string, admin: AdminGraphql, since: Date) {
  const { settings } = await loadSettings(shop);
  const rows = await prisma.scheduledOrder.findMany({ where: { shop, limited: true, createdAt: { gte: since }, status: { not: "cancelled" } }, take: 500 });
  let done = 0;
  for (const o of rows) {
    const perItem = await prisma.scheduledItem.findMany({ where: { shop, orderId: o.orderId } });
    try {
      await writeToShopify(
        shop,
        admin,
        settings,
        {
          orderId: o.orderId,
          orderName: o.orderName,
          customerFirst: o.customerFirst,
          selection: null,
          method: o.method as ParsedOrder["method"],
          date: o.date,
          slotId: o.slotId,
          slotLabel: o.slotLabel,
          locationId: o.locationId,
          zoneId: o.zoneId,
          area: o.area,
          status: o.status as ParsedOrder["status"],
          items: [],
          itemCount: o.itemCount,
          perItem: perItem.map((i) => ({ lineId: i.lineId, productId: i.productId, variantId: i.variantId, title: i.title, qty: i.qty, date: i.date, slotId: i.slotId })),
          updatedAt: null,
          shippingTitle: null,
        },
        o.tags,
      );
      await prisma.scheduledOrder.update({ where: { id: o.id }, data: { limited: false } });
      done++;
    } catch (e) {
      console.error("[orders] release limited", shop, o.orderName, (e as Error).message);
    }
  }
  return done;
}
