/**
 * Pickup locations: read the store's Shopify locations so the merchant can
 * import them as Pickday pickup locations.
 */
import { gql, numericId, type AdminGraphql } from "./graphql.server";

export interface ShopifyLocation {
  /** Numeric Shopify location id (stored as Location.shopifyLocationId). */
  id: string;
  name: string;
  address: string;
  countryCode: string | null;
  instructions: string;
}

const LOCATIONS_QUERY = `#graphql
  query PickdayLocations {
    locations(first: 50, includeInactive: false) {
      nodes {
        id
        name
        address { address1 address2 city zip countryCode formatted }
        localPickupSettingsV2 { instructions }
      }
    }
  }`;

interface RawLocation {
  id: string;
  name: string;
  address: {
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    zip?: string | null;
    countryCode?: string | null;
    formatted?: string[] | null;
  } | null;
  localPickupSettingsV2: { instructions?: string | null } | null;
}

/** Turn one Admin API location node into a plain, importable record. */
export function toShopifyLocation(n: RawLocation): ShopifyLocation {
  const a = n.address ?? {};
  const formatted = (a.formatted ?? []).map((s) => s.trim()).filter(Boolean);
  const address = formatted.length
    ? formatted.join(", ")
    : [a.address1, a.address2, [a.zip, a.city].filter(Boolean).join(" "), a.countryCode].map((s) => (s ?? "").trim()).filter(Boolean).join(", ");
  return {
    id: numericId(n.id),
    name: n.name.trim(),
    address: address.slice(0, 300),
    countryCode: a.countryCode ?? null,
    instructions: (n.localPickupSettingsV2?.instructions ?? "").trim(),
  };
}

export async function fetchShopifyLocations(admin: AdminGraphql): Promise<ShopifyLocation[]> {
  const data = await gql<{ locations: { nodes: RawLocation[] } }>(admin, LOCATIONS_QUERY);
  return (data.locations?.nodes ?? []).map(toShopifyLocation);
}
