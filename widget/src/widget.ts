/**
 * Pickday storefront widget: state, cart sync and rendering.
 */
import { addDays, addMonths, daysInMonth, firstOfMonth, fromMinutes, toMinutes, weekday } from "../../core/civil";
import { buildCalendar, checkSelection, cutoffFor, engineTimeZone, firstAvailableDate, resolveRules, type EngineInput } from "../../core/engine";
import { weekOrder } from "../../core/i18n/week";
import { normalizePostcode } from "../../core/postcode";
import { areaConfig, areaCovered, datedLines, findZone, locationsFor, methodsFor } from "../../core/rules";
import { ATTR_KEY, READABLE_KEYS, decodeItemSelection, decodeSelection, encodeSelection } from "../../core/selection";
import { nowInZone, zoneDiffersFromDevice, zoneDisplayName } from "../../core/tz";
import type { Availability, CartLine, DayStatus, LocalNow, MethodId, Selection, StorefrontConfig, Surcharge } from "../../core/types";
import { addVariant, changeLine, getCart, minOrderSubtotal, notifyTheme, productTags, updateAttributes, type Cart } from "./cart";
import { h, nextId, swap } from "./dom";
import { makeTexts, type Texts } from "./i18n";

export interface BootData {
  config: StorefrontConfig | null;
  availability: Availability | null;
  locale: string;
  country: string | null;
  currency: string;
  rate: number;
  template: string;
  pseudo?: boolean;
  poweredByUrl: string;
  brand: string;
  assetBase: string;
  /** Collections of items in the cart at page render (Liquid). */
  itemCollections?: Record<string, string[]>;
  /** Tags of items in the cart at page render (Liquid). */
  itemTags?: Record<string, string[]>;
}

type Item = { d: string | null; s: string | null };

interface State {
  method: MethodId | null;
  locationId: string | null;
  postcode: string;
  areaId: string | null;
  region: string | null;
  areaChecked: boolean;
  date: string | null;
  slotId: string | null;
  items: Record<string, Item>;
  month: string | null;
  editing: boolean;
  notice: string | null;
  error: string | null;
  focusReason: string | null;
}

const log = (cfg: StorefrontConfig | null, ...args: unknown[]) => {
  if (cfg?.debugUntil && new Date(cfg.debugUntil) > new Date()) console.debug("[Pickday]", ...args);
};

export class Pickday {
  cfg: StorefrontConfig;
  avail: Availability | null;
  tx: Texts;
  cart: Cart | null = null;
  lines: CartLine[] = [];
  mounts = new Set<HTMLElement>();
  st: State;
  saving: number | undefined;
  inflight: Promise<void> | null = null;
  lastSaved = "";
  ready = false;
  hidden = true;

  constructor(public boot: BootData) {
    this.cfg = boot.config!;
    this.avail = boot.availability;
    this.tx = makeTexts(boot.locale, this.cfg.texts, boot.pseudo);
    let session: Partial<State> = {};
    try {
      session = JSON.parse(sessionStorage.getItem("pickday:area") ?? "{}");
    } catch {
      /* ignore */
    }
    this.st = {
      method: null,
      locationId: null,
      postcode: session.postcode ?? "",
      areaId: session.areaId ?? null,
      region: session.region ?? null,
      areaChecked: !!session.areaChecked,
      date: null,
      slotId: null,
      items: {},
      month: null,
      editing: true,
      notice: null,
      error: null,
      focusReason: null,
    };
  }

  /* ------------------------------------------------------------ data */

  get country() {
    return this.boot.country;
  }

  get dated(): CartLine[] {
    return datedLines(this.lines, this.cfg.productRules);
  }

  get methods(): MethodId[] {
    return methodsFor(this.cfg, this.country, this.dated);
  }

  surchargeVariants(): Set<string> {
    return new Set(this.cfg.surcharges.map((f) => f.variantId).filter(Boolean) as string[]);
  }

  async loadCart() {
    const cart = await getCart();
    this.cart = cart;
    const fees = this.surchargeVariants();
    const lines: CartLine[] = [];
    const needTags = this.rulesUseTags();
    for (const it of cart.items) {
      if (fees.has(String(it.variant_id))) continue;
      lines.push({
        key: it.key,
        productId: String(it.product_id),
        variantId: String(it.variant_id),
        quantity: it.quantity,
        title: it.product_title,
        giftCard: it.gift_card,
        requiresShipping: it.requires_shipping,
        tags: needTags ? this.boot.itemTags?.[String(it.product_id)] ?? (await productTags(it.handle)) : [],
        collections: this.boot.itemCollections?.[String(it.product_id)],
      });
    }
    this.lines = lines;
  }

  rulesUseTags(): boolean {
    const pr = this.cfg.productRules;
    return [pr.exclude, ...pr.extraLead.map((r) => r.target), ...pr.restrictions.map((r) => r.target), ...pr.limits.map((r) => r.target), ...pr.methodOnly.map((r) => r.target)].some(
      (t) => t.tags.length > 0,
    );
  }

  now(method = this.st.method, loc = this.st.locationId): LocalNow {
    return nowInZone(engineTimeZone(this.cfg, method ?? "shipping", loc));
  }

  zoneId(): string | null {
    if (this.st.method !== "delivery") return null;
    return findZone(this.cfg, { country: this.country, postcode: this.st.postcode, areaId: this.st.areaId, region: this.st.region })?.id ?? null;
  }

  input(over: Partial<EngineInput> = {}): EngineInput {
    return {
      config: this.cfg,
      availability: this.avail,
      method: this.st.method ?? "shipping",
      locationId: this.st.method === "pickup" ? this.st.locationId : null,
      zoneId: this.zoneId(),
      now: this.now(),
      lines: this.dated,
      ...over,
    };
  }

  /** Does local delivery need an area answer before showing dates? */
  areaGate(): { needed: boolean; covered: boolean | null } {
    if (this.st.method !== "delivery") return { needed: false, covered: null };
    const ac = areaConfig(this.cfg, this.country);
    if (!ac || ac.mode === "none") return { needed: false, covered: null };
    const covered = areaCovered(this.cfg, { country: this.country, postcode: this.st.postcode, areaId: this.st.areaId, region: this.st.region });
    const answered = ac.mode === "postcode" ? this.st.areaChecked && !!this.st.postcode : ac.mode === "area" ? !!this.st.areaId : !!this.st.region;
    return { needed: ac.askFirst ? !answered || covered === false : covered === false, covered: answered ? covered : null };
  }

