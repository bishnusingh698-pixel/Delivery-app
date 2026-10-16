/**
 * Small React wrappers around Polaris web components.
 *
 * React 18 passes props to custom elements as string attributes and does not
 * attach listeners for their custom events, so these wrappers set DOM
 * properties and add event listeners through refs. Pages use these instead of
 * raw <s-*> tags for every interactive field.
 */
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

type El = HTMLElement & Record<string, any>;

const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Set DOM properties on a custom element after each render. */
function useProps(ref: React.RefObject<El>, props: Record<string, unknown>) {
  useIso(() => {
    const el = ref.current;
    if (!el) return;
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined) continue;
      if (el[k] !== v) el[k] = v;
    }
  });
}

function useEvent(ref: React.RefObject<El>, type: string, handler: ((e: Event) => void) | undefined) {
  const saved = useRef(handler);
  saved.current = handler;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fn = (e: Event) => saved.current?.(e);
    el.addEventListener(type, fn);
    return () => el.removeEventListener(type, fn);
  }, [ref, type]);
}

const valueOf = (e: Event) => (e.currentTarget as El).value as string;

interface Common {
  label: string;
  details?: string;
  error?: string;
  disabled?: boolean;
  id?: string;
  labelAccessibilityVisibility?: "visible" | "exclusive";
}

export function TextField(
  p: Common & {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    multiline?: number;
    prefix?: string;
    suffix?: string;
    maxLength?: number;
    type?: "text" | "email" | "url" | "search";
    required?: boolean;
  },
) {
  const ref = useRef<El>(null);
  useProps(ref, { value: p.value ?? "", error: p.error ?? "", disabled: !!p.disabled, required: !!p.required });
  useEvent(ref, "input", (e) => p.onChange(valueOf(e)));
  const common = {
    ref,
    id: p.id,
    label: p.label,
    details: p.details,
    placeholder: p.placeholder,
    labelAccessibilityVisibility: p.labelAccessibilityVisibility,
  } as Record<string, unknown>;
  if (p.multiline) return <s-text-area {...common} rows={p.multiline} maxLength={p.maxLength} />;
  if (p.type === "email") return <s-email-field {...common} />;
  if (p.type === "url") return <s-url-field {...common} />;
  if (p.type === "search") return <s-search-field {...common} />;
  return <s-text-field {...common} prefix={p.prefix} suffix={p.suffix} maxLength={p.maxLength} />;
}

export function NumberField(
  p: Common & { value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; step?: number; suffix?: string; placeholder?: string },
) {
  const ref = useRef<El>(null);
  useProps(ref, { value: p.value === null || p.value === undefined ? "" : String(p.value), error: p.error ?? "", disabled: !!p.disabled });
  useEvent(ref, "input", (e) => {
    const v = valueOf(e);
    if (v === "" || v === null) return p.onChange(null);
    const n = Number(v);
    p.onChange(Number.isFinite(n) ? n : null);
  });
  return (
    <s-number-field
      ref={ref as any}
      id={p.id}
      label={p.label}
      details={p.details}
      min={p.min}
      max={p.max}
      step={p.step ?? 1}
      suffix={p.suffix}
      placeholder={p.placeholder}
      labelAccessibilityVisibility={p.labelAccessibilityVisibility}
    />
  );
}

export function MoneyField(p: Common & { value: string | null; onChange: (v: string | null) => void; currency?: string }) {
  const ref = useRef<El>(null);
  useProps(ref, { value: p.value ?? "", error: p.error ?? "", disabled: !!p.disabled });
  useEvent(ref, "input", (e) => p.onChange(valueOf(e) || null));
  return <s-money-field ref={ref as any} id={p.id} label={p.label} details={p.details} />;
}

export interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

export function Select(p: Common & { value: string; options: Option[]; onChange: (v: string) => void }) {
  const ref = useRef<El>(null);
  useProps(ref, { value: p.value, error: p.error ?? "", disabled: !!p.disabled });
  useEvent(ref, "change", (e) => p.onChange(valueOf(e)));
  return (
    <s-select ref={ref as any} id={p.id} label={p.label} details={p.details} labelAccessibilityVisibility={p.labelAccessibilityVisibility}>
      {p.options.map((o) => (
        <s-option key={o.value} value={o.value} {...(o.disabled ? { disabled: true } : {})}>
          {o.label}
        </s-option>
      ))}
    </s-select>
  );
}

