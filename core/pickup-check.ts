/**
 * Do Pickday's pickup locations match Shopify's Local pickup? (D-78)
 *
 * At checkout Shopify lists one pickup option per location with Local pickup on, titled with the
 * location's name. Checkout matching keeps the option whose title equals (or contains) the name of
 * the Pickday location the shopper chose, so for each Pickday location Shopify must offer Local
 * pickup under a matching name: otherwise the shopper sees every pickup option, or none.
 * Pure: the Pickup page runs it on unsaved changes; Home and Help on the saved settings.
 */
import { pickupTitleMatches } from "./checkout";
import type { Location } from "./types";

export interface ShopifyPickup {
  /** Numeric Shopify location id. */
  id: string;
  name: string;
  /** Local pickup is on for this location (Settings → Shipping and delivery → Local pickup). */
  pickup: boolean;
}

export type PickupIssue =
  /** No Pickday location (pickup at the store), and no Shopify location offers Local pickup. */
  | { kind: "noShopifyPickup" }
  /** The linked (or same-named) Shopify location has Local pickup off. */
  | { kind: "pickupOff"; locationId: string; name: string; shopifyId: string }
  /** The linked Shopify location offers pickup under another name: use Shopify's name. */
  | { kind: "renamed"; locationId: string; name: string; shopifyId: string; shopifyName: string }
  /** No Shopify location offers pickup under this name. */
  | { kind: "notOffered"; locationId: string; name: string }
  /** Shopify offers pickup here, but there's no Pickday location for it: import it. */
  | { kind: "notInPickday"; shopifyId: string; name: string };

const norm = (s: string) => s.trim().toLowerCase();

export function pickupCheck(locations: Location[], shopify: ShopifyPickup[]): { ok: boolean; issues: PickupIssue[] } {
  const issues: PickupIssue[] = [];
  const mine = locations.filter((l) => l.enabled && l.name.trim());
  const offered = shopify.filter((s) => s.pickup);
  if (!mine.length) {
    if (!offered.length) issues.push({ kind: "noShopifyPickup" });
    return { ok: !issues.length, issues };
  }
  const matched = new Set<string>();
  for (const l of mine) {
    const hit = offered.filter((o) => pickupTitleMatches(o.name, l.name));
    if (hit.length) {
      hit.forEach((o) => matched.add(o.id));
      continue;
    }
    const linked = shopify.find((s) => s.id === l.shopifyLocationId) ?? shopify.find((s) => norm(s.name) === norm(l.name));
    if (linked && !linked.pickup) issues.push({ kind: "pickupOff", locationId: l.id, name: l.name, shopifyId: linked.id });
    else if (linked) {
      matched.add(linked.id);
      issues.push({ kind: "renamed", locationId: l.id, name: l.name, shopifyId: linked.id, shopifyName: linked.name });
    } else issues.push({ kind: "notOffered", locationId: l.id, name: l.name });
  }
  for (const o of offered) if (!matched.has(o.id)) issues.push({ kind: "notInPickday", shopifyId: o.id, name: o.name });
  return { ok: !issues.length, issues };
}
