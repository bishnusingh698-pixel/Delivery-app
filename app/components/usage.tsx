/**
 * "23 of 50 scheduled orders this month" with a bar, the reset day and an upgrade link when it's
 * near or over the limit; on unlimited plans "312 orders this month, unlimited" (D-76). Home and Plans.
 */
import { usageTone } from "../../core/usage";
import type { PlanId } from "../../core/types";
import { useI18n, useT } from "../i18n/react";
import { Button, Stack } from "./polaris";
import { useFormatDate } from "./shared";

export interface UsageView {
  count: number;
  limit: number | null;
  resetsOn: string;
}

export function UsageBar(p: { usage: UsageView; plan: PlanId; trialEndsOn?: string | null; showPlan?: boolean }) {
  const t = useT();
  const { locale } = useI18n();
  const fmt = useFormatDate();
  const num = new Intl.NumberFormat(locale);
  const u = p.usage;
  const tone = usageTone(u);
  const pct = u.limit ? Math.min(100, Math.round((u.count / u.limit) * 100)) : 0;
  const color = tone === "over" ? "#c70a24" : tone === "near" ? "#b28400" : "#2c6ecb";
  return (
    <Stack gap="small-200">
      {p.showPlan ? (
        <Stack direction="inline" gap="small-200" alignItems="center" wrap>
          <s-text type="strong">{t("usage.plan", { plan: t(`plans.${p.plan}.name`) })}</s-text>
          {p.trialEndsOn ? <s-badge tone="info">{t("usage.trialEnds", { date: fmt(p.trialEndsOn, true) })}</s-badge> : null}
        </Stack>
      ) : null}
      {u.limit === null ? (
        <s-text>{t("usage.unlimited", { count: u.count })}</s-text>
      ) : (
        <>
          <s-text>{t("usage.limited", { count: u.count, limit: num.format(u.limit) })}</s-text>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={u.limit}
            aria-valuenow={Math.min(u.count, u.limit)}
            aria-label={t("usage.limited", { count: u.count, limit: num.format(u.limit) })}
            style={{ height: 8, borderRadius: 4, background: "#e3e3e3", overflow: "hidden" }}
          >
            <div style={{ width: `${pct}%`, height: "100%", background: color }} />
          </div>
          <s-text color="subdued">
            {tone === "over" ? t("usage.over") : tone === "near" ? t("usage.near") : ""} {t("usage.resets", { date: fmt(u.resetsOn, true) })}
          </s-text>
          {tone !== "ok" ? (
            <s-box>
              <Button variant="primary" href="/app/plans" icon="arrow-up">{t("usage.upgrade")}</Button>
            </s-box>
          ) : null}
        </>
      )}
    </Stack>
  );
}