  minOrderBlocked(id: MethodId): string | null {
    const m = this.cfg.methods.find((x) => x.id === id);
    if (!m?.minOrder || !this.cart) return null;
    const min = Number(m.minOrder) * (this.boot.rate || 1);
    // Same amount the checkout Function checks: before order discounts, without Pickday's fee lines.
    if (minOrderSubtotal(this.cart, this.surchargeVariants()) / 100 >= min) return null;
    return this.tx.t("minOrder", { method: this.methodName(id), amount: this.tx.money(min, this.boot.currency) });
  }

  methodName(id: MethodId, locale = this.boot.locale, tx = this.tx): string {
    const m = this.cfg.methods.find((x) => x.id === id);
    return m?.names[locale] || m?.names[tx.textLocale] || tx.t(`method.${id}`);
  }

  dateLabelKey(): string {
    const m = this.cfg.methods.find((x) => x.id === this.st.method);
    if (this.st.method === "pickup") return "date.label.pickup";
    if (this.st.method === "shipping" && m?.dateMeaning === "dispatch") return "date.label.dispatch";
    return "date.label.delivery";
  }

  /* ------------------------------------------------------- lifecycle */

  async start() {
    await this.loadCart();
    this.restore();
    this.ready = true;
    await this.revalidate();
    this.render();
    window.setInterval(() => this.tick(), 60_000);
  }

  /** Read the saved selection from the cart. */
  restore() {
    const sel = decodeSelection(this.cart?.attributes?.[ATTR_KEY]);
    const methods = this.methods;
    if (sel && methods.includes(sel.m)) {
      this.st.method = sel.m;
      this.st.locationId = sel.l;
      this.st.date = sel.d;
      this.st.slotId = sel.s;
      if (sel.m === "delivery" && sel.a) {
        const ac = areaConfig(this.cfg, this.country);
        if (ac?.mode === "area") this.st.areaId = sel.a;
        else if (ac?.mode === "region") this.st.region = sel.a;
        else if (sel.a) {
          this.st.postcode = sel.a;
          this.st.areaChecked = true;
        }
      }
      this.st.editing = !sel.d;
    } else {
      // Adopt a date chosen on the product page (line property) for one-date mode.
      const fromLine = this.cart?.items.map((i) => decodeItemSelection(i.properties?.[ATTR_KEY])).find((x) => x?.d);
      this.st.method = this.cfg.defaultMethod && methods.includes(this.cfg.defaultMethod) ? this.cfg.defaultMethod : methods[0] ?? null;
      if (fromLine && this.cfg.dateMode === "order") {
        this.st.date = fromLine.d;
        this.st.slotId = fromLine.s;
      }
    }
    if (this.cfg.dateMode === "item" && this.cart) {
      for (const it of this.cart.items) {
        const s = decodeItemSelection(it.properties?.[ATTR_KEY]);
        if (s) this.st.items[it.key] = { d: s.d, s: s.s };
      }
    }
    this.ensureLocation();
  }

  ensureLocation() {
    if (this.st.method !== "pickup") return;
    const locs = locationsFor(this.cfg, this.country);
    if (!locs.some((l) => l.id === this.st.locationId)) this.st.locationId = locs.length === 1 ? locs[0].id : null;
  }

  async tick() {
    // Cutoff may have passed or a slot filled while the shopper is on the page.
    if (await this.revalidate()) this.render();
  }

  async refresh() {
    await this.loadCart();
    if (!this.methods.includes(this.st.method as MethodId)) {
      this.st.method = this.methods[0] ?? null;
      this.ensureLocation();
    }
    await this.revalidate();
    this.render();
  }

  /** Drop anything no longer valid. Returns true if something changed. */
  async revalidate(): Promise<boolean> {
    let changed = false;
    const methods = this.methods;
    if (!this.dated.length || !methods.length) {
      // Nothing needs a date (e.g. gift-card-only cart) or no method offered here: clear and hide.
      if (this.cart?.attributes?.[ATTR_KEY]) await this.persist(true);
      return false;
    }
    if (this.st.method && !methods.includes(this.st.method)) {
      this.st.method = methods[0];
      this.st.date = null;
      this.st.slotId = null;
      changed = true;
    }
    if (this.cfg.dateMode === "item") {
      for (const line of this.dated) {
        const it = this.st.items[line.key];
        if (!it?.d) continue;
        const r = checkSelection(this.input({ lines: [line] }), it.d, it.s);
        if (!r.ok && r.reason !== "slotRequired") {
          log(this.cfg, "item invalid", line.title, r);
          this.st.items[line.key] = { d: null, s: null };
          this.st.notice = this.tx.t("invalidated");
          changed = true;
        }
      }
    } else if (this.st.date) {
      const r = checkSelection(this.input(), this.st.date, this.st.slotId);
      if (!r.ok && r.reason !== "slotRequired") {
        log(this.cfg, "selection invalid", this.st.date, r);
        this.st.date = null;
        this.st.slotId = null;
        this.st.editing = true;
        this.st.notice = this.tx.t("invalidated");
        changed = true;
      }
    }
    if (changed || this.cart?.attributes?.[ATTR_KEY] === undefined) this.schedulePersist();
    return changed;
  }

  /* --------------------------------------------------------- saving */

  selection(): Selection | null {
    if (!this.st.method) return null;
    const ac = areaConfig(this.cfg, this.country);
    const area = this.st.method !== "delivery" ? null : ac?.mode === "area" ? this.st.areaId : ac?.mode === "region" ? this.st.region : this.st.postcode ? normalizePostcode(this.st.postcode) : null;
    const slot = this.slotObj();
    const fees = this.currentFees();
    return {
      v: 1,
      m: this.st.method,
      d: this.cfg.dateMode === "order" ? this.st.date : null,
      s: slot?.id ?? null,
      t: slot ? `${slot.start}-${slot.end}` : null,
      l: this.st.method === "pickup" ? this.st.locationId : null,
      z: this.zoneId(),
      a: area,
      c: this.country,
      // Saved labels are shown at checkout later: no "Today"/"Tomorrow" in them.
      lbl: this.st.date ? this.label(this.st.date, slot ? [slot.start, slot.end] : null, this.tx, false) : null,
      lc: this.boot.locale,
      f: fees.length ? fees.map((f) => f.id) : null,
    };
  }

