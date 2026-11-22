import type { ColorScheme } from "./settings";

/**
 * Brand colors: the merchant picks one primary color and the theme builds its
 * three main color schemes from it — Light (white with brand buttons), Soft (a
 * light tint of the brand) and Brand (filled with the brand color). Every text
 * pair is pushed until it meets WCAG AA (4.5:1), so any primary stays readable.
 */

type RGB = [number, number, number];

const toRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const toHex = (c: RGB) =>
  `#${c
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

/** `a` mixed with `b`: amount 0 = a, 1 = b. */
export function mix(a: string, b: string, amount: number): string {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex([0, 1, 2].map((i) => x[i]! + (y[i]! - x[i]!) * amount) as RGB);
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Moves `fg` toward black or white (whichever helps) until it reaches `min` on `bg`. */
export function ensureContrast(fg: string, bg: string, min = 4.5): string {
  if (contrast(fg, bg) >= min) return fg;
  const target = luminance(bg) > 0.18 ? "#000000" : "#ffffff";
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = mix(fg, target, t);
    if (contrast(c, bg) >= min) return c;
  }
  return target;
}

/** White or near-black text for a fill color, whichever reads better. */
export const textOn = (bg: string, ink = "#111111") =>
  contrast("#ffffff", bg) >= contrast(ink, bg) ? "#ffffff" : ink;

export const isLight = (hex: string) => luminance(hex) > 0.4;

/** The three main schemes for a primary color. */
export function schemesFromPrimary(primaryRaw: string): ColorScheme[] {
  const primary = /^#[0-9a-f]{6}$/i.test(primaryRaw) ? primaryRaw.toLowerCase() : "#1f3a33";
  // Text is a very dark shade of the brand, so neutrals feel related to it.
  const ink = ensureContrast(mix(primary, "#000000", 0.85), "#ffffff", 12);
  const onPrimary = textOn(primary, ink);

  const lightBg = "#ffffff";
  const lightSurface = mix(primary, "#ffffff", 0.95);
  const light: ColorScheme = {
    id: "scheme-1",
    name: "Light",
    background: lightBg,
    surface: lightSurface,
    text: ink,
    muted: ensureContrast(mix(ink, "#ffffff", 0.4), lightSurface),
    accent: primary,
    accent_text: onPrimary,
    border: mix(primary, "#ffffff", 0.85),
  };

  const softBg = mix(primary, "#ffffff", 0.9);
  const soft: ColorScheme = {
    id: "scheme-2",
    name: "Soft",
    background: softBg,
    surface: "#ffffff",
    text: ensureContrast(ink, softBg, 7),
    muted: ensureContrast(mix(ink, softBg, 0.4), softBg),
    accent: primary,
    accent_text: onPrimary,
    border: mix(primary, "#ffffff", 0.75),
  };

  // Very light brand colors make a poor fill: use a deeper shade for the brand scheme.
  const fill =
    isLight(primary) && contrast(primary, "#ffffff") < 1.6
      ? mix(primary, "#000000", 0.25)
      : primary;
  const onFill = textOn(fill, ink);
  const brand: ColorScheme = {
    id: "scheme-3",
    name: "Brand",
    background: fill,
    surface: mix(fill, onFill, 0.08),
    text: onFill,
    muted: ensureContrast(mix(onFill, fill, 0.25), fill),
    accent: onFill,
    accent_text: fill,
    border: mix(fill, onFill, 0.2),
  };
  return [light, soft, brand];
}

/**
 * Replaces the three main schemes (scheme-1…3) with ones built from the
 * primary color; any extra schemes the merchant added are kept.
 */
export function withBrandSchemes(schemes: ColorScheme[], primary: string): ColorScheme[] {
  const built = schemesFromPrimary(primary);
  const ids = new Set(built.map((s) => s.id));
  return [...built, ...schemes.filter((s) => !ids.has(s.id))];
}
