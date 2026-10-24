import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getShop } from "../models/shop.server";
import { scheduleEmbedCheck } from "../services/embed.server";

/**
 * themes/publish and themes/update: the live theme changed (another theme published, or theme
 * settings saved, which is where the app embed switch lives). Re-check the app embed right away,
 * so checkout stops asking for a date as soon as the picker is gone, and asks again when it's back
 * (D-42), instead of waiting for the daily job.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const row = await getShop(shop);
  if (!row?.active) return new Response();
  // Edits to unpublished themes don't change what shoppers see.
  const role = (payload as { role?: string } | null)?.role;
  if (topic === "THEMES_UPDATE" && role && role !== "main") return new Response();
  scheduleEmbedCheck(shop);
  return new Response();
};
