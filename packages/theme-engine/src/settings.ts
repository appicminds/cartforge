import { z } from "zod";

/**
 * Global theme settings (PRD §11.1: typography, colors, layout width, buttons,
 * product cards, header, footer, spacing). Every value is constrained to a
 * safe vocabulary — hex colors, enums, bounded numbers, plain text — so settings
 * can be compiled into CSS and markup without ever executing merchant input
 * (PRD §11.2).
 */
const hex = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, "Use a 6-digit hex color like #1a1a1a")
  .transform((v) => v.toLowerCase());

const plainText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => v.replace(/\p{Cc}/gu, " ").trim());

export const FONT_STACKS = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
} as const;
export type FontKey = keyof typeof FONT_STACKS;
const font = z.enum(Object.keys(FONT_STACKS) as [FontKey, ...FontKey[]]);

export const themeSettingsSchema = z.object({
  colors: z.object({
    background: hex,
    surface: hex,
    text: hex,
    muted_text: hex,
    accent: hex,
    accent_text: hex,
    border: hex,
    sale: hex,
  }),
  typography: z.object({
    heading_font: font,
    body_font: font,
    /** Base font size in px. */
    base_size: z.number().int().min(14).max(20),
    heading_weight: z.union([z.literal(500), z.literal(600), z.literal(700)]),
    heading_case: z.enum(["normal", "uppercase"]),
  }),
  layout: z.object({
    /** Max content width in px. */
    max_width: z.number().int().min(960).max(1600),
  }),
  buttons: z.object({
    /** Corner radius in px; 999 = pill. */
    radius: z.number().int().min(0).max(999),
    style: z.enum(["solid", "outline"]),
  }),
  product_card: z.object({
    image_ratio: z.enum(["square", "portrait", "landscape"]),
    image_fit: z.enum(["cover", "contain"]),
    show_vendor: z.boolean(),
    show_sale_badge: z.boolean(),
  }),
  header: z.object({
    layout: z.enum(["left", "center"]),
    sticky: z.boolean(),
    /** Optional announcement bar above the header. */
    announcement: plainText(120),
  }),
  footer: z.object({
    text: plainText(300),
  }),
  spacing: z.object({
    section: z.enum(["compact", "comfortable", "spacious"]),
  }),
});
export type ThemeSettings = z.output<typeof themeSettingsSchema>;
export type ThemeSettingsInput = z.input<typeof themeSettingsSchema>;

/** Deep-partial overrides a merchant saves on top of a theme's defaults. */
export type ThemeSettingsOverrides = {
  [K in keyof ThemeSettingsInput]?: Partial<ThemeSettingsInput[K]>;
};

export function resolveSettings(
  defaults: ThemeSettingsInput,
  overrides: ThemeSettingsOverrides = {},
): ThemeSettings {
  const merged = Object.fromEntries(
    Object.entries(defaults).map(([group, values]) => [
      group,
      { ...values, ...(overrides[group as keyof ThemeSettingsInput] ?? {}) },
    ]),
  );
  return themeSettingsSchema.parse(merged);
}