  slotObj() {
    if (!this.st.date || !this.st.slotId) return null;
    const cal = buildCalendar(this.input(), this.st.date, this.st.date);
    return cal.days[0]?.slots.find((s) => s.slot.id === this.st.slotId)?.slot ?? null;
  }

  currentFees(): Surcharge[] {
    if (!this.st.date || this.cfg.dateMode !== "order") return [];
    const r = checkSelection(this.input(), this.st.date, this.st.slotId);
    return r.ok ? r.fees.filter((f) => f.variantId) : [];
  }

  /** "Fri, 18 Oct, 10:00–12:00" in the shopper's language. */
  label(date: string, slot: [string, string] | null, tx = this.tx, relative = true): string {
    const today = this.now().date;
    const m = this.cfg.methods.find((x) => x.id === this.st.method);
    let d = tx.date(date);
    if (relative && m?.schedule.todayTomorrowLabels && tx === this.tx) {
      if (date === today) d = tx.t("calendar.today");
      else if (date === addDays(today, 1)) d = tx.t("calendar.tomorrow");
    }
    return slot ? `${d}, ${tx.range(slot[0], slot[1])}` : d;
  }

  schedulePersist() {
    window.clearTimeout(this.saving);
    this.saving = window.setTimeout(() => {
      this.saving = undefined;
      void this.track(this.persist(false));
    }, 300);
  }

  private track(p: Promise<void>): Promise<void> {
    const run = p.catch((e) => log(this.cfg, "save failed", e)).finally(() => {
      if (this.inflight === run) this.inflight = null;
    });
    this.inflight = run;
    return run;
  }

  /** Is a cart save waiting or running? (checkout must wait for it) */
  hasPendingSave(): boolean {
    return this.saving !== undefined || this.inflight !== null;
  }

  /** Finish any waiting or running save now. */
  async flush(): Promise<void> {
    if (this.saving !== undefined) {
      window.clearTimeout(this.saving);
      this.saving = undefined;
      await this.track(this.persist(false));
    }
    while (this.inflight) await this.inflight;
  }

  /** Write cart attributes (and per-item properties / surcharge lines). */
  async persist(clear: boolean) {
    const sel = clear ? null : this.selection();
    const attrs: Record<string, string> = {
      [ATTR_KEY]: "",
      [READABLE_KEYS.method]: "",
      [READABLE_KEYS.date]: "",
      [READABLE_KEYS.slot]: "",
      [READABLE_KEYS.location]: "",
      [READABLE_KEYS.area]: "",
    };
    if (sel) {
      const ptx = await this.primaryTexts();
      attrs[ATTR_KEY] = encodeSelection(sel);
      attrs[READABLE_KEYS.method] = this.methodName(sel.m, this.cfg.primaryLocale, ptx);
      if (sel.d) attrs[READABLE_KEYS.date] = `${ptx.date(sel.d, "long")} (${sel.d})`;
      if (sel.t) attrs[READABLE_KEYS.slot] = ptx.range(sel.t.slice(0, 5), sel.t.slice(6, 11));
      const loc = this.cfg.locations.find((l) => l.id === sel.l);
      if (loc) attrs[READABLE_KEYS.location] = loc.name;
      if (sel.a) {
        const ac = areaConfig(this.cfg, this.country);
        const area = ac?.areas.find((a) => a.id === sel.a);
        attrs[READABLE_KEYS.area] = area ? area.names[this.cfg.primaryLocale] || Object.values(area.names)[0] || sel.a : ac?.regionNames?.[sel.a] ?? this.st.postcode ?? sel.a;
      }
    }
    const sig = JSON.stringify(attrs);
    const current = this.cart?.attributes ?? {};
    const same = Object.entries(attrs).every(([k, v]) => (current[k] ?? "") === v);
    if (sig === this.lastSaved && same) return;
    this.lastSaved = sig;
    if (!same) {
      log(this.cfg, "save", attrs);
      this.cart = await updateAttributes(attrs);
    }
    if (this.cfg.dateMode === "item") await this.persistItems(clear);
    await this.syncFees(clear ? [] : this.currentFees());
  }

  async persistItems(clear: boolean) {
    if (!this.cart) return;
    const ptx = await this.primaryTexts();
    for (const item of [...this.cart.items]) {
      const line = this.dated.find((l) => l.key === item.key);
      const it = line && !clear ? this.st.items[item.key] : null;
      const props = { ...(item.properties ?? {}) };
      const slot = it?.d && it.s ? this.itemSlot(line!, it) : null;
      const want: Record<string, string> = {
        [ATTR_KEY]: it?.d ? JSON.stringify({ d: it.d, s: it.s, t: slot ? `${slot.start}-${slot.end}` : null, lbl: this.label(it.d, slot ? [slot.start, slot.end] : null, this.tx, false) }) : "",
        [READABLE_KEYS.date]: it?.d ? `${ptx.date(it.d, "long")} (${it.d})` : "",
        [READABLE_KEYS.slot]: slot ? ptx.range(slot.start, slot.end) : "",
      };
      const changed = Object.entries(want).some(([k, v]) => (props[k] ?? "") !== v);
      if (!changed) continue;
      for (const [k, v] of Object.entries(want)) {
        if (v) props[k] = v;
        else delete props[k];
      }
      // Changing properties changes the line key: carry the selection over.
      const before: Set<string> = new Set(this.cart.items.map((i) => i.key));
      this.cart = await changeLine(item.key, { quantity: item.quantity, properties: props });
      const newKey = this.cart.items.find((i) => !before.has(i.key))?.key;
      if (newKey && it) {
        this.st.items[newKey] = it;
        delete this.st.items[item.key];
      }
    }
    await this.loadCart();
  }

  itemSlot(line: CartLine, it: Item) {
    if (!it.d || !it.s) return null;
    return buildCalendar(this.input({ lines: [line] }), it.d, it.d).days[0]?.slots.find((s) => s.slot.id === it.s)?.slot ?? null;
  }

