/**
 * Fonts merchants can choose. System stacks need no download; the others are
 * Google Fonts, loaded only when a theme uses them. Families with Urdu/Arabic
 * script support are marked so the editor can say so.
 */
export interface FontDef {
  key: string;
  label: string;
  category: "sans" | "serif" | "display" | "mono" | "script" | "urdu";
  /** CSS font-family value (with fallbacks). */
  stack: string;
  /** Google Fonts `family=` value; absent for system fonts. */
  google?: string;
}

const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const SERIF = 'ui-serif, Georgia, Cambria, "Times New Roman", serif';

const g = (
  key: string,
  label: string,
  category: FontDef["category"],
  family: string,
  weights = "400;500;600;700",
): FontDef => ({
  key,
  label,
  category,
  stack: `"${family}", ${category === "serif" || category === "display" ? SERIF : SANS}`,
  google: `${family.replace(/ /g, "+")}:wght@${weights}`,
});

export const FONTS: FontDef[] = [
  { key: "sans", label: "System sans", category: "sans", stack: SANS },
  { key: "serif", label: "System serif", category: "serif", stack: SERIF },
  {
    key: "rounded",
    label: "System rounded",
    category: "sans",
    stack: 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif',
  },
  {
    key: "mono",
    label: "System mono",
    category: "mono",
    stack: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  },
  g("inter", "Inter", "sans", "Inter"),
  g("poppins", "Poppins", "sans", "Poppins"),
  g("montserrat", "Montserrat", "sans", "Montserrat"),
  g("dm-sans", "DM Sans", "sans", "DM Sans"),
  g("manrope", "Manrope", "sans", "Manrope"),
  g("work-sans", "Work Sans", "sans", "Work Sans"),
  g("nunito", "Nunito", "sans", "Nunito"),
  g("lato", "Lato", "sans", "Lato", "400;700"),
  g("open-sans", "Open Sans", "sans", "Open Sans"),
  g("raleway", "Raleway", "sans", "Raleway"),
  g("jost", "Jost", "sans", "Jost"),
  g("outfit", "Outfit", "sans", "Outfit"),
  g("space-grotesk", "Space Grotesk", "sans", "Space Grotesk"),
  g("playfair", "Playfair Display", "serif", "Playfair Display"),
  g("cormorant", "Cormorant Garamond", "serif", "Cormorant Garamond"),
  g("lora", "Lora", "serif", "Lora"),
  g("libre-baskerville", "Libre Baskerville", "serif", "Libre Baskerville", "400;700"),
  g("eb-garamond", "EB Garamond", "serif", "EB Garamond"),
  g("dm-serif", "DM Serif Display", "display", "DM Serif Display", "400"),
  g("marcellus", "Marcellus", "display", "Marcellus", "400"),
  g("cinzel", "Cinzel", "display", "Cinzel"),
  g("bebas", "Bebas Neue", "display", "Bebas Neue", "400"),
  g("abril", "Abril Fatface", "display", "Abril Fatface", "400"),
  g("great-vibes", "Great Vibes (script)", "script", "Great Vibes", "400"),
  g("dancing", "Dancing Script", "script", "Dancing Script"),
  g("noto-nastaliq", "Noto Nastaliq Urdu (اردو)", "urdu", "Noto Nastaliq Urdu"),
  g("noto-naskh", "Noto Naskh Arabic (اردو)", "urdu", "Noto Naskh Arabic"),
  g("gulzar", "Gulzar (اردو)", "urdu", "Gulzar", "400"),
  g("ibm-plex-mono", "IBM Plex Mono", "mono", "IBM Plex Mono", "400;500;600;700"),
];

export const FONT_KEYS = new Set(FONTS.map((f) => f.key));
export const fontByKey = (key: string) => FONTS.find((f) => f.key === key) ?? FONTS[0]!;

/** One Google Fonts stylesheet URL for the fonts in use (null when none need loading). */
export function googleFontsUrl(keys: string[]): string | null {
  const families = [...new Set(keys)]
    .map((k) => FONTS.find((f) => f.key === k)?.google)
    .filter((x): x is string => !!x);
  if (!families.length) return null;
  return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap`;
}
