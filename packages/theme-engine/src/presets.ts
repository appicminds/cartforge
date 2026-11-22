import { defaults } from "./fields";
import { SECTIONS, TEMPLATE_KEYS, type TemplateKey } from "./sections";
import { GLOBAL_FIELDS, type ColorScheme } from "./settings";
import { validateTheme, type SectionInstance, type ThemeData } from "./theme";

/**
 * Ready-made starting points. Each is a complete theme the merchant then
 * changes freely in the editor.
 */
export interface Preset {
  key: string;
  name: string;
  description: string;
  build: () => ThemeData;
}

type BlockSpec = [type: string, settings?: Record<string, unknown>];

/** A section with fixed ids (presets are deterministic). */
function sec(
  type: string,
  id: string,
  settings: Record<string, unknown> = {},
  blocks?: BlockSpec[],
): SectionInstance {
  const def = SECTIONS[type]!;
  const list: BlockSpec[] =
    blocks ?? (def.preset?.blocks ?? []).map((b) => [b.type, b.settings] as BlockSpec);
  return {
    id,
    type,
    settings: { ...defaults(def.settings), ...(def.preset?.settings ?? {}), ...settings },
    blocks: list.map(([bt, bs], i) => {
      const bdef = def.blocks!.find((b) => b.type === bt)!;
      return {
        id: `${bt.replace(/_/g, "-")}-${i + 1}`,
        type: bt,
        settings: { ...defaults(bdef.settings), ...(bs ?? {}) },
      };
    }),
  };
}

function theme(
  settings: Record<string, unknown>,
  color_schemes: ColorScheme[],
  header: SectionInstance[],
  footer: SectionInstance[],
  templates: Partial<Record<TemplateKey, SectionInstance[]>>,
): ThemeData {
  const raw = {
    schema: 2,
    settings: { ...defaults(GLOBAL_FIELDS), ...settings },
    color_schemes,
    groups: { header, footer },
    templates: Object.fromEntries(TEMPLATE_KEYS.map((k) => [k, templates[k] ?? []])),
  };
  // Fills in each template's main section and normalizes everything.
  return validateTheme(raw, false).theme;
}

const standardPages = (scheme = "scheme-1"): Partial<Record<TemplateKey, SectionInstance[]>> => ({
  product: [
    sec("main_product", "main", { color_scheme: scheme }),
    sec("product_recommendations", "related", { color_scheme: scheme }),
  ],
  collection: [sec("main_collection", "main", { color_scheme: scheme })],
  list_collections: [sec("main_list_collections", "main", { color_scheme: scheme })],
  cart: [sec("main_cart", "main", { color_scheme: scheme })],
  search: [sec("main_search", "main", { color_scheme: scheme })],
  page: [sec("main_page", "main", { color_scheme: scheme })],
  not_found: [sec("main_404", "main", { color_scheme: scheme })],
});

