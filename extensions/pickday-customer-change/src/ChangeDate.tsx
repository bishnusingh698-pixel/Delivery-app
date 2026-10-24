/**
 * The modal: pick a new date (and time slot) for this order. Only dates the cart would offer
 * today are listed; the server checks again (limits, rules, deadline) when saving.
 */
import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { call, translator, type Status } from "./shared";

export default async () => {
  render(<ChangeDate />, document.body);
};

function ChangeDate() {
  const api = (globalThis as any).shopify;
  const { t, day } = translator();
  const [status, setStatus] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    call<Status>(api.orderId, { days: true })
      .then((s) => {
        setStatus(s);
        const first = s.days?.find((d) => d.date !== s.current?.date) ?? s.days?.[0];
        if (first) {
          setDate(first.date);
          setSlot(first.slots[0]?.id ?? "");
        }
      })
      .catch(() => setFailed(true));
  }, [api.orderId]);

  const heading = t("change.heading");
  if (failed || (status && !status.canChange)) {
    return (
      <s-customer-account-action heading={heading}>
        <s-banner tone="critical">{t("change.error")}</s-banner>
        <s-button slot="primary-action" onClick={() => api.close()}>{t("change.close")}</s-button>
      </s-customer-account-action>
    );
  }
  if (!status) {
    return (
      <s-customer-account-action heading={heading}>
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-spinner accessibilityLabel={t("change.loading")} />
          <s-text>{t("change.loading")}</s-text>
        </s-stack>
      </s-customer-account-action>
    );
  }

  const days = status.days ?? [];
  const chosen = days.find((d) => d.date === date);
  const current = status.current?.date ? `${day(status.current.date)}${status.current.slot ? `, ${status.current.slot}` : ""}` : "";
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const r = await call<{ ok: boolean; reason?: string }>(api.orderId, { body: { date, slotId: slot || null } });
      if (r.ok) {
        api.toast?.show?.(t("change.saved"));
        api.close();
        return;
      }
      setError(r.reason === "full" || r.reason === "slotUnavailable" ? t("change.taken") : t("change.error"));
    } catch {
      setError(t("change.error"));
    }
    setSaving(false);
  };

  return (
    <s-customer-account-action heading={heading}>
      <s-stack gap="base">
        {current ? <s-text>{t("change.current", { date: current })}</s-text> : null}
        {error ? <s-banner tone="critical">{error}</s-banner> : null}
        {days.length ? (
          <>
            <s-select
              label={t("change.date")}
              value={date}
              onChange={(e: any) => {
                const v = e.currentTarget.value as string;
                setDate(v);
                setSlot(days.find((d) => d.date === v)?.slots[0]?.id ?? "");
              }}
            >
              {days.map((d) => (
                <s-option key={d.date} value={d.date}>
                  {day(d.date)}
                </s-option>
              ))}
            </s-select>
            {chosen?.slots.length ? (
              <s-select label={t("change.slot")} value={slot} onChange={(e: any) => setSlot(e.currentTarget.value as string)}>
                {chosen.slots.map((s) => (
                  <s-option key={s.id} value={s.id}>
                    {s.label}
                  </s-option>
                ))}
              </s-select>
            ) : null}
          </>
        ) : (
          <s-banner tone="warning">{t("change.none")}</s-banner>
        )}
      </s-stack>
      <s-button slot="primary-action" variant="primary" loading={saving} disabled={!days.length || !date} onClick={save}>
        {t("change.save")}
      </s-button>
      <s-button slot="secondary-actions" onClick={() => api.close()}>
        {t("change.close")}
      </s-button>
    </s-customer-account-action>
  );
}
