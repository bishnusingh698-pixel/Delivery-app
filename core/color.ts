/** Text colour that stays readable on a merchant-chosen accent colour (WCAG relative luminance). */
export function onAccent(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
  // Contrast against white vs. near-black; pick the stronger.
  const white = 1.05 / (lum + 0.05);
  const dark = (lum + 0.05) / (0.0137 + 0.05);
  return white >= dark ? "#ffffff" : "#111111";
}
