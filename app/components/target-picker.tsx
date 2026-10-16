/**
 * Pick which products a rule applies to: products, variants, collections
 * (App Bridge resource picker) and product tags. Ids are stored numeric.
 */
import { useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { Target } from "../../core/types";
import { useT } from "../i18n/react";
import { Button, TextField } from "./polaris";

export interface TargetTitle {
  title: string;
  /** For variants: numeric id of the parent product. */
  productId?: string;
}
/** gid -> title, as resolved by the loader or the picker. */
export type TitleMap = Record<string, TargetTitle>;

export const toGid = (type: "Product" | "ProductVariant" | "Collection", id: string) => `gid://shopify/${type}/${id}`;
export const tailId = (g: string) => String(g).split("/").pop()!.split("?")[0];

/** Picker preselection for the products and variants in a target. */
export function productSelection(t: Target, titles: TitleMap): { id: string; variants?: { id: string }[] }[] {
  const out: { id: string; variants?: { id: string }[] }[] = t.products.map((id) => ({ id: toGid("Product", id) }));
  const groups = new Map<string, string[]>();
  for (const v of t.variants) {
    const pid = titles[toGid("ProductVariant", v)]?.productId;
    if (!pid || t.products.includes(pid)) continue;
    groups.set(pid, [...(groups.get(pid) ?? []), v]);
  }
  for (const [pid, vs] of groups) out.push({ id: toGid("Product", pid), variants: vs.map((v) => ({ id: toGid("ProductVariant", v) })) });
  return out;
}

export interface PickedProduct {
  id: string;
  title: string;
  hasOnlyDefaultVariant?: boolean;
  totalVariants?: number;
  variants?: { id?: string; title?: string; displayName?: string }[];
}

/**
 * Apply a product picker result: whole products when every variant is chosen,
 * otherwise the chosen variants. Variants whose product is unknown are kept.
 */
export function applyProductPick(t: Target, titles: TitleMap, picked: PickedProduct[]): { target: Target; titles: TitleMap } {
  const keptVariants = t.variants.filter((v) => !titles[toGid("ProductVariant", v)]?.productId);
  const products: string[] = [];
  const variants: string[] = [...keptVariants];
  const fresh: TitleMap = {};
  for (const p of picked) {
    const pid = tailId(p.id);
    const vs = (p.variants ?? []).filter((v): v is { id: string; title?: string; displayName?: string } => !!v?.id);
    if (p.hasOnlyDefaultVariant || !vs.length || (p.totalVariants !== undefined && vs.length >= p.totalVariants)) {
      products.push(pid);
      fresh[p.id] = { title: p.title };
    } else {
      for (const v of vs) {
        variants.push(tailId(v.id));
        fresh[v.id] = { title: v.displayName || [p.title, v.title].filter(Boolean).join(" - "), productId: pid };
      }
    }
  }
  return { target: { ...t, products: [...new Set(products)], variants: [...new Set(variants)] }, titles: fresh };
}

type Kind = "products" | "variants" | "collections" | "tags";

export function TargetPicker(p: {
  label: string;
  details?: string;
  value: Target;
  onChange: (t: Target) => void;
  titles: TitleMap;
  onTitles: (fresh: TitleMap) => void;
  id?: string;
  error?: string;
  disabled?: boolean;
}) {
  const shopify = useAppBridge();
  const t = useT();
  const [tag, setTag] = useState("");
  const v = p.value;

  const pickProducts = async () => {
    const res = await shopify.resourcePicker({
      type: "product",
      multiple: true,
      action: "select",
      selectionIds: productSelection(v, p.titles),
      filter: { variants: true },
    });
    if (!res) return;
    const out = applyProductPick(v, p.titles, res as unknown as PickedProduct[]);
    p.onTitles(out.titles);
    p.onChange(out.target);
  };

  const pickCollections = async () => {
    const res = await shopify.resourcePicker({
      type: "collection",
      multiple: true,
      action: "select",
      selectionIds: v.collections.map((id) => ({ id: toGid("Collection", id) })),
    });
    if (!res) return;
    const fresh: TitleMap = {};
    for (const c of res) fresh[c.id] = { title: c.title };
    p.onTitles(fresh);
    p.onChange({ ...v, collections: [...new Set(res.map((c) => tailId(c.id)))] });
  };

  const addTag = () => {
    const clean = tag.trim();
    if (!clean) return;
    if (!v.tags.some((x) => x.toLowerCase() === clean.toLowerCase())) p.onChange({ ...v, tags: [...v.tags, clean] });
    setTag("");
  };

  const remove = (kind: Kind, id: string) => p.onChange({ ...v, [kind]: v[kind].filter((x) => x !== id) });

  const titleOf = (type: "Product" | "ProductVariant" | "Collection", id: string) =>
    p.titles[toGid(type, id)]?.title || t("products.picker.unknown", { id });

  const items: { kind: Kind; id: string; badge: string; title: string }[] = [
    ...v.products.map((id) => ({ kind: "products" as Kind, id, badge: t("products.picker.product"), title: titleOf("Product", id) })),
    ...v.variants.map((id) => ({ kind: "variants" as Kind, id, badge: t("products.picker.variant"), title: titleOf("ProductVariant", id) })),
    ...v.collections.map((id) => ({ kind: "collections" as Kind, id, badge: t("products.picker.collection"), title: titleOf("Collection", id) })),
    ...v.tags.map((id) => ({ kind: "tags" as Kind, id, badge: t("products.picker.tag"), title: id })),
  ];

  return (
    <s-stack gap="small-200" id={p.id}>
      <s-text type="strong">{p.label}</s-text>
      {p.details ? <s-text color="subdued">{p.details}</s-text> : null}
      <s-stack direction="inline" gap="small-200">
        <Button icon="product" onClick={pickProducts} disabled={p.disabled}>
          {t("products.picker.chooseProducts")}
        </Button>
        <Button icon="collection" onClick={pickCollections} disabled={p.disabled}>
          {t("products.picker.chooseCollections")}
        </Button>
      </s-stack>
      <s-stack direction="inline" gap="small-200" alignItems="end">
        <s-box inlineSize="260px">
          <TextField label={t("products.picker.tagLabel")} value={tag} placeholder={t("products.picker.tagPlaceholder")} maxLength={255} disabled={p.disabled} onChange={setTag} />
        </s-box>
        <Button onClick={addTag} disabled={p.disabled || !tag.trim()}>
          {t("products.picker.addTag")}
        </Button>
      </s-stack>
      {items.length ? (
        <s-stack gap="small-100">
          {items.map((it) => (
            <s-stack key={it.kind + it.id} direction="inline" gap="small-200" alignItems="center">
              <s-badge>{it.badge}</s-badge>
              <s-text>{it.title}</s-text>
              <Button
                variant="tertiary"
                icon="x"
                disabled={p.disabled}
                accessibilityLabel={t("products.picker.remove", { name: it.title })}
                onClick={() => remove(it.kind, it.id)}
              >
                {""}
              </Button>
            </s-stack>
          ))}
        </s-stack>
      ) : (
        <s-text color="subdued">{t("products.picker.none")}</s-text>
      )}
      {p.error ? <s-text tone="critical">{p.error}</s-text> : null}
    </s-stack>
  );
}