  async syncFees(want: Surcharge[]) {
    if (!this.cart) return;
    const fees = this.surchargeVariants();
    if (!fees.size) return;
    const wanted = new Set(want.map((f) => f.variantId!));
    let changed = false;
    for (const it of this.cart.items) {
      const vid = String(it.variant_id);
      if (!fees.has(vid)) continue;
      if (!wanted.has(vid) || it.quantity !== 1) {
        await changeLine(it.key, { quantity: wanted.has(vid) ? 1 : 0 });
        changed = true;
      }
      wanted.delete(vid);
    }
    for (const vid of wanted) {
      const names = want.filter((f) => f.variantId === vid).map((f) => f.label).filter(Boolean);
      await addVariant(vid, 1, names.length ? { Fee: names.join(", ") } : undefined);
      changed = true;
    }
    if (changed) {
      log(this.cfg, "surcharge synced", [...wanted]);
      if (location.pathname.endsWith("/cart")) {
        location.reload();
        return;
      }
      notifyTheme();
      this.cart = await getCart();
    }
  }

  private primary: Texts | null = null;
  /** Texts in the store's primary language for the readable attributes. */
  async primaryTexts(): Promise<Texts> {
    if (this.primary) return this.primary;
    const pl = this.cfg.primaryLocale || "en";
    const loc = makeTexts(pl, {}, false);
    if (!window.PickdayI18n?.[loc.textLocale]) {
      await new Promise<void>((resolve) => {
        const s = document.createElement("script");
        s.src = `${this.boot.assetBase}pickday-i18n-${loc.textLocale}.js`;
        s.onload = s.onerror = () => resolve();
        document.head.appendChild(s);
      });
    }
    this.primary = makeTexts(pl, this.cfg.texts, false);
    return this.primary;
  }

  /* ---------------------------------------------- checkout gating */

  /** Is the shopper allowed to continue to checkout? Shows the inline message if not. */
  canCheckout(): boolean {
    if (!this.ready || !this.dated.length || !this.methods.length || !this.st.method) return true;
    const m = this.cfg.methods.find((x) => x.id === this.st.method);
    if (!m?.dateRequired) return true;
    let msg: string | null = null;
    if (this.areaGate().needed) msg = this.tx.t("required");
    else if (this.cfg.dateMode === "item") {
      if (this.dated.some((l) => !this.st.items[l.key]?.d)) msg = this.tx.t("requiredItems");
    } else if (!this.st.date) msg = this.tx.t("required");
    else {
      const r = checkSelection(this.input(), this.st.date, this.st.slotId);
      if (!r.ok) msg = r.reason === "slotRequired" || r.reason === "slotUnavailable" ? this.tx.t("requiredSlot") : this.tx.t("required");
    }
    if (!msg) return true;
    this.st.error = msg;
    this.render();
    const first = [...this.mounts].find((m) => m.isConnected && m.offsetParent !== null) ?? [...this.mounts][0];
    first?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    (first?.querySelector("[data-pd-err]") as HTMLElement | null)?.focus();
    return false;
  }

  /* ---------------------------------------------------- rendering */

  mount(el: HTMLElement) {
    this.mounts.add(el);
    el.classList.add("pickday");
    if (this.ready) this.renderInto(el);
  }

  render() {
    for (const el of [...this.mounts]) {
      if (!el.isConnected) {
        this.mounts.delete(el);
        continue;
      }
      this.renderInto(el);
    }
  }

  renderInto(el: HTMLElement) {
    const show = !!this.dated.length && !!this.methods.length;
    this.hidden = !show;
    el.hidden = !show;
    el.setAttribute("dir", this.tx.rtl ? "rtl" : "ltr");
    el.setAttribute("lang", this.boot.locale);
    el.dataset.theme = this.cfg.widget.theme;
    el.style.setProperty("--pd-accent", this.cfg.widget.accent);
    el.style.setProperty("--pd-radius", `${this.cfg.widget.radius}px`);
    el.classList.toggle("pd-compact", this.cfg.widget.compact);
    if (!show) {
      el.replaceChildren();
      return;
    }
    swap(el, this.view());
  }

  view(): HTMLElement {
    const t = this.tx.t;
    const st = this.st;
    const methods = this.methods;
    const parts: (Node | null)[] = [];
    parts.push(h("p", { class: "pd-heading" }, t("heading")));
    if (st.notice) parts.push(h("p", { class: "pd-notice", role: "status" }, st.notice));
    if (this.cfg.vacation.enabled) parts.push(this.vacationNote());
    if (methods.length > 1) parts.push(this.methodSelector(methods));
    const minBlock = st.method ? this.minOrderBlocked(st.method) : null;
    if (minBlock) parts.push(h("p", { class: "pd-error-inline" }, minBlock));
    if (st.method === "pickup") parts.push(this.locationSelector());
    const gate = this.areaGate();
    if (st.method === "delivery") parts.push(this.areaCheck(gate.covered));
    const canPickDates = st.method && !gate.needed && !minBlock && (st.method !== "pickup" || st.locationId);
    if (canPickDates) {
      if (this.cfg.dateMode === "item") parts.push(this.itemPickers());
      else if (!st.editing && st.date) parts.push(this.summary());
      else parts.push(this.datePicker());
    }
    if (zoneDiffersFromDevice(engineTimeZone(this.cfg, st.method ?? "shipping", st.locationId))) {
      parts.push(h("p", { class: "pd-tz" }, t("tzNote", { zone: zoneDisplayName(engineTimeZone(this.cfg, st.method ?? "shipping", st.locationId), this.boot.locale) })));
    }
    if (st.error) parts.push(h("p", { class: "pd-error", role: "alert", tabindex: "-1", "data-pd-err": "", "data-fk": "err" }, st.error));
    if (this.cfg.plan === "free") {
      parts.push(h("p", { class: "pd-powered" }, h("a", { href: this.boot.poweredByUrl, target: "_blank", rel: "noopener" }, t("poweredBy", { brand: this.boot.brand }))));
    }
    if (this.cfg.widget.customCss && this.cfg.plan === "pro") parts.push(h("style", null, this.cfg.widget.customCss));
    return h("div", { class: "pd-root", role: "group", "aria-label": t("heading") }, parts);
  }

