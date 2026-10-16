/**
 * Thank-you page + order status page block: shows the chosen date/slot and
 * "add to calendar" links, in the shopper's language. Never calls the Pickday
 * server except for the optional .ics download (see DECISIONS D-04).
 */
import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { format } from "../../../core/i18n/format";
import { matchLocale } from "../../../core/i18n/locales";
import { ATTR_KEY, READABLE_KEYS, decodeSelection } from "../../../core/selection";
import { calendarLinks } from "../../../core/calendar";
import messages from "./messages.generated.json";

export default async () => {
  render(<Schedule />, document.body);
};

type Api = any;

function Schedule() {
  const api: Api = (globalThis as any).shopify;
  const attrs: { key: string; value: string }[] = api.attributes?.value ?? [];
  const sel = decodeSelection(attrs.find((a) => a.key === ATTR_KEY)?.value);
  if (!sel?.d) return null;

  const lang = api.localization?.language?.value?.isoCode ?? "en";
  const loc = matchLocale(lang);
  const table = (messages as Record<string, Record<string, string>>)[loc] ?? (messages as any).en;
  const t = (key: string, values: Record<string, string> = {}) => format(table[key] ?? (messages as any).en[key] ?? key, values, { plural: () => "other" });

  const cfgRaw = (api.appMetafields?.value ?? []).find((m: any) => m.metafield?.key === "checkout")?.metafield?.value;
  let cfg: { u?: string; dispatch?: boolean; tz?: string; ins?: Record<string, Record<string, string>> } = {};
  try {
    cfg = cfgRaw ? JSON.parse(cfgRaw) : {};
  } catch {
    cfg = {};
  }

  let date = sel.lbl ?? sel.d;
  try {
    const [y, m, d] = sel.d.split("-").map(Number);
    date = api.i18n.formatDate(new Date(Date.UTC(y, m - 1, d, 12)), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
    if (sel.t) date += `, ${sel.t.replace("-", "–")}`;
  } catch {
    /* keep the label saved at checkout */
  }
  const location = attrs.find((a) => a.key === READABLE_KEYS.location)?.value ?? "";
  const kind = sel.m === "pickup" ? "pickup" : sel.m === "delivery" ? "delivery" : cfg.dispatch ? "dispatch" : "shipping";
  const sentence = kind === "pickup" && location ? t("thankyou.pickupAt", { location, date }) : t(`thankyou.${kind}`, { date });

  const insMap = sel.m === "pickup" && sel.l ? cfg.ins?.[sel.l] : undefined;
  const instructions = insMap ? insMap[lang] || insMap[loc] || insMap[lang.split("-")[0]] || Object.values(insMap).find(Boolean) || "" : "";
  const orderName: string = api.orderConfirmation?.value?.number ?? api.order?.value?.name ?? "";
  const titleKey = { delivery: "calendar.eventDelivery", pickup: "calendar.eventPickup", shipping: "calendar.eventShipping", dispatch: "calendar.eventDispatch" }[kind];
  const links = calendarLinks({
    title: t(titleKey, { order: String(orderName) }).trim(),
    date: sel.d,
    start: sel.t?.slice(0, 5) ?? null,
    end: sel.t?.slice(6, 11) ?? null,
    timeZone: cfg.tz ?? null,
    location,
    icsBase: cfg.u ? `${cfg.u}/ics/event` : null,
  });

  return (
    <s-section heading={t("thankyou.heading")}>
      <s-stack gap="base">
        <s-text>{sentence}</s-text>
        {instructions ? <s-text color="subdued">{instructions}</s-text> : null}
        <s-stack direction="inline" gap="base">
          <s-text color="subdued">{t("thankyou.addToCalendar")}:</s-text>
          <s-link href={links.google} target="_blank">
            {t("thankyou.google")}
          </s-link>
          {links.ics ? (
            <s-link href={links.ics} target="_blank">
              {t("thankyou.ics")}
            </s-link>
          ) : null}
        </s-stack>
      </s-stack>
    </s-section>
  );
}
