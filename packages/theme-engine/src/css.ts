import { FONT_STACKS, type ThemeSettings } from "./settings";

const RATIOS = { square: "1 / 1", portrait: "4 / 5", landscape: "4 / 3" } as const;
const SECTION_SPACE = { compact: "2.5rem", comfortable: "4rem", spacious: "6rem" } as const;

/**
 * Compiles validated settings into CSS custom properties. Inputs are already
 * constrained by the schema (hex colors, enums, integers), so the output can be
 * inlined in a <style> tag safely.
 */
export function themeCssVariables(s: ThemeSettings): Record<string, string> {
  const c = s.colors;
  return {
    "--sf-bg": c.background,
    "--sf-surface": c.surface,
    "--sf-text": c.text,
    "--sf-muted": c.muted_text,
    "--sf-accent": c.accent,
    "--sf-accent-text": c.accent_text,
    "--sf-border": c.border,
    "--sf-sale": c.sale,
    "--sf-font-heading": FONT_STACKS[s.typography.heading_font],
    "--sf-font-body": FONT_STACKS[s.typography.body_font],
    "--sf-base-size": `${s.typography.base_size}px`,
    "--sf-heading-weight": String(s.typography.heading_weight),
    "--sf-heading-case": s.typography.heading_case === "uppercase" ? "uppercase" : "none",
    "--sf-max-width": `${s.layout.max_width}px`,
    "--sf-radius": `${s.buttons.radius}px`,
    "--sf-card-ratio": RATIOS[s.product_card.image_ratio],
    "--sf-card-fit": s.product_card.image_fit,
    "--sf-section-space": SECTION_SPACE[s.spacing.section],
  };
}

export function themeCss(s: ThemeSettings, selector = ":root"): string {
  const body = Object.entries(themeCssVariables(s))
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  return `${selector}{${body}}`;
}

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

/** Color pairs that fall below WCAG AA for normal text (4.5:1). Empty = OK. */
export function contrastProblems(s: ThemeSettings): string[] {
  const c = s.colors;
  const pairs: [string, string, string][] = [
    ["Text on background", c.text, c.background],
    ["Muted text on background", c.muted_text, c.background],
    ["Text on surface", c.text, c.surface],
    ["Muted text on surface", c.muted_text, c.surface],
    ["Button text on accent", c.accent_text, c.accent],
    ["Sale price on background", c.sale, c.background],
  ];
  if (s.buttons.style === "outline") pairs.push(["Outline button", c.accent, c.background]);
  return pairs
    .filter(([, fg, bg]) => contrastRatio(fg, bg) < 4.5)
    .map(([label, fg, bg]) => `${label}: ${contrastRatio(fg, bg).toFixed(2)}:1 (needs 4.5:1)`);
}
