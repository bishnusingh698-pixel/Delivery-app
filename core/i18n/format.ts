/**
 * Tiny ICU-style message formatter.
 *
 * Supports:
 *   {name}                                   simple placeholder
 *   {count, plural, =0 {…} one {…} few {…} many {…} other {…}}   with # = formatted number
 *   {gender, select, a {…} other {…}}
 *
 * Plural categories come from Intl.PluralRules when available; inside
 * Shopify Functions (no Intl) callers pass `plural: () => "other"`.
 * Placeholder values can be wrapped in Unicode isolation marks so that dates
 * and times render correctly inside right-to-left sentences.
 */

export type Values = Record<string, string | number | null | undefined>;

export interface FormatOptions {
  locale?: string;
  /** Wrap substituted values in FSI…PDI (needed for RTL languages). */
  isolate?: boolean;
  plural?: (n: number) => string;
  number?: (n: number) => string;
}

const FSI = "⁨";
const PDI = "⁩";

type Node =
  | { t: "text"; v: string }
  | { t: "arg"; name: string }
  | { t: "plural" | "select"; name: string; options: Record<string, Node[]> };

const cache = new Map<string, Node[]>();

export function parse(msg: string): Node[] {
  const hit = cache.get(msg);
  if (hit) return hit;
  let i = 0;
  function parseNodes(stopAtBrace: boolean): Node[] {
    const nodes: Node[] = [];
    let text = "";
    while (i < msg.length) {
      const ch = msg[i];
      if (ch === "'" && msg[i + 1] === "'") {
        text += "'";
        i += 2;
        continue;
      }
      if (ch === "{") {
        if (text) nodes.push({ t: "text", v: text });
        text = "";
        i++;
        nodes.push(parseArg());
        continue;
      }
      if (ch === "}" && stopAtBrace) break;
      text += ch;
      i++;
    }
    if (text) nodes.push({ t: "text", v: text });
    return nodes;
  }
  function readUntil(chars: string): string {
    let s = "";
    while (i < msg.length && !chars.includes(msg[i])) s += msg[i++];
    return s.trim();
  }
  function parseArg(): Node {
    const name = readUntil(",}");
    if (msg[i] === "}") {
      i++;
      return { t: "arg", name };
    }
    i++; // ,
    const type = readUntil(",}");
    if (msg[i] === "}") {
      i++;
      return { t: "arg", name };
    }
    i++; // ,
    const options: Record<string, Node[]> = {};
    while (i < msg.length) {
      while (msg[i] === " " || msg[i] === "\n") i++;
      if (msg[i] === "}") {
        i++;
        break;
      }
      const key = readUntil("{");
      i++; // {
      options[key] = parseNodes(true);
      i++; // }
    }
    return { t: type === "plural" ? "plural" : "select", name, options };
  }
  const nodes = parseNodes(false);
  cache.set(msg, nodes);
  return nodes;
}

function defaultPlural(locale?: string): (n: number) => string {
  try {
    const pr = new Intl.PluralRules(locale);
    return (n) => pr.select(n);
  } catch {
    return (n) => (n === 1 ? "one" : "other");
  }
}

function defaultNumber(locale?: string): (n: number) => string {
  try {
    const nf = new Intl.NumberFormat(locale);
    return (n) => nf.format(n);
  } catch {
    return (n) => String(n);
  }
}

export function format(msg: string, values: Values = {}, opts: FormatOptions = {}): string {
  const plural = opts.plural ?? defaultPlural(opts.locale);
  const number = opts.number ?? defaultNumber(opts.locale);
  const wrap = (s: string) => (opts.isolate ? FSI + s + PDI : s);
  function render(nodes: Node[], hash: string | null): string {
    let out = "";
    for (const n of nodes) {
      if (n.t === "text") out += hash !== null ? n.v.replace(/#/g, hash) : n.v;
      else if (n.t === "arg") {
        const v = values[n.name];
        out += v === undefined || v === null ? "" : wrap(typeof v === "number" ? number(v) : String(v));
      } else if (n.t === "plural") {
        const num = Number(values[n.name] ?? 0);
        const exact = n.options[`=${num}`];
        const cat = plural(num);
        const branch = exact ?? n.options[cat] ?? n.options.other ?? [];
        out += render(branch, wrap(number(num)));
      } else {
        const v = String(values[n.name] ?? "other");
        out += render(n.options[v] ?? n.options.other ?? [], hash);
      }
    }
    return out;
  }
  return render(parse(msg), null);
}

/** Placeholder names used in a message (for translation checks). */
export function placeholders(msg: string): string[] {
  const names = new Set<string>();
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.t === "arg") names.add(n.name);
      else if (n.t === "plural" || n.t === "select") {
        names.add(n.name);
        Object.values(n.options).forEach(walk);
      }
    }
  };
  walk(parse(msg));
  return [...names].sort();
}

/** Plural option keys used for a given argument (for translation checks). */
export function pluralKeys(msg: string): string[][] {
  const out: string[][] = [];
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.t === "plural") {
        out.push(Object.keys(n.options));
        Object.values(n.options).forEach(walk);
      } else if (n.t === "select") Object.values(n.options).forEach(walk);
    }
  };
  walk(parse(msg));
  return out;
}
