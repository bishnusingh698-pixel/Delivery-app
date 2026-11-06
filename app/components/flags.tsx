/**
 * Small flags for the admin language picker (D-82). Inline SVG, not emoji: Windows shows emoji flags
 * as two letters ("DE"). Each language shows the flag its translation is written for (Brazilian
 * Portuguese → Brazil). Decorative only: the language name always sits next to it.
 */
import type { AdminLang } from "../i18n";

const W = 30;
const H = 20;

function Stripes({ colors, vertical }: { colors: string[]; vertical?: boolean }) {
  const n = colors.length;
  return (
    <>
      {colors.map((c, i) =>
        vertical ? <rect key={i} x={(W / n) * i} y={0} width={W / n} height={H} fill={c} /> : <rect key={i} x={0} y={(H / n) * i} width={W} height={H / n} fill={c} />,
      )}
    </>
  );
}

const FLAGS: Record<string, () => JSX.Element> = {
  gb: () => (
    <>
      <rect width={W} height={H} fill="#012169" />
      <path d={`M0,0 L${W},${H} M${W},0 L0,${H}`} stroke="#fff" strokeWidth={4} />
      <path d={`M0,0 L${W},${H} M${W},0 L0,${H}`} stroke="#C8102E" strokeWidth={1.5} />
      <path d={`M${W / 2},0 V${H} M0,${H / 2} H${W}`} stroke="#fff" strokeWidth={6} />
      <path d={`M${W / 2},0 V${H} M0,${H / 2} H${W}`} stroke="#C8102E" strokeWidth={3.5} />
    </>
  ),
  es: () => <Stripes colors={["#AA151B", "#F1BF00", "#F1BF00", "#AA151B"]} />,
  fr: () => <Stripes colors={["#002395", "#FFFFFF", "#ED2939"]} vertical />,
  de: () => <Stripes colors={["#000000", "#DD0000", "#FFCE00"]} />,
  br: () => (
    <>
      <rect width={W} height={H} fill="#009C3B" />
      <path d={`M${W / 2},2 L${W - 3},${H / 2} L${W / 2},${H - 2} L3,${H / 2} Z`} fill="#FFDF00" />
      <circle cx={W / 2} cy={H / 2} r={4.6} fill="#002776" />
    </>
  ),
  it: () => <Stripes colors={["#009246", "#FFFFFF", "#CE2B37"]} vertical />,
  nl: () => <Stripes colors={["#AE1C28", "#FFFFFF", "#21468B"]} />,
  jp: () => (
    <>
      <rect width={W} height={H} fill="#FFFFFF" />
      <circle cx={W / 2} cy={H / 2} r={6} fill="#BC002D" />
    </>
  ),
};

/** The flag shown for each admin language. */
export const FLAG_OF: Record<AdminLang, keyof typeof FLAGS> = { en: "gb", es: "es", fr: "fr", de: "de", pt: "br", it: "it", nl: "nl", ja: "jp" };

export function Flag({ lang }: { lang: AdminLang }) {
  const Draw = FLAGS[FLAG_OF[lang]];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={24} height={16} aria-hidden="true" focusable="false" style={{ borderRadius: 2, boxShadow: "0 0 0 1px rgba(0,0,0,.15)", flex: "none" }}>
      <Draw />
    </svg>
  );
}
