/**
 * Admin scheduling: view, set or change the date of one order (order page block,
 * order action, Orders page, bulk reschedule) and schedule draft orders.
 */
import type { Prisma, ScheduledOrder } from "@prisma/client";
import prisma from "../db.server";
import { addDays } from "../../core/civil";
import { buildCalendar, checkSelection, resolveRules, slotsForDate, specialDayFor, type EngineConfig, type EngineInput } from "../../core/engine";
import { ATTR_KEY, READABLE_KEYS, encodeSelection } from "../../core/selection";
import type { CartLine, DayStatus, MethodId, Selection, Slot } from "../../core/types";
import { logActivity } from "../models/settings.server";
import { nowInZone } from "../../core/tz";
import { buildAvailability, recountDates, toLine, type StoredItem } from "./counts.server";
import { flowTrigger } from "./flow.server";
import { assertNoUserErrors, gid, gql, numericId, type AdminGraphql } from "./graphql.server";
import { writeToShopify } from "./orders.server";
import { storefrontConfigFor, schedulePublish } from "./publish.server";
import { engineTimeZone } from "../../core/engine";

export interface ScheduleChoice {
  method: MethodId;
  date: string;
  slotId: string | null;
  locationId: string | null;
}

/** Items of an order as Pickday stores them (from our record, or fetched from Shopify). */
async function orderItems(shop: string, admin: AdminGraphql, orderId: string, existing: ScheduledOrder | null) {
  if (existing) return { name: existing.orderName, first: existing.customerFirst, items: existing.items as unknown as StoredItem[] };
  const data = await gql(
    admin,
    `query($id: ID!) { order(id: $id) { name customer { firstName } lineItems(first: 100) { nodes { id title variantTitle quantity: currentQuantity requiresShipping isGiftCard product { id } variant { id } } } } }`,
    { id: gid("Order", orderId) },
  );
  const o = data.order;
  if (!o) throw new Error("Order not found");
  const items: StoredItem[] = o.lineItems.nodes
    .filter((l: any) => l.quantity > 0)
    .map((l: any) => ({
      lineId: numericId(l.id),
      productId: numericId(l.product?.id),
      variantId: numericId(l.variant?.id),
      title: l.title,
      variant: l.variantTitle,
      qty: l.quantity,
      needsDate: l.requiresShipping && !l.isGiftCard,
    }));
  return { name: o.name as string, first: (o.customer?.firstName as string | null) ?? null, items };
}

/** Calendar for the admin date picker, with this order's own counts released. */
export async function adminCalendar(shop: string, method: MethodId, locationId: string | null, existing: ScheduledOrder | null, lines: CartLine[], days = 90) {
  const { config, today } = await storefrontConfigFor(shop);
  const availability = await buildAvailability(shop, addDays(today, -1), addDays(today, days + 1));
  const input: EngineInput = {
    config,
    availability,
    method,
    locationId: method === "pickup" ? locationId : null,
    zoneId: existing?.zoneId ?? null,
    now: nowInZone(engineTimeZone(config, method, locationId)),
    lines,
    release:
      existing && existing.status !== "cancelled" && existing.date && existing.method === method && (existing.locationId ?? null) === (locationId ?? null)
        ? { date: existing.date, slotId: existing.slotId, orders: 1, items: existing.itemCount }
        : null,
  };
  const cal = buildCalendar(input, today, addDays(today, days));
  return { config, input, days: cal.days as DayStatus[], firstAvailable: cal.firstAvailable };
}

export async function getOrderSchedule(shop: string, admin: AdminGraphql, orderId: string) {
  const existing = await prisma.scheduledOrder.findUnique({ where: { shop_orderId: { shop, orderId } } });
  const info = await orderItems(shop, admin, orderId, existing);
  const lines = info.items.filter((i) => i.needsDate !== false).map(toLine);
  const method = (existing?.method as MethodId) ?? "shipping";
  const cal = await adminCalendar(shop, method, existing?.locationId ?? null, existing, lines);
  return { existing, info, lines, ...cal };
}

