import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { load, save, type ScheduleData } from "./api";

export default async () => {
  render(<ScheduleAction />, document.body);
};

function ScheduleAction() {
  const { i18n, data, close, toast, extension } = shopify as any;
  const kind: "order" | "draft" = String(extension.target).includes("draft-order") ? "draft" : "order";
  const id: string = data.selected[0]?.id;
  const t = (k: string, v?: Record<string, string | number>) => i18n.translate(k, v);

  const [state, setState] = useState<ScheduleData | null>(null);
  const [method, setMethod] = useState<string | undefined>(undefined);
  const [location, setLocation] = useState<string | null>(null);
  const [date, setDate] = useState<string>("");
  const [slot, setSlot] = useState<string>("");
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    load(kind, id, method, location).then(
      (s) => {
        setState(s);
        if (method === undefined) {
          setMethod(s.method);
          setLocation(s.locationId);
          if (s.order?.date) setDate(s.order.date);
        }
      },
      () => setMessage(t("error")),
    );
  }, [id, method, location]);

  if (!state) return <s-admin-action heading={t("actionTitle")}><s-text>{message ?? t("loading")}</s-text></s-admin-action>;

  const fmt = (d: string) => i18n.formatDate(new Date(`${d}T12:00:00Z`), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const day = state.days.find((d) => d.date === date);
  const reason = (r: string | null) => (r === "full" ? t("full") : t("unavailable"));

  async function submit() {
    if (!date || !method) return;
    setBusy(true);
    setMessage(null);
    const r = await save(kind, id, { method, date, slotId: slot || null, locationId: location, force });
    setBusy(false);
    if (r.ok) {
      toast?.show(t("saved"));
      close();
    } else setMessage(t("rejected", { reason: r.reason ?? "" }));
  }

  return (
    <s-admin-action heading={t("actionTitle")}>
      <s-stack direction="block" gap="base">
        {message ? <s-banner tone="critical">{message}</s-banner> : null}
        <s-select label={t("method")} value={method} onChange={(e: any) => { setMethod(e.currentTarget.value); setDate(""); setSlot(""); }}>
          {state.methods.map((m) => <s-option value={m.id}>{m.name}</s-option>)}
        </s-select>
        {method === "pickup" && state.locations.length ? (
          <s-select label={t("location")} value={location ?? ""} onChange={(e: any) => { setLocation(e.currentTarget.value || null); setDate(""); setSlot(""); }}>
            {state.locations.map((l) => <s-option value={l.id}>{l.name}</s-option>)}
          </s-select>
        ) : null}
        <s-select label={t("date")} value={date} onChange={(e: any) => { setDate(e.currentTarget.value); setSlot(""); }}>
          <s-option value="">{t("chooseDate")}</s-option>
          {state.days
            .filter((d) => d.available || force)
            .map((d) => (
              <s-option value={d.date}>
                {fmt(d.date)}
                {d.available ? (d.left !== null ? ` · ${t("left", { count: d.left })}` : "") : ` · ${reason(d.reason)}`}
              </s-option>
            ))}
        </s-select>
        {day?.slots.length ? (
          <s-select label={t("slot")} value={slot} onChange={(e: any) => setSlot(e.currentTarget.value)}>
            <s-option value="">{t("chooseSlot")}</s-option>
            {day.slots
              .filter((s) => s.available || force)
              .map((s) => <s-option value={s.id}>{s.label}{s.available ? "" : ` · ${t("full")}`}</s-option>)}
          </s-select>
        ) : null}
        <s-checkbox label={t("override")} checked={force} onChange={(e: any) => setForce(e.currentTarget.checked)} />
        <s-text color="subdued">{t("timezone", { zone: state.timeZone })}</s-text>
      </s-stack>
      <s-button slot="primary-action" variant="primary" disabled={!date || (!!day?.slots.length && !slot) || busy} loading={busy} onClick={submit}>{t("save")}</s-button>
      <s-button slot="secondary-actions" onClick={() => close()}>{t("cancel")}</s-button>
    </s-admin-action>
  );
}
