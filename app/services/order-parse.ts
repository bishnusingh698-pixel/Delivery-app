/**
 * Turns an orders/* webhook payload into what Pickday stores. Pure (tested).
 * Personal data kept: order number and customer first name only.
 */
import { datedLines } from "../../core/rules";
import { ATTR_KEY, decodeItemSelection, decodeSelection } from "../../core/selection";
import type { CartLine, MethodId, Selection, Settings } from "../../core/types";
import type { StoredItem } from "./counts.server";

export interface OrderPayload {
  id: number | string;
  name: string;
  updated_at?: string;
  created_at?: string;
  cancelled_at?: string | null;
  fulfillment_status?: string | null;
  note_attributes?: { name: string; value: string }[];
  customer?: { first_name?: string | null } | null;
  shipping_lines?: { title?: string; code?: string; source?: string }[];
  line_items: {
    id: number | string;
    product_id: number | string | null;
    variant_id: number | string | null;
    title: string;
    variant_title?: string | null;
    quantity: number;
    current_quantity?: number;
    gift_card?: boolean;
    requires_shipping?: boolean;
    properties?: { name: string; value: string }[];
  }[];
}

export interface ParsedOrder {
  orderId: string;
  orderName: string;
  customerFirst: string | null;
  selection: Selection | null;
  method: MethodId;
  date: string | null;
  slotId: string | null;
  slotLabel: string | null;
  locationId: string | null;
  zoneId: string | null;
  area: string | null;
  status: "scheduled" | "fulfilled" | "cancelled";
  items: StoredItem[];
  itemCount: number;
  /** Per-item mode: lines with their own date. */
  perItem: { lineId: string; productId: string; variantId: string; title: string; qty: number; date: string; slotId: string | null }[];
  updatedAt: Date | null;
  shippingTitle: string | null;
}

const attr = (list: { name: string; value: string }[] | undefined, key: string) => list?.find((a) => a.name === key)?.value ?? null;

/** null when the order has no Pickday choice at all. */
export function parseOrder(p: OrderPayload, settings: Pick<Settings, "productRules" | "surcharges">): ParsedOrder | null {
  const sel = decodeSelection(attr(p.note_attributes, ATTR_KEY));
  const fees = new Set(settings.surcharges.map((s) => s.variantId).filter(Boolean) as string[]);
  const lines = p.line_items.filter((l) => !fees.has(String(l.variant_id)));
  const itemSel = new Map(lines.map((l) => [String(l.id), decodeItemSelection(attr(l.properties, ATTR_KEY))]));
  if (!sel && ![...itemSel.values()].some((s) => s?.d)) return null;

  const cartLines: CartLine[] = lines.map((l) => ({
    key: String(l.id),
    productId: String(l.product_id ?? ""),
    variantId: String(l.variant_id ?? ""),
    quantity: l.current_quantity ?? l.quantity,
    title: l.title,
    giftCard: !!l.gift_card,
    requiresShipping: l.requires_shipping !== false,
  }));
  const dated = new Set(datedLines(cartLines, settings.productRules).map((l) => l.key));
  const items: StoredItem[] = lines
    .filter((l) => (l.current_quantity ?? l.quantity) > 0)
    .map((l) => ({
      lineId: String(l.id),
      productId: String(l.product_id ?? ""),
      variantId: String(l.variant_id ?? ""),
      title: l.title,
      variant: l.variant_title || null,
      qty: l.current_quantity ?? l.quantity,
      date: itemSel.get(String(l.id))?.d ?? null,
      slotId: itemSel.get(String(l.id))?.s ?? null,
      needsDate: dated.has(String(l.id)),
    }));
  const perItem = items
    .filter((i) => i.needsDate && i.date)
    .map((i) => ({ lineId: i.lineId, productId: i.productId, variantId: i.variantId, title: i.title, qty: i.qty, date: i.date!, slotId: i.slotId ?? null }));
  const firstItemDate = perItem[0]?.date ?? null;
  const sameDate = perItem.every((i) => i.date === firstItemDate);

  const status: ParsedOrder["status"] = p.cancelled_at ? "cancelled" : p.fulfillment_status === "fulfilled" ? "fulfilled" : "scheduled";
  return {
    orderId: String(p.id),
    orderName: p.name,
    customerFirst: p.customer?.first_name?.trim() || null,
    selection: sel,
    method: sel?.m ?? "shipping",
    date: sel?.d ?? (perItem.length && sameDate ? firstItemDate : null),
    slotId: sel?.s ?? (perItem.length && sameDate ? perItem[0].slotId : null),
    slotLabel: sel?.t ?? null,
    locationId: sel?.m === "pickup" ? sel.l : null,
    zoneId: sel?.z ?? null,
    area: sel?.a ?? null,
    status,
    items,
    itemCount: items.filter((i) => i.needsDate).reduce((n, i) => n + i.qty, 0),
    perItem: sel?.d ? [] : perItem,
    updatedAt: p.updated_at ? new Date(p.updated_at) : null,
    shippingTitle: p.shipping_lines?.[0]?.title ?? null,
  };
}

/** Order tags Pickday adds (fixed English so filters and Flow can rely on them). */
export function orderTags(o: Pick<ParsedOrder, "method" | "date" | "slotLabel" | "perItem">, prefix: string, locationName: string | null): string[] {
  const p = prefix.trim();
  const tag = (s: string) => `${p}${s}`.slice(0, 40);
  const method = o.method === "delivery" ? "Local delivery" : o.method === "pickup" ? "Pickup" : "Shipping";
  const tags = [tag("Pickday"), tag(method)];
  const dates = o.date ? [o.date] : [...new Set(o.perItem.map((i) => i.date))];
  for (const d of dates.slice(0, 5)) tags.push(tag(d));
  if (o.slotLabel) tags.push(tag(o.slotLabel));
  if (locationName) tags.push(tag(locationName));
  return [...new Set(tags)];
}

/** Does the checkout shipping option disagree with the chosen method? (checkout matching off or misconfigured) */
export function methodMismatch(o: Pick<ParsedOrder, "method" | "shippingTitle" | "selection">, rateMap: { title: string; method: MethodId | "ignore" }[]): boolean {
  if (!o.selection || !o.shippingTitle) return false;
  const t = o.shippingTitle.trim().toLowerCase();
  const mapped = rateMap.find((r) => r.title.trim().toLowerCase() === t)?.method;
  if (mapped && mapped !== "ignore") return mapped !== o.method;
  return false;
}