  vacationNote(): Node | null {
    const v = this.cfg.vacation;
    const today = this.now().date;
    if (!v.start || today > (v.end ?? "9999") || addDays(today, 60) < v.start) return null;
    const custom = v.message[this.boot.locale] || v.message[this.tx.textLocale];
    const text = custom || (v.end ? this.tx.t("vacation", { date: this.tx.date(v.end), nextDate: this.tx.date(addDays(v.end, 1)) }) : null);
    return text ? h("p", { class: "pd-notice" }, text) : null;
  }

  methodSelector(methods: MethodId[]): Node {
    const name = nextId("m");
    const icons: Record<MethodId, string> = {
      delivery: "M3 6h11v9H3zM14 9h4l3 3v3h-7zM6.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
      pickup: "M4 9l2-5h12l2 5M4 9h16v11H4zM9 20v-6h6v6",
      shipping: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
    };
    return h(
      "fieldset",
      { class: "pd-methods" },
      h("legend", { class: "pd-sr" }, this.tx.t("methodGroup")),
      methods.map((id) =>
        h(
          "label",
          { class: `pd-method${this.st.method === id ? " is-active" : ""}` },
          h("input", {
            type: "radio",
            name,
            value: id,
            checked: this.st.method === id,
            "data-fk": `m-${id}`,
            onchange: () => {
              this.st.method = id;
              this.st.date = null;
              this.st.slotId = null;
              this.st.editing = true;
              this.st.error = null;
              this.st.notice = null;
              this.ensureLocation();
              this.render();
              this.schedulePersist();
            },
          }),
          this.cfg.widget.icons
            ? h("span", { class: "pd-icon", "aria-hidden": "true" }, svg(icons[id]))
            : null,
          h("span", null, this.methodName(id)),
        ),
      ),
    );
  }

  locationSelector(): Node | null {
    const locs = locationsFor(this.cfg, this.country);
    if (!locs.length) return null;
    const cur = locs.find((l) => l.id === this.st.locationId);
    const id = nextId("loc");
    const instructions = cur ? cur.instructions[this.boot.locale] || cur.instructions[this.tx.textLocale] || Object.values(cur.instructions)[0] : "";
    return h(
      "div",
      { class: "pd-field" },
      locs.length > 1
        ? [
            h("label", { for: id, class: "pd-label" }, this.tx.t("location.label")),
            h(
              "select",
              {
                id,
                class: "pd-select",
                "data-fk": "loc",
                onchange: (e: Event) => {
                  this.st.locationId = (e.target as HTMLSelectElement).value || null;
                  this.st.date = null;
                  this.st.slotId = null;
                  this.st.editing = true;
                  this.render();
                  this.schedulePersist();
                },
              },
              h("option", { value: "" }, "—"),
              locs.map((l) => h("option", { value: l.id, selected: l.id === this.st.locationId }, l.address ? `${l.name} · ${l.address.split("\n")[0]}` : l.name)),
            ),
          ]
        : h("p", { class: "pd-label" }, `${this.tx.t("location.label")}: ${locs[0].name}`),
      cur && (instructions || cur.mapUrl)
        ? h(
            "div",
            { class: "pd-instructions" },
            instructions ? h("p", null, h("strong", null, this.tx.t("location.instructions")), " ", instructions) : null,
            cur.mapUrl && /^https?:\/\//i.test(cur.mapUrl) ? h("a", { href: cur.mapUrl, target: "_blank", rel: "noopener" }, this.tx.t("location.map")) : null,
          )
        : null,
    );
  }

  areaCheck(covered: boolean | null): Node | null {
    const ac = areaConfig(this.cfg, this.country);
    if (!ac || ac.mode === "none") return null;
    const t = this.tx.t;
    const remember = () => {
      try {
        sessionStorage.setItem("pickday:area", JSON.stringify({ postcode: this.st.postcode, areaId: this.st.areaId, region: this.st.region, areaChecked: this.st.areaChecked }));
      } catch {
        /* ignore */
      }
    };
    const after = () => {
      this.st.date = null;
      this.st.slotId = null;
      this.st.editing = true;
      remember();
      this.render();
      this.schedulePersist();
    };
    const result =
      covered === null
        ? null
        : h(
            "p",
            { class: covered ? "pd-ok" : "pd-error-inline", role: "status" },
            covered
              ? ac.mode === "area"
                ? t("area.coveredArea", { area: this.areaName(this.st.areaId) })
                : ac.mode === "region"
                  ? t("area.coveredArea", { area: ac.regionNames?.[this.st.region ?? ""] ?? this.st.region ?? "" })
                  : t("area.covered", { postcode: this.st.postcode })
              : [t("area.notCovered", { postcode: this.st.postcode || this.areaName(this.st.areaId) }), this.methods.length > 1 ? " " + t("area.trySwitch") : ""],
          );
    if (ac.mode === "postcode") {
      const id = nextId("pc");
      let value = this.st.postcode;
      const check = () => {
        if (!value.trim()) {
          this.st.error = t("area.enterPostcode");
          this.render();
          return;
        }
        this.st.error = null;
        this.st.postcode = value.trim();
        this.st.areaChecked = true;
        after();
      };
      return h(
        "div",
        { class: "pd-field" },
        h("label", { for: id, class: "pd-label" }, t("area.postcodeLabel")),
        h(
          "div",
          { class: "pd-row" },
          h("input", {
            id,
            class: "pd-input",
            type: "text",
            inputmode: "text",
            autocomplete: "postal-code",
            value,
            "data-fk": "pc",
            oninput: (e: Event) => (value = (e.target as HTMLInputElement).value),
            onkeydown: (e: KeyboardEvent) => {
              if (e.key === "Enter") {
                e.preventDefault();
                check();
              }
            },
          }),
          h("button", { type: "button", class: "pd-btn", "data-fk": "pc-check", onclick: check }, t("area.check")),
        ),
        result,
      );
    }
    const id = nextId("area");
    const options =
      ac.mode === "area"
        ? ac.areas.map((a) => ({ value: a.id, label: a.names[this.boot.locale] || a.names[this.tx.textLocale] || Object.values(a.names)[0] || a.id }))
        : ac.regions.map((r) => ({ value: r, label: ac.regionNames?.[r] ?? r }));
    return h(
      "div",
      { class: "pd-field" },
      h("label", { for: id, class: "pd-label" }, t("area.areaLabel")),
      h(
        "select",
        {
          id,
          class: "pd-select",
          "data-fk": "area",
          onchange: (e: Event) => {
            const v = (e.target as HTMLSelectElement).value || null;
            if (ac.mode === "area") this.st.areaId = v;
            else this.st.region = v;
            after();
          },
        },
        h("option", { value: "" }, t("area.choose")),
        options.map((o) => h("option", { value: o.value, selected: o.value === (ac.mode === "area" ? this.st.areaId : this.st.region) }, o.label)),
      ),
      result,
    );
  }

