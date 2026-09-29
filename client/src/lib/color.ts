// WCAG 2 relative luminance and contrast, for choosing text that stays readable on a colour the
// user picked (habit colours can come from the API as any hex).

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT = "#ffffff";
const DARK = "#111214";

/** White or near-black, whichever reads better on `background`. */
export function readableTextOn(background: string): string {
  return contrastRatio(background, LIGHT) >= contrastRatio(background, DARK) ? LIGHT : DARK;
}
