import { type ThemeSettingsInput } from "./settings";
import { type TemplateInput } from "./sections";

export interface ThemeManifest {
  key: string;
  name: string;
  /** Semver; templates and settings are versioned with the theme (PRD §11.2). */
  version: string;
  settings: ThemeSettingsInput;
  templates: { home: TemplateInput };
}

/** The one polished default theme for the initial release (PRD §11.1). */
export const DEFAULT_THEME: ThemeManifest = {
  key: "foundry",
  name: "Foundry",
  version: "1.0.0",
  settings: {
    colors: {
      background: "#ffffff",
      surface: "#f6f5f2",
      text: "#1c1b19",
      muted_text: "#5f5c57",
      accent: "#1f3a33",
      accent_text: "#ffffff",
      border: "#e3e0da",
      sale: "#a1271b",
    },
    typography: {
      heading_font: "serif",
      body_font: "sans",
      base_size: 16,
      heading_weight: 600,
      heading_case: "normal",
    },
    layout: { max_width: 1280 },
    buttons: { radius: 6, style: "solid" },
    product_card: {
      image_ratio: "portrait",
      image_fit: "cover",
      show_vendor: true,
      show_sale_badge: true,
    },
    header: { layout: "left", sticky: true, announcement: "" },
    footer: { text: "" },
    spacing: { section: "comfortable" },
  },
  templates: {
    home: {
      sections: [
        {
          id: "hero",
          type: "hero",
          settings: {
            subheading: "Well-made goods for everyday use, chosen with care.",
            button_label: "Shop all products",
            button_link: "/products",
          },
        },
        { id: "featured", type: "featured_collection", settings: { limit: 4 } },
        { id: "categories", type: "category_list", settings: {} },
        { id: "new", type: "new_arrivals", settings: { limit: 8 } },
      ],
    },
  },
};
