import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { isValidDate } from "../../core/civil";
import { CUSTOMER_ACTOR, changeDeadline, customerChangeBlock, type ChangeBlock } from "../../core/customer-change";
import { engineTimeZone } from "../../core/engine";
import { hasFeature } from "../../core/publish";
import type { MethodId, Settings } from "../../core/types";
import { loadSettings } from "../models/settings.server";
import { planOf } from "../models/shop.server";
import { authenticate, unauthenticated } from "../shopify.server";
import { toLine, type StoredItem } from "../services/counts.server";
import { gid, gql, numericId } from "../services/graphql.server";
import { storefrontConfigFor } from "../services/publish.server";
import { adminCalendar, setOrderSchedule } from "../services/reschedule.server";

/**
 * Customers change their own date from the order status page (customer account UI extension
 * "pickday-customer-change", authenticated with the customer account session token).
 * GET  /api/customer/order/:id        → can they change it? (menu button)
 * GET  /api/customer/order/:id?days=1 → plus the dates they can pick (modal)
 * POST /api/customer/order/:id {date, slotId} → change it (same rules and limits as the cart)
 * The order must belong to the signed-in customer; anything else answers "not found".
 */
const DAYS = 60;

type Checked =
  | { ok: false; status: number; block: ChangeBlock | "notFound" }
  | { ok: true; shop: string; admin: Awaited<ReturnType<typeof unauthenticated.admin>>["admin"]; existing: NonNullable<Awaited<ReturnType<typeof prisma.scheduledOrder.findUnique>>>; settings: Settings; block: ChangeBlock | null; timeZone: string };

async function check(rawId: string | undefined, sub: string | undefined, dest: string): Promise<Checked> {
  const shop = dest.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const orderId = numericId(rawId);
  if (!sub || !/^\d+$/.test(orderId)) return { ok: false, status: 404, block: "notFound" };
  const row = await prisma.shop.findUnique({ where: { shop } });
  if (!row?.active) return { ok: false, status: 404, block: "notFound" };
  // Checked first: the menu button asks on every order page view, in every store.
  const { settings } = await loadSettings(shop);
  if (!hasFeature(planOf(row), "customerChanges") || !settings.customerChanges.enabled) return { ok: false, status: 200, block: "off" };
  const existing = await prisma.scheduledOrder.findUnique({ where: { shop_orderId: { shop, orderId } } });
  if (!existing) return { ok: false, status: 404, block: "notFound" };
  const { admin } = await unauthenticated.admin(shop);
  // Live from Shopify: who owns the order and whether it's still open.
  const live = await gql(admin, `query($id: ID!) { order(id: $id) { customer { id } cancelledAt displayFulfillmentStatus } }`, { id: gid("Order", orderId) });
  const o = live.order;
  if (!o || !o.customer?.id || numericId(o.customer.id) !== numericId(sub)) return { ok: false, status: 404, block: "notFound" };
  const { config } = await storefrontConfigFor(shop);
  const timeZone = engineTimeZone(config, existing.method as MethodId, existing.locationId);
  let block = customerChangeBlock(settings.customerChanges, existing, timeZone);
  if (!block && o.cancelledAt) block = "cancelled";
  if (!block && o.displayFulfillmentStatus !== "UNFULFILLED") block = "fulfilled";
  return { ok: true, shop, admin, existing, settings, block, timeZone };
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { sessionToken, cors } = await authenticate.public.customerAccount(request);
  const c = await check(params.id, sessionToken.sub, sessionToken.dest);
  if (!c.ok) return cors(Response.json({ canChange: false, block: c.block }, { status: c.status }));
  const { existing, settings } = c;
  const body: Record<string, unknown> = {
    canChange: !c.block,
    block: c.block,
    current: { method: existing.method, date: existing.date, slot: existing.slotLabel?.replace("-", "–") ?? null },
    deadline: changeDeadline(settings.customerChanges, existing, c.timeZone)?.toISOString() ?? null,
  };
  if (!c.block && new URL(request.url).searchParams.get("days")) {
    const lines = ((existing.items as unknown as StoredItem[]) ?? []).filter((i) => i.needsDate !== false).map(toLine);
    const cal = await adminCalendar(c.shop, existing.method as MethodId, existing.locationId, existing, lines, DAYS);
    body.days = cal.days
      .filter((d) => d.available)
      .map((d) => ({
        date: d.date,
        slots: d.slots.filter((s) => s.available).map((s) => ({ id: s.slot.id, label: `${s.slot.start}–${s.slot.end}` })),
      }));
  }
  return cors(Response.json(body));
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { sessionToken, cors } = await authenticate.public.customerAccount(request);
  if (request.method !== "POST") return cors(new Response(null, { status: 405 }));
  const c = await check(params.id, sessionToken.sub, sessionToken.dest);
  if (!c.ok) return cors(Response.json({ ok: false, reason: c.block }, { status: c.status }));
  if (c.block) return cors(Response.json({ ok: false, reason: c.block }, { status: 409 }));
  const input = (await request.json().catch(() => ({}))) as { date?: unknown; slotId?: unknown };
  const slotId = typeof input.slotId === "string" && input.slotId ? input.slotId : null;
  if (!isValidDate(input.date)) return cors(Response.json({ ok: false, reason: "invalid" }, { status: 400 }));
  const { existing } = c;
  if (input.date === existing.date && slotId === existing.slotId) return cors(Response.json({ ok: true }));
  const r = await setOrderSchedule(
    c.shop,
    c.admin,
    existing.orderId,
    { method: existing.method as MethodId, date: input.date, slotId, locationId: existing.locationId },
    { actor: CUSTOMER_ACTOR },
  );
  return cors(Response.json(r.ok ? { ok: true } : { ok: false, reason: r.reason }, { status: r.ok ? 200 : 409 }));
};
