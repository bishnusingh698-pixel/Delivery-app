import type { LoaderFunctionArgs } from "react-router";
import { isValidDate, isValidTime } from "../../core/civil";
import { icsCalendar, icsEvent } from "../../core/calendar";
import { isValidTimeZone } from "../../core/tz";

/**
 * Stateless .ics download for the thank-you page (D-04). Builds the file from
 * the query string; never touches the database. Inputs are validated and
 * length-limited, and the response is a calendar file, never HTML.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const q = new URL(request.url).searchParams;
  const date = q.get("d") ?? "";
  if (!isValidDate(date)) return new Response("Bad date", { status: 400 });
  const start = q.get("s");
  const end = q.get("e");
  const timed = !!start && !!end && isValidTime(start) && isValidTime(end);
  const tz = q.get("z");
  const event = icsEvent({
    uid: `${date}-${Math.random().toString(36).slice(2)}@pickday`,
    stamp: new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""),
    title: (q.get("t") ?? "Delivery").slice(0, 120),
    date,
    start: timed ? start : null,
    end: timed ? end : null,
    timeZone: tz && isValidTimeZone(tz) ? tz : null,
    location: (q.get("l") ?? "").slice(0, 200) || undefined,
  });
  return new Response(icsCalendar("Delivery", [event]), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="delivery-${date}.ics"`,
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
};
