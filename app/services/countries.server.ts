/**
 * Countries the store sells to, plus its Markets (for quick selection).
 */
import { gql, type AdminGraphql } from "./graphql.server";

export async function shopCountries(admin: AdminGraphql): Promise<{ countries: string[]; markets: { name: string; countries: string[] }[] }> {
  let countries: string[] = [];
  try {
    const d = await gql<{ shop: { shipsToCountries: string[] } }>(admin, `#graphql
      query PickdayCountries { shop { shipsToCountries } }`);
    countries = d.shop.shipsToCountries.filter((c) => /^[A-Z]{2}$/.test(c));
  } catch (e) {
    console.error("[countries]", e);
  }
  let markets: { name: string; countries: string[] }[] = [];
  try {
    const d = await gql<any>(admin, `#graphql
      query PickdayMarkets {
        markets(first: 50) {
          nodes {
            name
            status
            conditions { regionsCondition { regions(first: 250) { nodes { ... on MarketRegionCountry { code } } } } }
          }
        }
      }`);
    markets = (d.markets?.nodes ?? [])
      .filter((m: any) => m.status !== "DRAFT")
      .map((m: any) => ({
        name: m.name as string,
        countries: (m.conditions?.regionsCondition?.regions?.nodes ?? []).map((r: any) => r.code).filter(Boolean),
      }))
      .filter((m: any) => m.countries.length);
  } catch {
    // Markets API shape differs on some API versions or the scope is missing: skip the shortcut.
  }
  const all = new Set([...countries, ...markets.flatMap((m) => m.countries)]);
  if (!all.size) ["US", "CA", "GB", "DE", "FR", "AU"].forEach((c) => all.add(c));
  return { countries: [...all], markets };
}
