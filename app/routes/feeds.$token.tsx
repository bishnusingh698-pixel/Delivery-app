import type { LoaderFunctionArgs } from "react-router";
import { feedFor } from "../services/feed.server";

/** GET /feeds/<secret>.ics — subscribed to by calendar apps. Cached for 15 minutes. */
export const loader = async ({ params }: LoaderFunctionArgs) => {
  const token = String(params.token ?? "").replace(/\.ics$/, "");
  if (token.length < 20) return new Response("Not found", { status: 404 });
  const body = await feedFor(token);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "public, max-age=900", "X-Content-Type-Options": "nosniff" },
  });
};