  areaName(id: string | null): string {
    const ac = areaConfig(this.cfg, this.country);
    const a = ac?.areas.find((x) => x.id === id);
    return a ? a.names[this.boot.locale] || a.names[this.tx.textLocale] || Object.values(a.names)[0] || "" : "";
  }

  summary(): Node {
    const st = this.st;
    const slot = this.slotObj();
    const date = this.label(st.date!, null);
    const time = slot ? this.tx.range(slot.start, slot.end) : null;
    const loc = this.cfg.locations.find((l) => l.id === st.locationId);
    const m = this.cfg.methods.find((x) => x.id === st.method);
    let key: string;
    if (st.method === "pickup") key = loc && locationsFor(this.cfg, this.country).length > 1 ? (time ? "summary.pickupAtTime" : "summary.pickupAt") : time ? "summary.pickupTime" : "summary.pickup";
    else if (st.method === "shipping" && m?.dateMeaning === "dispatch") key = "summary.dispatch";
    else key = time ? "summary.deliveryTime" : "summary.delivery";
    const fees = this.currentFees();
    return h(
      "div",
      { class: "pd-summary" },
      h("span", { class: "pd-check", "aria-hidden": "true" }, svg("M5 12l5 5 9-10")),
      h("span", null, this.tx.t(key, { date, time, location: loc?.name ?? "" }), fees.length ? ` (${fees.map((f) => this.feeText(f)).join(", ")})` : ""),
      h(
        "button",
        {
          type: "button",
          class: "pd-link",
          "data-fk": "change",
          onclick: () => {
            st.editing = true;
            this.render();
          },
        },
        this.tx.t("change"),
      ),
    );
  }

  feeText(f: Surcharge): string {
    return this.tx.t("fee", { amount: this.tx.money(Number(f.amount) * (this.boot.rate || 1), this.boot.currency) });
  }

  reasonText(d: DayStatus): string {
    const t = this.tx.t;
    switch (d.reason) {
      case "holiday":
        return d.detail ? t("reason.holiday", { name: d.detail }) : t("reason.closed");
      case "closed":
        return d.detail ? t("reason.holiday", { name: d.detail }) : t("reason.closed");
      case "vacation":
        return t("reason.vacation");
      case "full":
        return t("reason.full");
      case "tooSoon":
      case "past":
        return t("reason.tooSoon");
      case "notYetOpen":
        return t("reason.notOpen");
      case "productUnavailable":
        return t("reason.productUnavailable", { product: d.detail ?? "" });
      case "soldOut":
        return t("reason.soldOut", { product: d.detail ?? "" });
      default:
        return t("reason.unavailable");
    }
  }

  datePicker(): Node {
    const now = this.now();
    const cal = buildCalendar(this.input(), now.date, addDays(now.date, 400));
    const t = this.tx.t;
    if (!cal.firstAvailable) {
      // Explain a product restriction if that's why nothing is available.
      const blocked = cal.days.find((d) => d.reason === "productUnavailable");
      return h("p", { class: "pd-error-inline", role: "status" }, blocked ? t("noCommonDate", { product: blocked.detail ?? "" }) : t("noDates"));
    }
    if (!this.st.month) this.st.month = firstOfMonth(this.st.date ?? cal.firstAvailable);
    if (this.cfg.widget.preselectEarliest && !this.st.date) {
      this.st.date = cal.firstAvailable;
      this.schedulePersist();
    }
    const byDate = new Map(cal.days.map((d) => [d.date, d]));
    const picker = this.cfg.widget.input === "dropdown" ? this.dateDropdown(cal.days) : this.calendar(byDate, now.date, cal.lastDate ?? now.date);
    const day = this.st.date ? byDate.get(this.st.date) : undefined;
    const parts: (Node | null)[] = [h("p", { class: "pd-label", id: "pd-date-label" }, t(this.dateLabelKey())), picker];
    if (this.st.focusReason) parts.push(h("p", { class: "pd-reason", role: "status" }, this.st.focusReason));
    if (day?.available && day.slots.length) parts.push(this.slots(day));
    if (day?.available && this.st.date && (!day.slots.length || this.st.slotId)) {
      parts.push(
        h(
          "button",
          {
            type: "button",
            class: "pd-btn pd-done",
            "data-fk": "done",
            onclick: () => {
              this.st.editing = false;
              this.render();
            },
          },
          "✓",
          h("span", { class: "pd-sr" }, this.tx.t("calendar.selected")),
        ),
      );
    }
    return h("div", { class: "pd-dates" }, parts);
  }

  pick(date: string) {
    this.st.date = date;
    this.st.slotId = null;
    this.st.error = null;
    this.st.notice = null;
    this.st.focusReason = null;
    const day = buildCalendar(this.input(), date, date).days[0];
    if (!day.slots.length) this.st.editing = false;
    this.render();
    this.schedulePersist();
  }

  dateDropdown(days: DayStatus[]): Node {
    const id = nextId("date");
    const avail = days.filter((d) => d.available).slice(0, 120);
    return h(
      "select",
      {
        id,
        class: "pd-select",
        "aria-labelledby": "pd-date-label",
        "data-fk": "date-select",
        onchange: (e: Event) => {
          const v = (e.target as HTMLSelectElement).value;
          if (v) this.pick(v);
        },
      },
      h("option", { value: "" }, this.tx.t("date.choose")),
      avail.map((d) => h("option", { value: d.date, selected: d.date === this.st.date }, this.label(d.date, null) + (d.fee ? ` (${this.feeText(d.fee)})` : ""))),
    );
  }

