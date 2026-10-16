/**
 * Logic of the two Shopify Functions, kept pure so it can be unit tested.
 * Runs inside Javy (no Intl): only civil-date math and the ICU-lite formatter.
 *
 *  - validate():          cart.validations.generate.run (the backstop)
 *  - customizeDelivery(): cart.delivery-options.transform.run (checkout matching)
 */
import { checkSelection, type EngineInput } from "./engine";
import { format } from "./i18n/format";
import { matchLocale } from "./i18n/locales";
import { datedLines, methodsFor } from "./rules";
import { ATTR_KEY, decodeItemSelection, decodeSelection } from "./selection";
import type { Availability, CartLine, MethodId, Selection, StorefrontConfig } from "./types";

export type Messages = Record<string, Record<string, string>>;

export type FunctionConfig = StorefrontConfig & { trimmed?: boolean; avail?: Availability | null };

/* ------------------------------------------------------- validation */

export interface ValidationInput {
  buyerJourney?: { step?: string | null } | null;
  cart: {
    attribute?: { value?: string | null } | null;
    cost?: { subtotalAmount?: { amount: string; currencyCode?: string } | null } | null;
    deliveryGroups?: { deliveryAddress?: { countryCode?: string | null; zip?: string | null; provinceCode?: string | null } | null }[];
    lines: {
      id?: string;
      quantity: number;
      attribute?: { value?: string | null } | null;
      merchandise: {
        __typename?: string;
        id?: string;
        requiresShipping?: boolean;
        product?: {
          id: string;
          isGiftCard?: boolean;
          hasTags?: { tag: string; hasTag: boolean }[];
          inCollections?: { collectionId: string; isMember: boolean }[];
        };
      };
    }[];
  };
  localization?: { language?: { isoCode?: string } | null; country?: { isoCode?: string } | null } | null;
  presentmentCurrencyRate?: string | number | null;
  shop?: { localTime?: Record<string, unknown> & { date?: string } } | null;
  validation?: { metafield?: { jsonValue?: unknown } | null } | null;
}

export interface ValidationError {
  message: string;
  target: string;
}

const tail = (gid: string | undefined) => (gid ? gid.slice(gid.lastIndexOf("/") + 1) : "");

/** Current minutes in the shop zone, floored to the hour (from `hNN: timeAfter(...)` aliases). */
export function minutesFromAliases(localTime: Record<string, unknown> | undefined): number {
  let m = 0;
  for (let h = 1; h < 24; h++) if (localTime?.[`h${String(h).padStart(2, "0")}`] === true) m = h * 60;
  return m;
}

/** The hourly aliases for the input query (kept in sync with minutesFromAliases). */
export function timeAliasesGraphql(): string {
  const out: string[] = [];
  for (let h = 1; h < 24; h++) {
    const hh = String(h).padStart(2, "0");
    out.push(`h${hh}: timeAfter(time: "${hh}:00:00")`);
  }
  return out.join("\n        ");
}

export function textFor(messages: Messages, overrides: StorefrontConfig["texts"] | undefined, language: string | undefined, key: string): string {
  const raw = (language ?? "en").replace("_", "-");
  const loc = matchLocale(raw);
  return overrides?.[raw]?.[key] ?? overrides?.[loc]?.[key] ?? messages[loc]?.[key] ?? messages.en?.[key] ?? key;
}

export function toLines(input: ValidationInput, cfg: FunctionConfig): { lines: CartLine[]; feeQty: Map<string, number>; itemSel: Map<string, ReturnType<typeof decodeItemSelection>> } {
  const feeVariants = new Set(cfg.surcharges.map((s) => s.variantId).filter(Boolean) as string[]);
  const feeQty = new Map<string, number>();
  const itemSel = new Map<string, ReturnType<typeof decodeItemSelection>>();
  const lines: CartLine[] = [];
  input.cart.lines.forEach((l, i) => {
    const m = l.merchandise;
    if (m.__typename && m.__typename !== "ProductVariant") return;
    const variantId = tail(m.id);
    if (feeVariants.has(variantId)) {
      feeQty.set(variantId, (feeQty.get(variantId) ?? 0) + l.quantity);
      return;
    }
    const key = l.id ?? String(i);
    itemSel.set(key, decodeItemSelection(l.attribute?.value));
    lines.push({
      key,
      productId: tail(m.product?.id),
      variantId,
      quantity: l.quantity,
      title: "",
      giftCard: !!m.product?.isGiftCard,
      requiresShipping: m.requiresShipping !== false,
      tags: (m.product?.hasTags ?? []).filter((t) => t.hasTag).map((t) => t.tag),
      collections: (m.product?.inCollections ?? []).filter((c) => c.isMember).map((c) => tail(c.collectionId)),
    });
  });
  return { lines, feeQty, itemSel };
}

