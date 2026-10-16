import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { METHOD_IDS, type MethodId } from "../../core/types";
import { isValidDate } from "../../core/civil";
import { adminCalendar, scheduleDraftOrder } from "../services/reschedule.server";
import { gid, gql, numericId } from "../services/graphql.server";
import { ATTR_KEY, decodeSelection } from "../../core/selection";
import type { CartLine } from "../../core/types";

/** Draft order action: pick a date for a phone/wholesale order before it's completed. */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session, cors } = await authenticate.admin(request);
  const url = new URL(request.url);
  const d = await gql(
    admin,
    `query($id: ID!) { draftOrder(id: $id) { name customAttributes { key value } lineItems(first: 100) { nodes { id title quantity requiresShipping isGiftCard product { id } variant { id } } } } }`,
    { id: gid("DraftOrder", String(params.id)) },
  );
  if (!d.draftOrder) return cors(Response.json({ error: "not found" }, { status: 404 }));
  const current = decodeSelection(d.draftOrder.customAttributes.find((a: { key: string }) => a.key === ATTR_KEY)?.value);
  const lines: CartLine[] = d.draftOrder.lineItems.nodes
    .filter((l: any) => l.requiresShipping && !l.isGiftCard)
    .map((l: any) => ({ key: numericId(l.id), productId: numericId(l.product?.id), variantId: numericId(l.variant?.id), quantity: l.quantity, title: l.title }));
  const method = (url.searchParams.get("method") as MethodId) || current?.m || "shipping";
  const location = url.searchParams.get("location") || current?.l || null;
  const cal = await adminCalendar(session.shop, method, location, null, lines);
  return cors(
    Response.json({
      order: current ? { method: current.m, date: current.d, slot: current.t, locationId: current.l } : null,
      name: d.draftOrder.name,
      needsDate: lines.length > 0,
      methods: cal.config.methods.filter((m) => m.enabled).map((m) => ({ id: m.id, name: m.names[cal.config.primaryLocale] || m.names.en || m.id })),
      locations: cal.config.locations.filter((l) => l.enabled).map((l) => ({ id: l.id, name: l.name })),
      method,
      locationId: location,
      timeZone: cal.config.tz,
      days: cal.days.slice(0, 90).map((x) => ({ date: x.date, available: x.available, reason: x.reason, left: x.left, slots: x.slots.map((s) => ({ id: s.slot.id, label: `${s.slot.start}–${s.slot.end}`, available: s.available, left: s.left })) })),
    }),
  );
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session, cors } = await authenticate.admin(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const method = body.method as MethodId;
  if (!METHOD_IDS.includes(method) || !isValidDate(body.date)) return cors(Response.json({ ok: false, reason: "invalid" }, { status: 400 }));
  const r = await scheduleDraftOrder(session.shop, admin, String(params.id), { method, date: body.date as string, slotId: (body.slotId as string) ?? null, locationId: (body.locationId as string) ?? null }, { force: body.force === true });
  return cors(Response.json(r, { status: r.ok ? 200 : 409 }));
};
