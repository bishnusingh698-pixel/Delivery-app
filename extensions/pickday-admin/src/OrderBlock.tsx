import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { load, type ScheduleData } from "./api";

export default async () => {
  render(<OrderBlock />, document.body);
};

function OrderBlock() {
  const { i18n, data, navigation } = shopify;
  const id = data.selected[0]?.id;
  const [state, setState] = useState<ScheduleData | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    load("order", id).then(setState, () => setError(true));
  }, [id]);

  const t = (k: string, v?: Record<string, string | number>) => i18n.translate(k, v);
  if (error) return <s-admin-block heading={t("blockHeading")}><s-text>{t("error")}</s-text></s-admin-block>;
  if (!state) return <s-admin-block heading={t("blockHeading")}><s-text>{t("loading")}</s-text></s-admin-block>;

  const o = state.order;
  const method = state.methods.find((m) => m.id === o?.method)?.name ?? o?.method;
  const loc = state.locations.find((l) => l.id === o?.locationId)?.name;
  const date = o?.date ? i18n.formatDate(new Date(`${o.date}T12:00:00Z`), { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null;
  const status = o?.status === "cancelled" ? t("statusCancelled") : o?.status === "fulfilled" ? t("statusFulfilled") : t("statusScheduled");
  const history = o?.history ?? [];
  const last = history[history.length - 1];

  return (
    <s-admin-block heading={t("blockHeading")}>
      <s-stack direction="block" gap="base">
        {!state.needsDate ? (
          <s-text>{t("notNeeded")}</s-text>
        ) : !o?.date ? (
          <s-text>{t("none")}</s-text>
        ) : (
          <s-stack direction="block" gap="small-200">
            <s-text type="strong">{date}{o.slot ? `, ${o.slot.replace("-", "–")}` : ""}</s-text>
            <s-text>{t("method")}: {method}{loc ? ` · ${loc}` : ""}</s-text>
            <s-text color="subdued">{t("status")}: {status}</s-text>
            {o.limited ? <s-banner tone="warning">{t("limited")}</s-banner> : null}
            {last ? <s-text color="subdued">{t("changed", { count: history.length, from: last.from?.date ?? "—", to: last.to.date })}</s-text> : null}
          </s-stack>
        )}
        {state.needsDate ? (
          <s-button onClick={() => navigation?.navigate("extension:pickday-admin")}>{o?.date ? t("change") : t("set")}</s-button>
        ) : null}
      </s-stack>
    </s-admin-block>
  );
}