export const PRESETS: Preset[] = [
  {
    key: "foundry",
    name: "Foundry",
    description: "Classic and calm: serif headings, soft neutrals, deep green accents.",
    build: () =>
      theme(
        {
          primary_color: "#1f3a33",
          heading_font: "serif",
          body_font: "sans",
          button_radius: 6,
          card_show_vendor: true,
        },
        [
          {
            id: "scheme-1",
            name: "Light",
            background: "#ffffff",
            surface: "#f6f5f2",
            text: "#1c1b19",
            muted: "#5f5c57",
            accent: "#1f3a33",
            accent_text: "#ffffff",
            border: "#e3e0da",
          },
          {
            id: "scheme-2",
            name: "Soft",
            background: "#f6f5f2",
            surface: "#ffffff",
            text: "#1c1b19",
            muted: "#5a5752",
            accent: "#1f3a33",
            accent_text: "#ffffff",
            border: "#e3e0da",
          },
          {
            id: "scheme-3",
            name: "Deep green",
            background: "#1f3a33",
            surface: "#2a4a42",
            text: "#ffffff",
            muted: "#d5e0dc",
            accent: "#ffffff",
            accent_text: "#1f3a33",
            border: "#3c5c54",
          },
        ],
        [sec("announcement_bar", "announcement", {}, []), sec("header", "header")],
        [sec("footer", "footer")],
        {
          home: [
            sec("hero", "hero", {
              subheading: "Well-made goods for everyday use, chosen with care.",
              button_label: "Shop all products",
            }),
            sec("featured_collection", "featured", { limit: 4 }),
            sec("category_list", "categories"),
            sec("new_arrivals", "new", { limit: 8 }),
          ],
          ...standardPages(),
        },
      ),
  },
  {
    key: "bazaar",
    name: "Bazaar",
    description: "Bold fashion look: big slideshow, uppercase headings, blush and gold.",
    build: () =>
      theme(
        {
          primary_color: "#8a1c3b",
          heading_font: "montserrat",
          body_font: "jost",
          heading_weight: "700",
          heading_case: "uppercase",
          button_radius: 0,
          card_image_ratio: "portrait",
          sale_color: "#b3123e",
        },
        [
          {
            id: "scheme-1",
            name: "White",
            background: "#ffffff",
            surface: "#f7f2ef",
            text: "#141414",
            muted: "#595959",
            accent: "#141414",
            accent_text: "#ffffff",
            border: "#e6e0dc",
          },
          {
            id: "scheme-2",
            name: "Blush",
            background: "#f8ece8",
            surface: "#ffffff",
            text: "#2a1418",
            muted: "#6b4d52",
            accent: "#8a1c3b",
            accent_text: "#ffffff",
            border: "#ecd6cf",
          },
          {
            id: "scheme-3",
            name: "Night and gold",
            background: "#141414",
            surface: "#222222",
            text: "#ffffff",
            muted: "#c9c9c9",
            accent: "#d4af37",
            accent_text: "#141414",
            border: "#333333",
          },
        ],
        [
          sec("announcement_bar", "announcement", { color_scheme: "scheme-3" }, [
            ["announcement", { text: "Cash on delivery all over Pakistan" }],
            ["announcement", { text: "New arrivals every Friday", link: "/products?sort=newest" }],
          ]),
          sec("header", "header", { layout: "center" }),
        ],
        [sec("footer", "footer", { color_scheme: "scheme-3" })],
        {
          home: [
            sec("slideshow", "slideshow", { height: "large", color_scheme: "scheme-3" }, [
              [
                "slide",
                {
                  heading: "The festive edit",
                  subheading: "Embroidered lawn, chiffon and silk",
                  button_label: "Shop the edit",
                },
              ],
              [
                "slide",
                {
                  heading: "Ready to wear",
                  subheading: "Stitched and delivered in 3 days",
                  button_label: "Shop now",
                },
              ],
            ]),
            sec("trust_badges", "badges"),
            sec("featured_collection", "featured", { limit: 8, color_scheme: "scheme-1" }),
            sec("collection_list", "collections", {
              image_ratio: "portrait",
              color_scheme: "scheme-2",
            }),
            sec("image_with_text", "story", {}),
            sec("new_arrivals", "new", { limit: 8 }),
            sec("testimonials", "reviews"),
            sec("faq", "faq"),
          ],
          ...standardPages(),
        },
      ),
  },
  {
    key: "minimal",
    name: "Minimal",
    description: "Clean and quiet: one typeface, lots of white space, pill buttons.",
    build: () =>
      theme(
        {
          primary_color: "#111111",
          heading_font: "inter",
          body_font: "inter",
          heading_weight: "500",
          button_radius: 40,
          card_image_ratio: "square",
          card_image_fit: "contain",
          section_spacing: "spacious",
          max_width: 1200,
        },
        [
          {
            id: "scheme-1",
            name: "White",
            background: "#ffffff",
            surface: "#f4f4f4",
            text: "#111111",
            muted: "#5c5c5c",
            accent: "#111111",
            accent_text: "#ffffff",
            border: "#e5e5e5",
          },
          {
            id: "scheme-2",
            name: "Light gray",
            background: "#f4f4f4",
            surface: "#ffffff",
            text: "#111111",
            muted: "#575757",
            accent: "#111111",
            accent_text: "#ffffff",
            border: "#e0e0e0",
          },
          {
            id: "scheme-3",
            name: "Black",
            background: "#111111",
            surface: "#1d1d1d",
            text: "#ffffff",
            muted: "#bdbdbd",
            accent: "#ffffff",
            accent_text: "#111111",
            border: "#2b2b2b",
          },
        ],
        [
          sec("announcement_bar", "announcement", {}, []),
          sec("header", "header", { show_search: true }),
        ],
        [sec("footer", "footer", { color_scheme: "scheme-1" })],
        {
          home: [
            sec("rich_text", "intro", { width: "wide" }, [
              ["heading", { heading: "Less, but better.", size: "large" }],
              ["text", { text: "<p>Everyday essentials, designed to last.</p>" }],
              ["buttons", { label: "Shop all", link: "/products" }],
            ]),
            sec("new_arrivals", "new", { limit: 8 }),
            sec("multicolumn", "values", { color_scheme: "scheme-2", image_ratio: "square" }, [
              [
                "column",
                { title: "Considered materials", text: "<p>Chosen to look good for years.</p>" },
              ],
              [
                "column",
                { title: "Delivered to your door", text: "<p>Nationwide in 3–5 days.</p>" },
              ],
              [
                "column",
                { title: "Easy exchanges", text: "<p>Within 7 days, no questions asked.</p>" },
              ],
            ]),
            sec("featured_collection", "featured", { limit: 4 }),
          ],
          ...standardPages(),
        },
      ),
  },
];

export const presetByKey = (key: string) => PRESETS.find((p) => p.key === key);

/** The theme a store without one renders. */
export const defaultTheme = () => PRESETS[0]!.build();
