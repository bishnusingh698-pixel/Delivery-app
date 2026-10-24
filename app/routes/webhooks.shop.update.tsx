import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { isValidTimeZone } from "../../core/tz";
import { schedulePublish } from "../services/publish.server";

/**
 * shop/update: keep the store's time zone, currency and name in step, so cutoffs and
 * "today" follow a time zone change right away (not only when the merchant reopens the app).
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const p = payload as { iana_timezone?: string; currency?: string; name?: string; email?: string; country_code?: string };
  const row = await db.shop.findUnique({ where: { shop }, select: { active: true, timeZone: true, currency: true } });
  if (!row?.active) return new Response();
  const data: { timeZone?: string; currency?: string; name?: string; email?: string; country?: string } = {};
  if (p.iana_timezone && isValidTimeZone(p.iana_timezone)) data.timeZone = p.iana_timezone;
  if (p.currency && /^[A-Z]{3}$/.test(p.currency)) data.currency = p.currency;
  if (typeof p.name === "string") data.name = p.name.slice(0, 200);
  if (typeof p.email === "string") data.email = p.email.slice(0, 200);
  if (p.country_code && /^[A-Z]{2}$/.test(p.country_code)) data.country = p.country_code;
  await db.shop.update({ where: { shop }, data });
  if ((data.timeZone && data.timeZone !== row.timeZone) || (data.currency && data.currency !== row.currency)) schedulePublish(shop, 500);
  return new Response();
};
