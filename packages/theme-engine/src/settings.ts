import type { Field } from "./fields";

/**
 * Theme-wide settings (PRD §11.1): typography, layout, buttons, product cards,
 * branding and social links, grouped as the editor shows them. Colors live in
 * color schemes (below) that each section picks from.
 */
export interface SettingsGroup {
  key: string;
  name: string;
  settings: Field[];
}

const o = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));

export const GLOBAL_SETTINGS: SettingsGroup[] = [
  {
    key: "colors",
    name: "Colors",
    settings: [
      {
        id: "primary_color",
        type: "color",
        label: "Brand color",
        default: "#1f3a33",
        info: "Buttons, links and highlights use it, and the color schemes are built from it.",
      },
      {
        id: "auto_schemes",
        type: "checkbox",
        label: "Build color schemes from the brand color",
        default: true,
        info: "Turn off to choose every color yourself.",
      },
      { id: "sale_color", type: "color", label: "Sale price and badge", default: "#a1271b" },
    ],
  },
  {
    key: "typography",
    name: "Typography",
    settings: [
      { id: "heading_font", type: "font", label: "Heading font", default: "serif" },
      { id: "body_font", type: "font", label: "Body font", default: "sans" },
      {
        id: "base_size",
        type: "range",
        label: "Body text size",
        min: 14,
        max: 20,
        unit: "px",
        default: 16,
      },
      {
        id: "heading_weight",
        type: "select",
        label: "Heading weight",
        options: o(["500", "Medium"], ["600", "Semi-bold"], ["700", "Bold"]),
        default: "600",
      },
      {
        id: "heading_case",
        type: "select",
        label: "Heading letters",
        options: o(["normal", "As typed"], ["uppercase", "UPPERCASE"]),
        default: "normal",
      },
    ],
  },
  {
    key: "layout",
    name: "Layout",
    settings: [
      {
        id: "max_width",
        type: "range",
        label: "Page width",
        min: 960,
        max: 1600,
        step: 40,
        unit: "px",
        default: 1280,
      },
      {
        id: "section_spacing",
        type: "select",
        label: "Space between sections",
        options: o(
          ["compact", "Compact"],
          ["comfortable", "Comfortable"],
          ["spacious", "Spacious"],
        ),
        default: "comfortable",
      },
    ],
  },
  {
    key: "buttons",
    name: "Buttons",
    settings: [
      {
        id: "button_radius",
        type: "range",
        label: "Corner radius",
        min: 0,
        max: 40,
        unit: "px",
        default: 6,
        info: "40 = pill shape",
      },
      {
        id: "button_style",
        type: "select",
        label: "Style",
        options: o(["solid", "Solid"], ["outline", "Outline"]),
        default: "solid",
      },
    ],
  },
  {
    key: "product_cards",
    name: "Product cards",
    settings: [
      {
        id: "card_image_ratio",
        type: "select",
        label: "Image shape",
        options: o(["square", "Square"], ["portrait", "Portrait"], ["landscape", "Landscape"]),
        default: "portrait",
      },
      {
        id: "card_image_fit",
        type: "select",
        label: "Image fit",
        options: o(["cover", "Fill the frame"], ["contain", "Show the whole image"]),
        default: "cover",
      },
      {
        id: "card_second_image",
        type: "checkbox",
        label: "Show the second image on hover",
        default: true,
      },
      { id: "card_show_vendor", type: "checkbox", label: "Show vendor", default: false },
      { id: "card_sale_badge", type: "checkbox", label: "Show “Sale” badge", default: true },
    ],
  },
  {
    key: "branding",
    name: "Logo and favicon",
    settings: [
      { type: "paragraph", label: "The logo is set in the Header section." },
      {
        id: "favicon",
        type: "image",
        label: "Favicon",
        info: "Square image, at least 64 × 64 px.",
      },
    ],
  },
  {
    key: "custom_css",
    name: "Custom CSS",
    settings: [
      {
        type: "paragraph",
        label: "CSS for the whole store. Each section also has its own Custom CSS box.",
      },
      { id: "custom_css", type: "css", label: "Custom CSS" },
    ],
  },
  {
    key: "social",
    name: "Social media",
    settings: [
      {
        id: "social_instagram",
        type: "link",
        label: "Instagram",
        placeholder: "https://instagram.com/yourstore",
      },
      {
        id: "social_facebook",
        type: "link",
        label: "Facebook",
        placeholder: "https://facebook.com/yourstore",
      },
      {
        id: "social_tiktok",
        type: "link",
        label: "TikTok",
        placeholder: "https://tiktok.com/@yourstore",
      },
      {
        id: "social_youtube",
        type: "link",
        label: "YouTube",
        placeholder: "https://youtube.com/@yourstore",
      },
      {
        id: "social_x",
        type: "link",
        label: "X (Twitter)",
        placeholder: "https://x.com/yourstore",
      },
      {
        id: "social_whatsapp",
        type: "link",
        label: "WhatsApp",
        placeholder: "https://wa.me/923001234567",
      },
    ],
  },
];

export const GLOBAL_FIELDS: Field[] = GLOBAL_SETTINGS.flatMap((g) => g.settings);

/** A named palette; each section chooses one. */
export interface ColorScheme {
  id: string;
  name: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accent_text: string;
  border: string;
}

export const SCHEME_FIELDS: { id: Exclude<keyof ColorScheme, "id" | "name">; label: string }[] = [
  { id: "background", label: "Background" },
  { id: "surface", label: "Cards and panels" },
  { id: "text", label: "Text" },
  { id: "muted", label: "Secondary text" },
  { id: "accent", label: "Buttons and links" },
  { id: "accent_text", label: "Button text" },
  { id: "border", label: "Borders" },
];

export const MAX_SCHEMES = 8;