/** Never blocks adding to cart; only checkout. */
export function validate(input: ValidationInput, messages: Messages): ValidationError[] {
  const step = input.buyerJourney?.step;
  if (step === "CART_INTERACTION") return [];
  const cfg = input.validation?.metafield?.jsonValue as FunctionConfig | null | undefined;
  if (!cfg || !Array.isArray(cfg.methods)) return [];
  const lang = input.localization?.language?.isoCode;
  const t = (key: string, values: Record<string, string | number | null> = {}) =>
    format(textFor(messages, cfg.texts, lang, key), values, { plural: () => "other", number: (n) => String(n) });
  const err = (key: string, values?: Record<string, string | number | null>): ValidationError[] => [{ message: t(key, values), target: "$.cart" }];

  const { lines, feeQty, itemSel } = toLines(input, cfg);
  const dated = datedLines(lines, cfg.productRules);
  if (!dated.length) return [];
  const address = input.cart.deliveryGroups?.find((g) => g.deliveryAddress?.countryCode)?.deliveryAddress;
  const country = address?.countryCode ?? input.localization?.country?.isoCode ?? null;
  const methods = methodsFor(cfg, country, dated);
  if (!methods.length) return [];

  const sel = decodeSelection(input.cart.attribute?.value);
  if (!sel) {
    const required = methods.some((id) => cfg.methods.find((m) => m.id === id)?.dateRequired);
    return required ? err(cfg.dateMode === "item" ? "validation.missingItemDate" : "validation.missingDate") : [];
  }
  if (!methods.includes(sel.m)) return err("validation.methodUnavailable");
  const method = cfg.methods.find((m) => m.id === sel.m)!;

  const rate = Number(input.presentmentCurrencyRate ?? 1) || 1;
  if (method.minOrder && input.cart.cost?.subtotalAmount) {
    const min = Number(method.minOrder) * rate;
    if (Number(input.cart.cost.subtotalAmount.amount) < min - 0.005) {
      const name = method.names[lang ?? ""] || method.names[matchLocale(lang)] || t(`method.${sel.m}`);
      return err("validation.minOrder", { method: name, amount: `${min.toFixed(2)} ${input.cart.cost.subtotalAmount.currencyCode ?? ""}`.trim() });
    }
  }

  const now = { date: input.shop?.localTime?.date ?? "", minutes: minutesFromAliases(input.shop?.localTime) };
  if (!now.date) return [];
  const base: EngineInput = {
    config: cfg,
    availability: cfg.avail ?? null,
    method: sel.m,
    locationId: sel.m === "pickup" ? sel.l : null,
    zoneId: sel.m === "delivery" && !cfg.trimmed ? sel.z : null,
    now,
    lines: dated,
  };

  if (cfg.dateMode === "item") {
    for (const line of dated) {
      const it = itemSel.get(line.key);
      if (!it?.d) {
        if (method.dateRequired) return err("validation.missingItemDate");
        continue;
      }
      const r = checkSelection({ ...base, lines: [line] }, it.d, it.s);
      if (!r.ok) return problem(r.reason, it.lbl ?? it.d, method.dateRequired, err);
    }
    return [];
  }

  if (!sel.d) return method.dateRequired ? err("validation.missingDate") : [];
  const r = checkSelection(base, sel.d, sel.s);
  if (!r.ok) return problem(r.reason, sel.lbl ?? sel.d, method.dateRequired, err);

  // Surcharge lines must match the chosen date/slot (Pro feature, D-19).
  const wanted = new Set(r.fees.map((f) => f.variantId).filter(Boolean) as string[]);
  for (const v of wanted) if (!feeQty.get(v)) return err("validation.surcharge");
  for (const [v, q] of feeQty) if (q > 0 && !wanted.has(v)) return err("validation.surcharge");
  return [];
}