/** The chosen slot as the engine sees that day (method, location or zone rules, date overrides, special days). */
function chosenSlot(config: EngineConfig, choice: ScheduleChoice, zoneId: string | null): Slot | null {
  if (!choice.slotId) return null;
  const locationId = choice.method === "pickup" ? choice.locationId : null;
  const rules = resolveRules(config, choice.method, locationId, choice.method === "delivery" ? zoneId : null);
  if (!rules) return null;
  return slotsForDate(rules.capacity, choice.date, specialDayFor(config, choice.date, choice.method, locationId)).find((s) => s.id === choice.slotId) ?? null;
}

/**
 * Set or change the schedule. Capacity and rules are checked unless `force`
 * (merchant override). Updates the order in Shopify first (attributes, tags,
 * metafield), then our record and counts, then fires the Flow trigger, so a
 * Shopify error leaves both sides on the old date.
 */
export async function setOrderSchedule(shop: string, admin: AdminGraphql, orderId: string, choice: ScheduleChoice, opts: { force?: boolean; actor?: string | null } = {}) {
  const existing = await prisma.scheduledOrder.findUnique({ where: { shop_orderId: { shop, orderId } } });
  const info = await orderItems(shop, admin, orderId, existing);
  const lines = info.items.filter((i) => i.needsDate !== false).map(toLine);
  const { config, input } = await adminCalendar(shop, choice.method, choice.locationId, existing, lines, 400);
  if (!opts.force) {
    const r = checkSelection(input, choice.date, choice.slotId);
    if (!r.ok) return { ok: false as const, reason: r.reason, detail: r.detail };
  }
  const method = config.methods.find((m) => m.id === choice.method);
  const slot = chosenSlot(config, choice, existing?.zoneId ?? null);
  const slotLabel = slot ? `${slot.start}-${slot.end}` : null;
  const history = [
    ...(((existing?.history as unknown as unknown[]) ?? []) as unknown[]),
    { at: new Date().toISOString(), by: opts.actor ?? null, from: existing ? { method: existing.method, date: existing.date, slot: existing.slotLabel } : null, to: { method: choice.method, date: choice.date, slot: slotLabel }, forced: !!opts.force },
  ].slice(-20);
  const next = {
    method: choice.method,
    date: choice.date,
    slotId: slot?.id ?? null,
    slotLabel,
    locationId: choice.method === "pickup" ? choice.locationId : null,
    zoneId: existing?.zoneId ?? null,
    area: existing?.area ?? null,
  };
  const limited = existing?.limited ?? false;
  const { settings } = await storefrontConfigFor(shop);

  // 1. Shopify: the order's own attributes, so packing slips and other apps see the new date.
  const sel: Selection = { v: 1, m: next.method, d: next.date, s: next.slotId, t: slotLabel, l: next.locationId, z: next.zoneId, a: next.area, c: null, lbl: null, lc: config.primaryLocale, f: null };
  const loc = config.locations.find((l) => l.id === next.locationId);
  const attrs = await currentAttributes(admin, orderId);
  const merged = new Map(attrs.map((a) => [a.key, a.value]));
  merged.set(ATTR_KEY, encodeSelection(sel));
  merged.set(READABLE_KEYS.method, method?.names[config.primaryLocale] || method?.names.en || choice.method);
  merged.set(READABLE_KEYS.date, choice.date);
  if (slotLabel) merged.set(READABLE_KEYS.slot, slotLabel.replace("-", "–"));
  else merged.delete(READABLE_KEYS.slot);
  if (loc) merged.set(READABLE_KEYS.location, loc.name);
  else merged.delete(READABLE_KEYS.location);
  const res = await gql(admin, `mutation($input: OrderInput!) { orderUpdate(input: $input) { userErrors { message } } }`, {
    input: { id: gid("Order", orderId), customAttributes: [...merged].map(([key, value]) => ({ key, value })) },
  });
  assertNoUserErrors(res.orderUpdate, "orderUpdate");
  // Tags and metafield (not for orders over the plan's monthly limit).
  const itemCount = lines.reduce((n, l) => n + l.quantity, 0);
  const tags = limited
    ? existing?.tags ?? []
    : await writeToShopify(shop, admin, settings, { orderId, orderName: info.name, customerFirst: info.first, selection: sel, ...next, status: "scheduled", items: info.items, itemCount, perItem: [], updatedAt: null, shippingTitle: null }, existing?.tags ?? [], { store: false });

  // 2. Our record and counts.
  const data = {
    orderName: info.name,
    customerFirst: info.first,
    method: next.method,
    date: next.date,
    slotId: next.slotId,
    slotLabel,
    locationId: next.locationId,
    status: existing?.status === "cancelled" ? "cancelled" : existing?.status ?? "scheduled",
    items: info.items as unknown as Prisma.InputJsonValue,
    itemCount,
    tags,
    history: history as unknown as Prisma.InputJsonValue,
  };
  // A merchant-set date replaces any per-item dates.
  const oldItemDates = (await prisma.scheduledItem.findMany({ where: { shop, orderId }, select: { date: true } })).map((i) => i.date);
  const [saved] = await prisma.$transaction([
    existing ? prisma.scheduledOrder.update({ where: { id: existing.id }, data }) : prisma.scheduledOrder.create({ data: { shop, orderId, ...data } }),
    prisma.scheduledItem.deleteMany({ where: { shop, orderId } }),
  ]);
  await recountDates(shop, settings, [existing?.date ?? "", ...oldItemDates, choice.date]);
  schedulePublish(shop);

  if (!limited) await flowTrigger(shop, admin, existing ? "rescheduled" : "scheduled", saved).catch(() => {});
  await logActivity(shop, "order", `${info.name}: ${existing?.date ?? "no date"} → ${choice.date}${slotLabel ? ` ${slotLabel}` : ""}${opts.force ? " (override)" : ""}`, opts.actor ?? null);
  return { ok: true as const, order: saved };
}