export function Checkbox(p: Omit<Common, "error"> & { checked: boolean; onChange: (v: boolean) => void; error?: string }) {
  const ref = useRef<El>(null);
  useProps(ref, { checked: !!p.checked, disabled: !!p.disabled, error: p.error ?? "" });
  useEvent(ref, "change", (e) => p.onChange(!!(e.currentTarget as El).checked));
  return <s-checkbox ref={ref as any} id={p.id} label={p.label} details={p.details} />;
}

export function Switch(p: Omit<Common, "error"> & { checked: boolean; onChange: (v: boolean) => void }) {
  const ref = useRef<El>(null);
  useProps(ref, { checked: !!p.checked, disabled: !!p.disabled });
  useEvent(ref, "change", (e) => p.onChange(!!(e.currentTarget as El).checked));
  return <s-switch ref={ref as any} id={p.id} label={p.label} details={p.details} />;
}

/** Single choice (radio group). */
export function ChoiceList(p: Common & { value: string; options: (Option & { details?: string })[]; onChange: (v: string) => void }) {
  const ref = useRef<El>(null);
  useProps(ref, { values: [p.value], disabled: !!p.disabled, error: p.error ?? "" });
  useEvent(ref, "change", (e) => {
    const vals = (e.currentTarget as El).values as string[];
    if (vals?.[0] !== undefined) p.onChange(vals[0]);
  });
  return (
    <s-choice-list ref={ref as any} id={p.id} label={p.label} details={p.details}>
      {p.options.map((o) => (
        <s-choice key={o.value} value={o.value} {...(o.disabled ? { disabled: true } : {})} {...(o.value === p.value ? { selected: true } : {})}>
          {o.label}
          {o.details ? <s-text slot="details">{o.details}</s-text> : null}
        </s-choice>
      ))}
    </s-choice-list>
  );
}

/** Multiple choice (checkbox group). */
export function MultiChoice(p: Common & { values: string[]; options: Option[]; onChange: (v: string[]) => void }) {
  const ref = useRef<El>(null);
  useProps(ref, { values: p.values, disabled: !!p.disabled, error: p.error ?? "" });
  useEvent(ref, "change", (e) => p.onChange([...(((e.currentTarget as El).values as string[]) ?? [])]));
  return (
    <s-choice-list ref={ref as any} multiple id={p.id} label={p.label} details={p.details}>
      {p.options.map((o) => (
        <s-choice key={o.value} value={o.value} {...(p.values.includes(o.value) ? { selected: true } : {})}>
          {o.label}
        </s-choice>
      ))}
    </s-choice-list>
  );
}

export function DateField(p: Common & { value: string | null; onChange: (v: string | null) => void; allow?: string }) {
  const ref = useRef<El>(null);
  useProps(ref, { value: p.value ?? "", error: p.error ?? "", disabled: !!p.disabled });
  useEvent(ref, "change", (e) => p.onChange(valueOf(e) || null));
  return <s-date-field ref={ref as any} id={p.id} label={p.label} details={p.details} allow={p.allow} />;
}

export function ColorField(p: Common & { value: string; onChange: (v: string) => void }) {
  const ref = useRef<El>(null);
  useProps(ref, { value: p.value, error: p.error ?? "" });
  useEvent(ref, "change", (e) => p.onChange(valueOf(e)));
  return <s-color-field ref={ref as any} id={p.id} label={p.label} details={p.details} />;
}

