import { scopeCss } from "./custom-css";
import { fontByKey, googleFontsUrl } from "./fonts";
import { SCHEME_ID } from "./fields";
import type { ColorScheme } from "./settings";
import type { ThemeData } from "./theme";

const RATIOS = { square: "1 / 1", portrait: "4 / 5", landscape: "4 / 3" } as const;
const SECTION_SPACE = { compact: "2.5rem", comfortable: "4rem", spacious: "6rem" } as const;

const schemeVars = (c: ColorScheme) =>
  `--sf-bg:${c.background};--sf-surface:${c.surface};--sf-text:${c.text};--sf-muted:${c.muted};--sf-accent:${c.accent};--sf-accent-text:${c.accent_text};--sf-border:${c.border}`;

/**
 * Compiles a validated theme into CSS custom properties: the first color scheme
 * on :root, each scheme as `.sf-scheme-<id>` (sections add the class), and
 * typography, layout, buttons and cards. Every input is a hex color, an enum or
 * a bounded number, so the result is safe to inline in a <style> tag.
 */
export function themeCss(t: ThemeData): string {
  const s = t.settings as Record<string, string | number | boolean>;
  const first = t.color_schemes[0]!;
  const radius = Number(s.button_radius);
  const vars = [
    schemeVars(first),
    `--sf-sale:${s.sale_color}`,
    `--sf-font-heading:${fontByKey(String(s.heading_font)).stack}`,
    `--sf-font-body:${fontByKey(String(s.body_font)).stack}`,
    `--sf-base-size:${Number(s.base_size)}px`,
    `--sf-heading-weight:${Number(s.heading_weight)}`,
    `--sf-heading-case:${s.heading_case === "uppercase" ? "uppercase" : "none"}`,
    `--sf-max-width:${Number(s.max_width)}px`,
    `--sf-radius:${radius >= 40 ? 999 : radius}px`,
    // Cards and images round gently even when buttons are pills.
    `--sf-card-radius:${Math.min(Math.round(radius / 2), 12)}px`,
    `--sf-card-ratio:${RATIOS[s.card_image_ratio as keyof typeof RATIOS] ?? RATIOS.portrait}`,
    `--sf-card-fit:${s.card_image_fit === "contain" ? "contain" : "cover"}`,
    `--sf-section-space:${SECTION_SPACE[s.section_spacing as keyof typeof SECTION_SPACE] ?? SECTION_SPACE.comfortable}`,
  ].join(";");
  const schemes = t.color_schemes
    .filter((c) => SCHEME_ID.test(c.id))
    .map((c) => `.sf-scheme-${c.id}{${schemeVars(c)};background:var(--sf-bg);color:var(--sf-text)}`)
    .join("");
  const outline =
    s.button_style === "outline"
      ? ".sf-button:not([data-variant]){background:transparent;color:var(--sf-accent)}"
      : "";
  // Theme-wide custom CSS (checked and unscoped); sections add their own when rendered.
  const custom = typeof s.custom_css === "string" ? scopeCss(s.custom_css, null) : "";
  return `:root{${vars}}${schemes}${outline}${custom}`;
}

/** The Google Fonts stylesheet the theme needs (null: system fonts only). */
export const themeFontsUrl = (t: ThemeData) =>
  googleFontsUrl([String(t.settings.heading_font), String(t.settings.body_font)]);

// ───────────── Contrast (WCAG 2.1) ─────────────

function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = ch.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Color pairs in a scheme below WCAG AA for normal text (4.5:1). Empty = OK. */
export function schemeContrastProblems(c: ColorScheme, sale?: string): string[] {
  const pairs: [string, string, string][] = [
    ["Text on background", c.text, c.background],
    ["Secondary text on background", c.muted, c.background],
    ["Text on cards", c.text, c.surface],
    ["Button text on buttons", c.accent_text, c.accent],
  ];
  if (sale) pairs.push(["Sale price on background", sale, c.background]);
  return pairs
    .filter(([, fg, bg]) => contrastRatio(fg, bg) < 4.5)
    .map(([label, fg, bg]) => `${label}: ${contrastRatio(fg, bg).toFixed(2)}:1 (needs 4.5:1)`);
}

/** Contrast problems for every scheme, keyed by scheme id. */
export function contrastProblems(t: ThemeData): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  t.color_schemes.forEach((c, i) => {
    const p = schemeContrastProblems(c, i === 0 ? String(t.settings.sale_color) : undefined);
    if (p.length) out[c.id] = p;
  });
  return out;
}
