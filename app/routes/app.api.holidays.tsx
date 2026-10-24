import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { requireShop, shopToday } from "../models/shop.server";
import { holidayRegions, upcomingHolidays } from "../services/holidays.server";

/** GET /app/api/holidays?country=DE&region=BY — the next 400 days, names in the store's language. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const row = await requireShop(session.shop);
  const url = new URL(request.url);
  const country = (url.searchParams.get("country") || row.country || "US").toUpperCase().slice(0, 2);
  const region = url.searchParams.get("region")?.slice(0, 10) || null;
  const lang = (url.searchParams.get("lang") || row.primaryLocale || "en").split("-")[0];
  return {
    country,
    region,
    regions: holidayRegions(country, lang),
    holidays: upcomingHolidays(country, region, lang, shopToday(row), 400),
  };
};