  calendar(byDate: Map<string, DayStatus>, today: string, last: string): Node {
    const month = this.st.month!;
    const order = weekOrder(this.boot.locale);
    const y = Number(month.slice(0, 4));
    const mo = Number(month.slice(5, 7));
    const n = daysInMonth(y, mo);
    const lead = (weekday(month) - order[0] + 7) % 7;
    const prevDisabled = month <= firstOfMonth(today);
    const nextDisabled = addMonths(month, 1) > last;
    const t = this.tx.t;
    const focusDate =
      (this.st.date && this.st.date.startsWith(month.slice(0, 8)) && this.st.date) ||
      [...byDate.values()].find((d) => d.available && d.date.startsWith(month.slice(0, 8)))?.date ||
      (today.startsWith(month.slice(0, 8)) ? today : month);
    const go = (delta: number) => {
      this.st.month = addMonths(month, delta);
      this.render();
    };
    const rows: Node[] = [];
    let cells: Node[] = Array.from({ length: lead }, () => h("td", { role: "gridcell" }));
    for (let i = 0; i < n; i++) {
      const date = addDays(month, i);
      const d = byDate.get(date);
      const available = !!d?.available;
      const selected = date === this.st.date;
      const reason = d && !available ? this.reasonText(d) : "";
      const left = available && d?.left !== null && d?.left !== undefined && this.showLeft(d.left) ? t("slot.left", { count: d.left }) : "";
      const fee = d?.fee ? this.feeText(d.fee) : "";
      const label = [this.tx.date(date, "long"), date === today ? t("calendar.today") : "", available ? t("calendar.available") : reason, left, fee, selected ? t("calendar.selected") : ""]
        .filter(Boolean)
        .join(", ");
      cells.push(
        h(
          "td",
          { role: "gridcell", "aria-selected": selected ? "true" : "false" },
          h(
            "button",
            {
              type: "button",
              class: `pd-day${available ? " is-available" : ""}${selected ? " is-selected" : ""}${date === today ? " is-today" : ""}${d?.fee ? " has-fee" : ""}`,
              "aria-label": label,
              "aria-disabled": available ? null : "true",
              title: reason || fee || null,
              tabindex: date === focusDate ? "0" : "-1",
              "data-fk": `d-${date}`,
              "data-date": date,
              onclick: () => {
                if (available) this.pick(date);
                else {
                  this.st.focusReason = `${this.tx.date(date)}: ${reason}${d?.mayShift ? " " + t("reason.mayShift") : ""}`;
                  this.render();
                }
              },
              onkeydown: (e: KeyboardEvent) => this.calendarKey(e, date, month, today, last),
            },
            this.tx.num(i + 1),
            d?.fee ? h("span", { class: "pd-dot", "aria-hidden": "true" }) : null,
          ),
        ),
      );
      if (cells.length === 7) {
        rows.push(h("tr", null, cells));
        cells = [];
      }
    }
    if (cells.length) {
      while (cells.length < 7) cells.push(h("td", { role: "gridcell" }));
      rows.push(h("tr", null, cells));
    }
    const arrow = (dir: "prev" | "next") => (this.tx.rtl ? (dir === "prev" ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6") : dir === "prev" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6");
    return h(
      "div",
      { class: "pd-cal" },
      h(
        "div",
        { class: "pd-cal-head" },
        h("button", { type: "button", class: "pd-nav", "aria-label": t("calendar.prev"), disabled: prevDisabled, "data-fk": "prev", onclick: () => go(-1) }, svg(arrow("prev"))),
        h("p", { class: "pd-month", "aria-live": "polite" }, this.tx.monthTitle(month)),
        h("button", { type: "button", class: "pd-nav", "aria-label": t("calendar.next"), disabled: nextDisabled, "data-fk": "next", onclick: () => go(1) }, svg(arrow("next"))),
      ),
      h(
        "table",
        { class: "pd-grid", role: "grid", "aria-labelledby": "pd-date-label" },
        h("thead", null, h("tr", null, order.map((wd) => h("th", { scope: "col", abbr: this.tx.weekdayLong(wd) }, h("span", { "aria-hidden": "true" }, this.tx.weekdayNarrow(wd)), h("span", { class: "pd-sr" }, this.tx.weekdayLong(wd)))))),
        h("tbody", null, rows),
      ),
    );
  }

  calendarKey(e: KeyboardEvent, date: string, month: string, today: string, last: string) {
    const rtl = this.tx.rtl;
    const order = weekOrder(this.boot.locale);
    let next: string | null = null;
    switch (e.key) {
      case "ArrowRight":
        next = addDays(date, rtl ? -1 : 1);
        break;
      case "ArrowLeft":
        next = addDays(date, rtl ? 1 : -1);
        break;
      case "ArrowDown":
        next = addDays(date, 7);
        break;
      case "ArrowUp":
        next = addDays(date, -7);
        break;
      case "Home":
        next = addDays(date, -((weekday(date) - order[0] + 7) % 7));
        break;
      case "End":
        next = addDays(date, 6 - ((weekday(date) - order[0] + 7) % 7));
        break;
      case "PageUp":
        next = addMonths(date, -1);
        break;
      case "PageDown":
        next = addMonths(date, 1);
        break;
      default:
        return;
    }
    e.preventDefault();
    if (next < today) next = today;
    if (next > last) next = last;
    if (!next.startsWith(month.slice(0, 8))) this.st.month = firstOfMonth(next);
    this.st.focusReason = null;
    this.render();
    const btn = [...this.mounts].map((m) => m.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)).find(Boolean);
    if (btn) {
      for (const b of btn.closest("table")!.querySelectorAll("button")) b.setAttribute("tabindex", "-1");
      btn.setAttribute("tabindex", "0");
      btn.focus();
    }
  }

  showLeft(left: number): boolean {
    const m = this.cfg.methods.find((x) => x.id === this.st.method);
    const below = resolveRules(this.cfg, this.st.method ?? "shipping", this.st.locationId, this.zoneId())?.capacity.showSpotsLeftBelow ?? m?.capacity.showSpotsLeftBelow ?? null;
    return this.cfg.widget.showSpotsLeft && below !== null && left > 0 && left < below;
  }