/** Time picker as a select in 15-minute steps (24h values, localised labels). */
export function TimeSelect(
  p: Common & { value: string | null; onChange: (v: string | null) => void; allowEmpty?: string; locale?: string; step?: number },
) {
  const step = p.step ?? 15;
  const fmt = (() => {
    try {
      return new Intl.DateTimeFormat(p.locale || "en", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
    } catch {
      return null;
    }
  })();
  const opts: Option[] = [];
  if (p.allowEmpty !== undefined) opts.push({ value: "", label: p.allowEmpty });
  for (let m = 0; m < 1440; m += step) {
    const v = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    opts.push({ value: v, label: fmt ? fmt.format(new Date(Date.UTC(2000, 0, 1, Math.floor(m / 60), m % 60))) : v });
  }
  if (p.value && !opts.some((o) => o.value === p.value)) opts.push({ value: p.value, label: p.value });
  return <Select {...p} value={p.value ?? ""} options={opts} onChange={(v) => p.onChange(v || null)} />;
}

export function Button(
  p: {
    children: ReactNode;
    onClick?: () => void;
    variant?: "primary" | "secondary" | "tertiary" | "auto";
    tone?: "critical" | "auto" | "neutral";
    href?: string;
    target?: string;
    disabled?: boolean;
    loading?: boolean;
    icon?: string;
    slot?: string;
    accessibilityLabel?: string;
    commandFor?: string;
    command?: string;
    type?: "button" | "submit";
  },
) {
  const ref = useRef<El>(null);
  useProps(ref, { disabled: !!p.disabled, loading: !!p.loading });
  useEvent(ref, "click", p.onClick ? () => p.onClick?.() : undefined);
  return (
    <s-button
      ref={ref as any}
      variant={p.variant}
      tone={p.tone}
      href={p.href}
      target={p.target as any}
      icon={p.icon as any}
      slot={p.slot as any}
      accessibilityLabel={p.accessibilityLabel}
      commandFor={p.commandFor as any}
      command={p.command as any}
      type={p.type}
    >
      {p.children}
    </s-button>
  );
}

/** Page shell: title, subtitle, optional back link and primary action. */
export function Page(p: {
  title: string;
  subtitle?: string;
  backTo?: { href: string; label: string };
  primary?: ReactNode;
  secondary?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <s-page heading={p.title} inlineSize={p.wide ? "large" : "base"}>
      {p.backTo ? (
        <s-link slot="breadcrumb-actions" href={p.backTo.href}>
          {p.backTo.label}
        </s-link>
      ) : null}
      {p.primary}
      {p.secondary}
      {p.subtitle ? (
        <s-box paddingBlockEnd="base">
          <s-text color="subdued">{p.subtitle}</s-text>
        </s-box>
      ) : null}
      {p.children}
    </s-page>
  );
}

export function Section(p: { heading?: string; children: ReactNode; id?: string; aside?: boolean }) {
  return (
    <s-section heading={p.heading} id={p.id} {...(p.aside ? { slot: "aside" } : {})}>
      {p.children}
    </s-section>
  );
}

export function Stack(p: { children: ReactNode; direction?: "block" | "inline"; gap?: string; alignItems?: string; justifyContent?: string; wrap?: boolean }) {
  return (
    <s-stack
      direction={p.direction ?? "block"}
      gap={(p.gap ?? "base") as any}
      alignItems={p.alignItems as any}
      justifyContent={p.justifyContent as any}
    >
      {p.children}
    </s-stack>
  );
}

/** A modal you open with a button `commandFor={id}` or `openModal(id)`. */
export function Modal(p: { id: string; heading: string; children: ReactNode; primary?: ReactNode; secondary?: ReactNode; size?: "base" | "large" | "small" }) {
  return (
    <s-modal id={p.id} heading={p.heading} size={p.size as any}>
      {p.children}
      {p.primary}
      {p.secondary}
    </s-modal>
  );
}

export function openModal(id: string) {
  (document.getElementById(id) as El | null)?.showOverlay?.();
}

export function closeModal(id: string) {
  (document.getElementById(id) as El | null)?.hideOverlay?.();
}

/** A locked feature: lock badge + upgrade button (never hidden). */
export function Locked(p: { plan: "Starter" | "Pro"; label: string; upgradeLabel: string }) {
  return (
    <s-banner tone="info" heading={p.label}>
      <s-stack direction="inline" gap="small-200" alignItems="center">
        <s-badge icon="lock">{p.plan}</s-badge>
        <s-link href="/app/plans">{p.upgradeLabel}</s-link>
      </s-stack>
    </s-banner>
  );
}

export function EmptyState(p: { heading: string; text: string; action?: ReactNode; image?: string }) {
  return (
    <s-section accessibilityLabel={p.heading}>
      <s-grid gap="base" justifyItems="center" paddingBlock="large-400">
        {p.image ? <s-image src={p.image} alt="" inlineSize="auto" /> : null}
        <s-grid justifyItems="center" maxInlineSize="450px" gap="base">
          <s-stack alignItems="center">
            <s-heading>{p.heading}</s-heading>
            <s-paragraph>{p.text}</s-paragraph>
          </s-stack>
          {p.action}
        </s-grid>
      </s-grid>
    </s-section>
  );
}

/** Placeholder blocks while data loads. */
export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <s-section>
      <s-stack gap="base">
        {Array.from({ length: lines }).map((_, i) => (
          <s-box key={i} background="subdued" borderRadius="base" minBlockSize="20px" inlineSize={i === 0 ? "40%" : "100%"} />
        ))}
      </s-stack>
    </s-section>
  );
}