async function currentAttributes(admin: AdminGraphql, orderId: string): Promise<{ key: string; value: string }[]> {
  const d = await gql(admin, `query($id: ID!) { order(id: $id) { customAttributes { key value } } }`, { id: gid("Order", orderId) });
  return d.order?.customAttributes ?? [];
}

/** Draft orders: store the choice as custom attributes; the order webhook records it when the draft is completed. */
export async function scheduleDraftOrder(shop: string, admin: AdminGraphql, draftId: string, choice: ScheduleChoice, opts: { force?: boolean } = {}) {
  const d = await gql(
    admin,
    `query($id: ID!) { draftOrder(id: $id) { customAttributes { key value } lineItems(first: 100) { nodes { id title quantity requiresShipping isGiftCard product { id } variant { id } } } } }`,
    { id: gid("DraftOrder", draftId) },
  );
  if (!d.draftOrder) throw new Error("Draft order not found");
  const lines: CartLine[] = d.draftOrder.lineItems.nodes
    .filter((l: any) => l.requiresShipping && !l.isGiftCard)
    .map((l: any) => ({ key: numericId(l.id), productId: numericId(l.product?.id), variantId: numericId(l.variant?.id), quantity: l.quantity, title: l.title }));
  const { config, input } = await adminCalendar(shop, choice.method, choice.locationId, null, lines, 400);
  if (!opts.force) {
    const r = checkSelection(input, choice.date, choice.slotId);
    if (!r.ok) return { ok: false as const, reason: r.reason, detail: r.detail };
  }
  const method = config.methods.find((m) => m.id === choice.method);
  const slot = chosenSlot(config, choice, null);
  const sel: Selection = { v: 1, m: choice.method, d: choice.date, s: slot?.id ?? null, t: slot ? `${slot.start}-${slot.end}` : null, l: choice.method === "pickup" ? choice.locationId : null, z: null, a: null, c: null, lbl: null, lc: config.primaryLocale, f: null };
  const merged = new Map<string, string>((d.draftOrder.customAttributes as { key: string; value: string }[]).map((a) => [a.key, a.value]));
  merged.set(ATTR_KEY, encodeSelection(sel));
  merged.set(READABLE_KEYS.method, method?.names[config.primaryLocale] || method?.names.en || choice.method);
  merged.set(READABLE_KEYS.date, choice.date);
  if (sel.t) merged.set(READABLE_KEYS.slot, sel.t.replace("-", "–"));
  const loc = config.locations.find((l) => l.id === sel.l);
  if (loc) merged.set(READABLE_KEYS.location, loc.name);
  const res = await gql(admin, `mutation($id: ID!, $input: DraftOrderInput!) { draftOrderUpdate(id: $id, input: $input) { userErrors { message } } }`, {
    id: gid("DraftOrder", draftId),
    input: { customAttributes: [...merged].map(([key, value]) => ({ key, value })) },
  });
  assertNoUserErrors(res.draftOrderUpdate, "draftOrderUpdate");
  return { ok: true as const };
}