  slots(day: DayStatus): Node {
    const name = nextId("slot");
    const visible = day.slots.filter((s) => s.reason !== "past");
    const open = visible.filter((s) => s.available).length;
    const t = this.tx.t;
    return h(
      "fieldset",
      { class: "pd-slots" },
      h("legend", { class: "pd-label" }, t("slot.label")),
      h(
        "div",
        { class: "pd-chips", role: "presentation" },
        visible.map((s) =>
          h(
            "label",
            { class: `pd-chip${s.available ? "" : " is-full"}${this.st.slotId === s.slot.id ? " is-active" : ""}` },
            h("input", {
              type: "radio",
              name,
              value: s.slot.id,
              disabled: !s.available,
              checked: this.st.slotId === s.slot.id,
              "data-fk": `s-${s.slot.id}`,
              onchange: () => {
                this.st.slotId = s.slot.id;
                this.st.error = null;
                this.st.editing = false;
                this.render();
                this.schedulePersist();
              },
            }),
            h("span", null, this.tx.range(s.slot.start, s.slot.end)),
            s.fee ? h("span", { class: "pd-chip-meta" }, this.feeText(s.fee)) : null,
            !s.available ? h("span", { class: "pd-chip-meta" }, t("slot.full")) : s.left !== null && this.showLeft(s.left) ? h("span", { class: "pd-chip-meta" }, t("slot.left", { count: s.left })) : null,
          ),
        ),
      ),
      open > 0 && open <= 2 && visible.length > 2 ? h("p", { class: "pd-busy" }, t("slot.busy", { count: open })) : null,
    );
  }

  /** Date per item: one compact picker per cart line. */
  itemPickers(): Node {
    const now = this.now();
    return h(
      "div",
      { class: "pd-items" },
      this.dated.map((line) => {
        const cal = buildCalendar(this.input({ lines: [line] }), now.date, addDays(now.date, 120));
        const it = this.st.items[line.key] ?? { d: null, s: null };
        const id = nextId("item");
        const day = it.d ? cal.days.find((d) => d.date === it.d) : undefined;
        return h(
          "div",
          { class: "pd-item" },
          h("label", { for: id, class: "pd-label" }, this.tx.t("item.dateFor", { product: line.title })),
          cal.firstAvailable
            ? h(
                "select",
                {
                  id,
                  class: "pd-select",
                  "data-fk": `item-${line.key}`,
                  onchange: (e: Event) => {
                    const v = (e.target as HTMLSelectElement).value || null;
                    this.st.items[line.key] = { d: v, s: null };
                    this.st.error = null;
                    this.render();
                    this.schedulePersist();
                  },
                },
                h("option", { value: "" }, this.tx.t("date.choose")),
                cal.days.filter((d) => d.available).map((d) => h("option", { value: d.date, selected: d.date === it.d }, this.label(d.date, null))),
              )
            : h("p", { class: "pd-error-inline" }, this.tx.t("noDates")),
          day?.slots.length
            ? h(
                "select",
                {
                  class: "pd-select",
                  "aria-label": this.tx.t("slot.label"),
                  "data-fk": `item-slot-${line.key}`,
                  onchange: (e: Event) => {
                    this.st.items[line.key] = { d: it.d, s: (e.target as HTMLSelectElement).value || null };
                    this.render();
                    this.schedulePersist();
                  },
                },
                h("option", { value: "" }, this.tx.t("slot.label")),
                day.slots.filter((s) => s.available).map((s) => h("option", { value: s.slot.id, selected: s.slot.id === it.s }, this.tx.range(s.slot.start, s.slot.end))),
              )
            : null,
        );
      }),
    );
  }

  /* ------------------------------------------------ product page */

  /** Earliest-date message / countdown for a product page. */
  productMessage(product: CartLine): string | null {
    const methods = methodsFor(this.cfg, this.country, [product]);
    const method = this.cfg.defaultMethod && methods.includes(this.cfg.defaultMethod) ? this.cfg.defaultMethod : methods[0];
    if (!method) return null;
    const locs = method === "pickup" ? locationsFor(this.cfg, this.country) : [];
    const locationId = locs[0]?.id ?? null;
    const now = nowInZone(engineTimeZone(this.cfg, method, locationId));
    const base: EngineInput = { config: this.cfg, availability: this.avail, method, locationId, zoneId: null, now, lines: [product] };
    const earliest = firstAvailableDate(base);
    if (!earliest) return null;
    const rules = resolveRules(this.cfg, method, locationId, null)!;
    const cut = cutoffFor(rules.schedule, now.date);
    const m = this.cfg.methods.find((x) => x.id === method)!;
    const kind = method === "pickup" ? "pickup" : method === "shipping" && m.dateMeaning === "dispatch" ? "dispatch" : "delivery";
    if (cut && now.minutes < toMinutes(cut)) {
      const after = firstAvailableDate({ ...base, now: { date: now.date, minutes: toMinutes(cut) } });
      if (after && after > earliest) {
        const mins = toMinutes(cut) - now.minutes;
        const duration = mins >= 60 ? this.tx.t("duration.hm", { hours: Math.floor(mins / 60), minutes: mins % 60 }) : this.tx.t("duration.m", { minutes: mins });
        const when = earliest === now.date ? "today" : earliest === addDays(now.date, 1) ? "tomorrow" : "other";
        return this.tx.t(`product.countdown.${kind}`, { duration, when, date: this.tx.date(earliest) });
      }
    }
    const label = earliest === now.date && m.schedule.todayTomorrowLabels ? this.tx.t("calendar.today") : earliest === addDays(now.date, 1) && m.schedule.todayTomorrowLabels ? this.tx.t("calendar.tomorrow") : this.tx.date(earliest);
    return this.tx.t(`product.earliest.${kind}`, { date: label });
  }
}

function svg(path: string): SVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(ns, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("width", "18");
  s.setAttribute("height", "18");
  s.setAttribute("aria-hidden", "true");
  s.setAttribute("focusable", "false");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", path);
  p.setAttribute("fill", "none");
  p.setAttribute("stroke", "currentColor");
  p.setAttribute("stroke-width", "2");
  p.setAttribute("stroke-linecap", "round");
  p.setAttribute("stroke-linejoin", "round");
  s.appendChild(p);
  return s;
}

export const _internal = { fromMinutes };
