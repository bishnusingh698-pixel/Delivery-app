import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { METHOD_IDS, type MethodId } from "../../core/types";
import { isValidDate } from "../../core/civil";
import { adminCalendar, getOrderSchedule, setOrderSchedule } from "../services/reschedule.server";
import { toLine, type StoredItem } from "../services/counts.server";

/**
 * Used by the order page block and the "Change delivery date" order action
 * (admin UI extensions, authenticated with a session token).
 * GET  /api/order/:id?method=&location=  → current schedule + selectable days
 * POST /api/order/:id {method,date,slotId,locationId,force} → set it
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session, cors } = await authenticate.admin(request);
  const id = String(params.id);
  const url = new URL(request.url);
  const base = await getOrderSchedule(session.shop, admin, id);
  const method = (url.searchParams.get("method") as MethodId) || (base.existing?.method as MethodId) || base.config.defaultMethod || "shipping";
  const location = url.searchParams.get("location") || base.existing?.locationId || null;
  const lines = (base.info.items as StoredItem[]).filter((i) => i.needsDate !== false).map(toLine);
  const cal = method === base.existing?.method && location === (base.existing?.locationId ?? null) ? base : await adminCalendar(session.shop, method, location, base.existing, lines);
  return cors(
    Response.json({
      order: base.existing
        ? { method: base.existing.method, date: base.existing.date, slot: base.existing.slotLabel, locationId: base.existing.locationId, status: base.existing.status, limited: base.existing.limited, history: base.existing.history }
        : null,
      name: base.info.name,
      needsDate: lines.length > 0,
      methods: base.config.methods.filter((m) => m.enabled).map((m) => ({ id: m.id, name: m.names[base.config.primaryLocale] || m.names.en || m.id })),
      locations: base.config.locations.filter((l) => l.enabled).map((l) => ({ id: l.id, name: l.name })),
      method,
      locationId: location,
      timeZone: base.config.tz,
      days: cal.days.slice(0, 90).map((d) => ({
        date: d.date,
        available: d.available,
        reason: d.reason,
        left: d.left,
        slots: d.slots.map((s) => ({ id: s.slot.id, label: `${s.slot.start}–${s.slot.end}`, available: s.available, left: s.left })),
      })),
    }),
  );
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session, cors } = await authenticate.admin(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const method = body.method as MethodId;
  const date = body.date;
  if (!METHOD_IDS.includes(method) || !isValidDate(date)) return cors(Response.json({ ok: false, reason: "invalid" }, { status: 400 }));
  const r = await setOrderSchedule(
    session.shop,
    admin,
    String(params.id),
    { method, date, slotId: typeof body.slotId === "string" ? body.slotId : null, locationId: typeof body.locationId === "string" ? body.locationId : null },
    { force: body.force === true, actor: session.onlineAccessInfo?.associated_user?.first_name ?? null },
  );
  return cors(Response.json(r.ok ? { ok: true } : { ok: false, reason: r.reason, detail: r.detail }, { status: r.ok ? 200 : 409 }));
};