function problem(reason: string, label: string, required: boolean, err: (k: string, v?: Record<string, string>) => ValidationError[]): ValidationError[] {
  if (reason === "noDate" || reason === "slotRequired") return required ? err("validation.missingDate") : [];
  if (reason === "methodUnavailable") return err("validation.methodUnavailable");
  return err("validation.dateUnavailable", { date: label });
}

/* ---------------------------------------------- delivery customization */

export interface DeliveryConfig {
  enabled: boolean;
  rename: boolean;
  rateMap: { title: string; method: MethodId | "ignore" }[];
  locations: { id: string; name: string }[];
  names: Record<string, Record<string, string>>;
  texts: Record<string, Record<string, string>>;
}

export interface DeliveryInput {
  cart: {
    attribute?: { value?: string | null } | null;
    deliveryGroups: { id: string; deliveryOptions: { handle: string; title?: string | null; deliveryMethodType: string }[] }[];
  };
  localization?: { language?: { isoCode?: string } | null } | null;
  deliveryCustomization?: { metafield?: { jsonValue?: unknown } | null } | null;
}

export type DeliveryOperation = { deliveryOptionHide: { deliveryOptionHandle: string } } | { deliveryOptionRename: { deliveryOptionHandle: string; title: string } };

const TYPE_METHOD: Record<string, MethodId | undefined> = { LOCAL: "delivery", PICK_UP: "pickup", SHIPPING: "shipping", PICKUP_POINT: "shipping", RETAIL: "pickup" };

export function optionMethod(cfg: DeliveryConfig, o: { title?: string | null; deliveryMethodType: string }): MethodId | "ignore" | null {
  const title = (o.title ?? "").trim().toLowerCase();
  const mapped = cfg.rateMap.find((r) => r.title && r.title === title);
  if (mapped) return mapped.method;
  return TYPE_METHOD[o.deliveryMethodType] ?? null;
}

/**
 * Hide checkout options that don't match the shopper's choice and add the date to
 * the kept one. If nothing would remain in a group, that group is left untouched.
 */
export function customizeDelivery(input: DeliveryInput, messages: Messages): DeliveryOperation[] {
  const cfg = input.deliveryCustomization?.metafield?.jsonValue as DeliveryConfig | null | undefined;
  if (!cfg?.enabled) return [];
  const sel: Selection | null = decodeSelection(input.cart.attribute?.value);
  if (!sel) return [];
  const lang = input.localization?.language?.isoCode;
  const ops: DeliveryOperation[] = [];
  const locName = sel.l ? cfg.locations.find((l) => l.id === sel.l)?.name?.trim().toLowerCase() : null;
  for (const g of input.cart.deliveryGroups) {
    let keep = g.deliveryOptions.filter((o) => optionMethod(cfg, o) === sel.m);
    if (sel.m === "pickup" && locName) {
      const atLoc = keep.filter((o) => (o.title ?? "").toLowerCase().includes(locName));
      if (atLoc.length) keep = atLoc;
    }
    if (!keep.length) continue;
    const kept = new Set(keep.map((o) => o.handle));
    for (const o of g.deliveryOptions) if (!kept.has(o.handle) && optionMethod(cfg, o) !== "ignore") ops.push({ deliveryOptionHide: { deliveryOptionHandle: o.handle } });
    if (cfg.rename && sel.lbl) {
      const key = sel.m === "pickup" ? "checkout.renamePickup" : "checkout.renameDate";
      const tpl = textFor(messages, cfg.texts, lang, key);
      for (const o of keep) {
        const option = o.title ?? "";
        if (option.includes(sel.lbl)) continue;
        ops.push({ deliveryOptionRename: { deliveryOptionHandle: o.handle, title: format(tpl, { option, date: sel.lbl }, { plural: () => "other" }).slice(0, 255) } });
      }
    }
  }
  return ops;
}

export { ATTR_KEY };
