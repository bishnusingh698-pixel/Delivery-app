/**
 * Schedule and capacity editors, reused by Schedule, Time slots & capacity,
 * Pickup locations (custom schedule) and Delivery areas (zones).
 */
import { useState } from "react";
import { fromMinutes, toMinutes } from "../../core/civil";
import type { Capacity, Schedule, Slot } from "../../core/types";
import { useI18n, useT } from "../i18n/react";
import { Button, Checkbox, DateField, Modal, NumberField, Select, Switch, TimeSelect, closeModal, openModal } from "./polaris";
import { fieldId } from "./settings-form";
import { WeekdayPicker, newId, useFormatDate, useWeekdays } from "./shared";

type ErrorFor = (path: string) => string | undefined;

export function ScheduleEditor(p: { value: Schedule; onChange: (s: Schedule) => void; path: string; errorFor: ErrorFor }) {
  const t = useT();
  const { locale } = useI18n();
  const days = useWeekdays();
  const s = p.value;
  const set = (fn: (s: Schedule) => void) => {
    const next: Schedule = JSON.parse(JSON.stringify(s));
    fn(next);
    p.onChange(next);
  };
  const perWeekday = !!s.cutoff.perWeekday;
  return (
    <s-stack gap="large">
      <WeekdayPicker
        id={fieldId(`${p.path}.weekdays`)}
        label={t("schedule.weekdays")}
        value={s.weekdays}
        error={p.errorFor(`${p.path}.weekdays`)}
        onChange={(v) => set((x) => (x.weekdays = v))}
      />

      <s-stack gap="small-300">
        <s-text type="strong">{t("schedule.lead")}</s-text>
        <s-text color="subdued">{t("schedule.leadHelp")}</s-text>
        <s-stack direction="inline" gap="base" alignItems="end">
          <NumberField
            id={fieldId(`${p.path}.lead.amount`)}
            label={t("schedule.leadAmount")}
            min={0}
            max={s.lead.unit === "hours" ? 720 : 365}
            value={s.lead.amount}
            error={p.errorFor(`${p.path}.lead.amount`)}
            onChange={(v) => set((x) => (x.lead.amount = v ?? 0))}
          />
          <Select
            label={t("schedule.leadUnit")}
            value={s.lead.unit}
            options={[
              { value: "days", label: t("schedule.days") },
              { value: "hours", label: t("schedule.hours") },
            ]}
            onChange={(v) => set((x) => (x.lead.unit = v as "days" | "hours"))}
          />
        </s-stack>
        {s.lead.unit === "days" ? (
          <Checkbox
            label={t("schedule.workingDays")}
            details={t("schedule.workingDaysHelp")}
            checked={s.lead.workingDays}
            onChange={(v) => set((x) => (x.lead.workingDays = v))}
          />
        ) : null}
      </s-stack>

      <s-stack gap="small-300">
        <s-text type="strong">{t("schedule.cutoff")}</s-text>
        <s-text color="subdued">{t("schedule.cutoffHelp")}</s-text>
        <Switch
          label={t("schedule.cutoffPerWeekday")}
          checked={perWeekday}
          onChange={(on) =>
            set((x) => {
              x.cutoff.perWeekday = on ? Array.from({ length: 7 }, () => x.cutoff.time) : null;
            })
          }
        />
        {perWeekday ? (
          <s-table>
            <s-table-header-row>
              <s-table-header>{t("schedule.weekday")}</s-table-header>
              <s-table-header>{t("schedule.cutoffTime")}</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {days.map((d) => (
                <s-table-row key={d.value}>
                  <s-table-cell>{d.long}</s-table-cell>
                  <s-table-cell>
                    <TimeSelect
                      label={t("schedule.cutoffFor", { day: d.long })}
                      labelAccessibilityVisibility="exclusive"
                      allowEmpty={t("schedule.noCutoff")}
                      locale={locale}
                      value={s.cutoff.perWeekday?.[d.value] ?? null}
                      onChange={(v) => set((x) => (x.cutoff.perWeekday![d.value] = v))}
                    />
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        ) : (
          <TimeSelect
            label={t("schedule.cutoffTime")}
            allowEmpty={t("schedule.noCutoff")}
            locale={locale}
            value={s.cutoff.time}
            onChange={(v) => set((x) => (x.cutoff.time = v))}
          />
        )}
      </s-stack>

      <s-stack gap="small-300">
        <Switch
          label={t("schedule.sameDay")}
          details={t("schedule.sameDayHelp")}
          checked={s.sameDay.allowed}
          onChange={(v) => set((x) => (x.sameDay.allowed = v))}
        />
        {s.sameDay.allowed ? (
          <TimeSelect label={t("schedule.sameDayCutoff")} locale={locale} value={s.sameDay.cutoff} onChange={(v) => set((x) => (x.sameDay.cutoff = v ?? "12:00"))} />
        ) : null}
      </s-stack>

      <s-stack direction="inline" gap="base">
        <NumberField
          id={fieldId(`${p.path}.windowDays`)}
          label={t("schedule.window")}
          details={t("schedule.windowHelp")}
          suffix={t("schedule.days")}
          min={1}
          max={400}
          value={s.windowDays}
          error={p.errorFor(`${p.path}.windowDays`)}
          onChange={(v) => set((x) => (x.windowDays = v ?? 1))}
        />
        <DateField
          label={t("schedule.notBefore")}
          details={t("schedule.notBeforeHelp")}
          value={s.notBefore}
          onChange={(v) => set((x) => (x.notBefore = v))}
        />
      </s-stack>
      <Checkbox
        label={t("schedule.todayTomorrow")}
        details={t("schedule.todayTomorrowHelp")}
        checked={s.todayTomorrowLabels}
        onChange={(v) => set((x) => (x.todayTomorrowLabels = v))}
      />
    </s-stack>
  );
}

/* ------------------------------------------------------------ capacity */

export function CapacityEditor(p: {
  value: Capacity;
  onChange: (c: Capacity) => void;
  path: string;
  errorFor: ErrorFor;
  slotsEnabled: boolean;
  capacityAllowed: boolean;
  modalPrefix: string;
}) {
  const t = useT();
  const { locale } = useI18n();
  const days = useWeekdays();
  const fmtDate = useFormatDate();
  const c = p.value;
  const set = (fn: (c: Capacity) => void) => {
    const next: Capacity = JSON.parse(JSON.stringify(c));
    fn(next);
    p.onChange(next);
  };
  const timeFmt = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  const ft = (hm: string) => timeFmt.format(new Date(Date.UTC(2000, 0, 1, Number(hm.slice(0, 2)), Number(hm.slice(3)))));
  const dayNames = (wds: number[]) =>
    !wds.length || wds.length === 7 ? t("capacity.everyDay") : days.filter((d) => wds.includes(d.value)).map((d) => d.short).join(", ");

  const [editing, setEditing] = useState<Slot | null>(null);
  const [gen, setGen] = useState({ start: "09:00", end: "17:00", length: 60, gap: 0, weekdays: [] as number[], max: null as number | null });
  const [ovr, setOvr] = useState<{ date: string | null; max: number | null }>({ date: null, max: null });
  const slotModal = `${p.modalPrefix}-slot`;
  const genModal = `${p.modalPrefix}-gen`;
  const ovrModal = `${p.modalPrefix}-ovr`;
  const perWeekdayMax = !!c.maxPerWeekday;

  const slotError = editing && editing.end <= editing.start ? t("capacity.endAfterStart") : undefined;

  return (
    <s-stack gap="large">
      {!p.capacityAllowed ? <s-banner tone="info">{t("common.availableOn", { plan: "Starter" })}</s-banner> : null}
      <Select
        label={t("capacity.unit")}
        details={t("capacity.unitHelp")}
        value={c.unit}
        disabled={!p.capacityAllowed}
        options={[
          { value: "orders", label: t("capacity.countOrders") },
          { value: "items", label: t("capacity.countItems") },
        ]}
        onChange={(v) => set((x) => (x.unit = v as "orders" | "items"))}
      />
      <s-stack gap="small-300">
        <NumberField
          id={fieldId(`${p.path}.maxPerDay`)}
          label={t("capacity.maxPerDay")}
          details={t("capacity.blankUnlimited")}
          min={0}
          disabled={!p.capacityAllowed}
          value={c.maxPerDay}
          onChange={(v) => set((x) => (x.maxPerDay = v))}
        />
        <Switch
          label={t("capacity.perWeekdayMax")}
          checked={perWeekdayMax}
          disabled={!p.capacityAllowed}
          onChange={(on) => set((x) => (x.maxPerWeekday = on ? Array.from({ length: 7 }, () => null) : null))}
        />
        {perWeekdayMax ? (
          <s-grid gridTemplateColumns="repeat(auto-fill, minmax(120px, 1fr))" gap="base">
            {days.map((d) => (
              <NumberField
                key={d.value}
                label={d.long}
                min={0}
                placeholder={c.maxPerDay === null ? "∞" : String(c.maxPerDay)}
                value={c.maxPerWeekday?.[d.value] ?? null}
                onChange={(v) => set((x) => (x.maxPerWeekday![d.value] = v))}
              />
            ))}
          </s-grid>
        ) : null}
      </s-stack>

      {p.slotsEnabled ? (
        <s-stack gap="base" id={fieldId(`${p.path}.slots`)}>
          <s-stack direction="inline" justifyContent="space-between" alignItems="center">
            <s-heading>{t("capacity.slots")}</s-heading>
            <s-stack direction="inline" gap="small-200">
              <Button onClick={() => openModal(genModal)}>{t("capacity.generate")}</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setEditing({ id: newId("s"), start: "10:00", end: "12:00", weekdays: [], max: null });
                  openModal(slotModal);
                }}
              >
                {t("capacity.addSlot")}
              </Button>
            </s-stack>
          </s-stack>
          {p.errorFor(`${p.path}.slots`) ? <s-text tone="critical">{p.errorFor(`${p.path}.slots`)}</s-text> : null}
          {c.slots.length ? (
            <s-table>
              <s-table-header-row>
                <s-table-header>{t("capacity.start")}</s-table-header>
                <s-table-header>{t("capacity.end")}</s-table-header>
                <s-table-header>{t("capacity.weekdays")}</s-table-header>
                <s-table-header format="numeric">{t("capacity.max")}</s-table-header>
                <s-table-header>{t("common.actions")}</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {[...c.slots]
                  .sort((a, b) => (a.start < b.start ? -1 : 1))
                  .map((s) => (
                    <s-table-row key={s.id}>
                      <s-table-cell>{ft(s.start)}</s-table-cell>
                      <s-table-cell>{ft(s.end)}</s-table-cell>
                      <s-table-cell>{dayNames(s.weekdays)}</s-table-cell>
                      <s-table-cell>{s.max ?? "∞"}</s-table-cell>
                      <s-table-cell>
                        <s-stack direction="inline" gap="small-200">
                          <Button
                            variant="tertiary"
                            icon="edit"
                            accessibilityLabel={t("common.edit")}
                            onClick={() => {
                              setEditing({ ...s });
                              openModal(slotModal);
                            }}
                          >
                            {""}
                          </Button>
                          <Button
                            variant="tertiary"
                            tone="critical"
                            icon="delete"
                            accessibilityLabel={t("common.delete")}
                            onClick={() => set((x) => (x.slots = x.slots.filter((y) => y.id !== s.id)))}
                          >
                            {""}
                          </Button>
                        </s-stack>
                      </s-table-cell>
                    </s-table-row>
                  ))}
              </s-table-body>
            </s-table>
          ) : (
            <s-text color="subdued">{t("capacity.noSlots")}</s-text>
          )}
          <s-stack direction="inline" gap="base">
            <NumberField
              label={t("capacity.hideBefore")}
              suffix={t("capacity.minutes")}
              min={0}
              value={c.hideSlotMinutesBefore}
              onChange={(v) => set((x) => (x.hideSlotMinutesBefore = v ?? 0))}
            />
          </s-stack>
        </s-stack>
      ) : (
        <s-text color="subdued">{t("capacity.slotsOff")}</s-text>
      )}

      <s-stack gap="small-300">
        <Checkbox
          label={t("capacity.showLeft")}
          checked={c.showSpotsLeftBelow !== null}
          onChange={(on) => set((x) => (x.showSpotsLeftBelow = on ? 3 : null))}
        />
        {c.showSpotsLeftBelow !== null ? (
          <NumberField label={t("capacity.showLeftBelow")} min={1} max={100} value={c.showSpotsLeftBelow} onChange={(v) => set((x) => (x.showSpotsLeftBelow = v ?? 3))} />
        ) : null}
      </s-stack>

      <s-stack gap="small-300">
        <s-stack direction="inline" justifyContent="space-between" alignItems="center">
          <s-heading>{t("capacity.overrides")}</s-heading>
          <Button disabled={!p.capacityAllowed} onClick={() => openModal(ovrModal)}>
            {t("capacity.addOverride")}
          </Button>
        </s-stack>
        <s-text color="subdued">{t("capacity.overridesHelp")}</s-text>
        {c.overrides.map((o) => (
          <s-stack key={o.date} direction="inline" gap="base" alignItems="center">
            <s-text>{fmtDate(o.date, true)}</s-text>
            <s-badge>{o.maxPerDay === null ? t("capacity.unlimited") : t("capacity.maxN", { count: o.maxPerDay })}</s-badge>
            <Button variant="tertiary" tone="critical" onClick={() => set((x) => (x.overrides = x.overrides.filter((y) => y.date !== o.date)))}>
              {t("common.remove")}
            </Button>
          </s-stack>
        ))}
      </s-stack>
      <s-text color="subdued">{t("capacity.helpFooter")}</s-text>

      <Modal
        id={slotModal}
        heading={t("capacity.slotModal")}
        primary={
          <Button
            slot="primary-action"
            variant="primary"
            disabled={!!slotError}
            onClick={() => {
              if (!editing) return;
              set((x) => {
                const i = x.slots.findIndex((s) => s.id === editing.id);
                if (i >= 0) x.slots[i] = editing;
                else x.slots.push(editing);
              });
              closeModal(slotModal);
            }}
          >
            {t("common.done")}
          </Button>
        }
        secondary={
          <Button slot="secondary-actions" onClick={() => closeModal(slotModal)}>
            {t("common.cancel")}
          </Button>
        }
      >
        {editing ? (
          <s-stack gap="base">
            <s-stack direction="inline" gap="base">
              <TimeSelect label={t("capacity.start")} locale={locale} value={editing.start} onChange={(v) => setEditing({ ...editing, start: v ?? "00:00" })} />
              <TimeSelect label={t("capacity.end")} locale={locale} value={editing.end} error={slotError} onChange={(v) => setEditing({ ...editing, end: v ?? "00:00" })} />
            </s-stack>
            <WeekdayPicker label={t("capacity.weekdaysAllIfNone")} value={editing.weekdays} onChange={(v) => setEditing({ ...editing, weekdays: v })} />
            <NumberField label={t("capacity.max")} details={t("capacity.blankUnlimited")} min={0} disabled={!p.capacityAllowed} value={editing.max} onChange={(v) => setEditing({ ...editing, max: v })} />
          </s-stack>
        ) : null}
      </Modal>

      <Modal
        id={genModal}
        heading={t("capacity.generate")}
        primary={
          <Button
            slot="primary-action"
            variant="primary"
            onClick={() => {
              const slots: Slot[] = [];
              for (let m = toMinutes(gen.start); m + gen.length <= toMinutes(gen.end); m += gen.length + gen.gap) {
                slots.push({ id: newId("s"), start: fromMinutes(m), end: fromMinutes(m + gen.length), weekdays: gen.weekdays, max: p.capacityAllowed ? gen.max : null });
                if (slots.length > 95) break;
              }
              set((x) => (x.slots = slots));
              closeModal(genModal);
            }}
          >
            {t("capacity.replaceSlots")}
          </Button>
        }
        secondary={
          <Button slot="secondary-actions" onClick={() => closeModal(genModal)}>
            {t("common.cancel")}
          </Button>
        }
      >
        <s-stack gap="base">
          <s-text color="subdued">{t("capacity.generateHelp")}</s-text>
          <s-stack direction="inline" gap="base">
            <TimeSelect label={t("capacity.from")} locale={locale} value={gen.start} onChange={(v) => setGen({ ...gen, start: v ?? "09:00" })} />
            <TimeSelect label={t("capacity.until")} locale={locale} value={gen.end} onChange={(v) => setGen({ ...gen, end: v ?? "17:00" })} />
          </s-stack>
          <s-stack direction="inline" gap="base">
            <Select
              label={t("capacity.length")}
              value={String(gen.length)}
              options={[15, 30, 60, 120].map((n) => ({ value: String(n), label: t("capacity.nMinutes", { count: n }) }))}
              onChange={(v) => setGen({ ...gen, length: Number(v) })}
            />
            <NumberField label={t("capacity.gap")} suffix={t("capacity.minutes")} min={0} max={240} value={gen.gap} onChange={(v) => setGen({ ...gen, gap: v ?? 0 })} />
            <NumberField label={t("capacity.max")} details={t("capacity.blankUnlimited")} min={0} disabled={!p.capacityAllowed} value={gen.max} onChange={(v) => setGen({ ...gen, max: v })} />
          </s-stack>
          <WeekdayPicker label={t("capacity.weekdaysAllIfNone")} value={gen.weekdays} onChange={(v) => setGen({ ...gen, weekdays: v })} />
        </s-stack>
      </Modal>

      <Modal
        id={ovrModal}
        heading={t("capacity.addOverride")}
        primary={
          <Button
            slot="primary-action"
            variant="primary"
            disabled={!ovr.date}
            onClick={() => {
              if (!ovr.date) return;
              set((x) => {
                x.overrides = [...x.overrides.filter((o) => o.date !== ovr.date), { date: ovr.date!, maxPerDay: ovr.max, slots: null }].sort((a, b) =>
                  a.date < b.date ? -1 : 1,
                );
              });
              closeModal(ovrModal);
            }}
          >
            {t("common.done")}
          </Button>
        }
        secondary={
          <Button slot="secondary-actions" onClick={() => closeModal(ovrModal)}>
            {t("common.cancel")}
          </Button>
        }
      >
        <s-stack gap="base">
          <DateField label={t("capacity.overrideDate")} value={ovr.date} onChange={(v) => setOvr({ ...ovr, date: v })} />
          <NumberField label={t("capacity.maxPerDay")} details={t("capacity.blankUnlimited")} min={0} value={ovr.max} onChange={(v) => setOvr({ ...ovr, max: v })} />
        </s-stack>
      </Modal>
    </s-stack>
  );
}

