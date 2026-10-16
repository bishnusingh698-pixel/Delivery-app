/** Minimal DOM helpers (no framework, keeps the bundle small). */

type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, unknown> | null;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === "class") el.className = String(v);
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "value" && "value" in el) (el as HTMLInputElement).value = String(v);
      else if (k === "checked" || k === "disabled" || k === "selected") (el as any)[k] = !!v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: Element, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
  }
}

let uid = 0;
export const nextId = (p = "pd") => `${p}-${++uid}`;

/** Re-render while keeping keyboard focus on the element with the same data-fk. */
export function swap(container: Element, next: Node) {
  const active = document.activeElement as HTMLElement | null;
  const fk = active && container.contains(active) ? active.getAttribute("data-fk") : null;
  container.replaceChildren(next);
  if (fk) (container.querySelector(`[data-fk="${CSS.escape(fk)}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
}
