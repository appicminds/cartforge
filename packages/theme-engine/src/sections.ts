import type { Field, Option } from "./fields";

/**
 * Registered sections (PRD §11.2): a theme can only contain these. Each lists
 * its settings and the blocks it can hold; the editor builds its forms from
 * this, the API validates against it and the storefront maps each type to a
 * component.
 */

export const TEMPLATE_KEYS = [
  "home",
  "product",
  "collection",
  "list_collections",
  "cart",
  "search",
  "page",
  "not_found",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  home: "Home page",
  product: "Products",
  collection: "Collections and categories",
  list_collections: "Collections list",
  cart: "Cart",
  search: "Search",
  page: "Pages",
  not_found: "404 page",
};

/** Where the editor's preview goes for each template (product and page: the editor picks one). */
export const TEMPLATE_PREVIEW_PATHS: Record<TemplateKey, string> = {
  home: "/",
  product: "/products",
  collection: "/products",
  list_collections: "/collections",
  cart: "/cart",
  search: "/search?q=a",
  page: "/",
  not_found: "/this-page-does-not-exist",
};

export type GroupKey = "header" | "footer";

export interface BlockDef {
  type: string;
  name: string;
  settings: Field[];
  /** At most this many of this block in one section. */
  limit?: number;
}

export interface SectionDef {
  type: string;
  name: string;
  /** Editor grouping in "Add section". */
  category: "banner" | "products" | "text" | "media" | "layout" | "main" | "header" | "footer";
  settings: Field[];
  blocks?: BlockDef[];
  max_blocks?: number;
  /** Where it can be added: a section group, or templates ("*" = every template). */
  enabled_on: { group: GroupKey } | { templates: TemplateKey[] | "*" };
  /** The page's own content: one per template, can't be removed or duplicated. */
  main?: TemplateKey;
  /** At most this many per list (header: 1). */
  limit?: number;
  /** What a newly added section starts with. */
  preset?: {
    settings?: Record<string, unknown>;
    blocks?: { type: string; settings?: Record<string, unknown> }[];
  };
}

const o = (...pairs: [string, string][]): Option[] =>
  pairs.map(([value, label]) => ({ value, label }));

const scheme = (d = "scheme-1"): Field => ({
  id: "color_scheme",
  type: "color_scheme",
  label: "Color scheme",
  default: d,
});
const heading = (d = "", label = "Heading"): Field => ({
  id: "heading",
  type: "text",
  label,
  default: d,
  max: 120,
});
const columns = (d: number, min = 2, max = 5): Field => ({
  id: "columns",
  type: "range",
  label: "Columns on desktop",
  min,
  max,
  default: d,
});
const align: Field = {
  id: "alignment",
  type: "select",
  label: "Text alignment",
  options: o(["left", "Left"], ["center", "Center"], ["right", "Right"]),
  default: "center",
};
const headingSize: Field = {
  id: "size",
  type: "select",
  label: "Size",
  options: o(["small", "Small"], ["medium", "Medium"], ["large", "Large"]),
  default: "medium",
};

const HEADING_BLOCK: BlockDef = {
  type: "heading",
  name: "Heading",
  settings: [heading("Heading"), headingSize],
  limit: 2,
};
const TEXT_BLOCK: BlockDef = {
  type: "text",
  name: "Text",
  settings: [
    {
      id: "text",
      type: "richtext",
      label: "Text",
      default: "<p>Share something about your brand.</p>",
    },
  ],
};
const BUTTONS_BLOCK: BlockDef = {
  type: "buttons",
  name: "Buttons",
  limit: 1,
  settings: [
    { id: "label", type: "text", label: "First button label", default: "Shop now", max: 40 },
    { id: "link", type: "link", label: "First button link", default: "/products" },
    {
      id: "style",
      type: "select",
      label: "First button style",
      options: o(["solid", "Solid"], ["outline", "Outline"]),
      default: "solid",
    },
    { id: "label_2", type: "text", label: "Second button label", default: "", max: 40 },
    { id: "link_2", type: "link", label: "Second button link", default: "" },
  ],
};

export const ICONS = o(
  ["truck", "Delivery truck"],
  ["cash", "Cash"],
  ["card", "Card"],
  ["return", "Return"],
  ["shield", "Shield"],
  ["chat", "Chat"],
  ["phone", "Phone"],
  ["gift", "Gift"],
  ["star", "Star"],
  ["heart", "Heart"],
  ["leaf", "Leaf"],
  ["clock", "Clock"],
  ["check", "Check"],
  ["tag", "Tag"],
  ["sparkle", "Sparkle"],
);

export const SECTION_DEFS: SectionDef[] = [
  // ───────────── Header group ─────────────
  {
    type: "announcement_bar",
    name: "Announcement bar",
    category: "header",
    enabled_on: { group: "header" },
    limit: 1,
    max_blocks: 5,
    settings: [
      scheme("scheme-3"),
      { id: "rotate", type: "checkbox", label: "Rotate announcements", default: true },
    ],
    blocks: [
      {
        type: "announcement",
        name: "Announcement",
        settings: [
          {
            id: "text",
            type: "text",
            label: "Text",
            default: "Free delivery on orders over Rs 3,000",
            max: 120,
          },
          { id: "link", type: "link", label: "Link" },
        ],
      },
    ],
    preset: { blocks: [{ type: "announcement" }] },
  },
  {
    type: "header",
    name: "Header",
    category: "header",
    enabled_on: { group: "header" },
    limit: 1,
    settings: [
      {
        id: "logo",
        type: "image",
        label: "Logo image",
        info: "Leave empty to show the store name.",
      },
      {
        id: "logo_width",
        type: "range",
        label: "Logo width",
        min: 60,
        max: 260,
        step: 10,
        unit: "px",
        default: 140,
      },
      { id: "menu", type: "menu", label: "Menu", default: "main-menu" },
      {
        id: "layout",
        type: "select",
        label: "Desktop layout",
        options: o(["left", "Logo left, menu next to it"], ["center", "Logo in the middle"]),
        default: "left",
      },
      { id: "sticky", type: "checkbox", label: "Stick to the top when scrolling", default: true },
      { id: "show_search", type: "checkbox", label: "Show search", default: true },
      scheme(),
    ],
  },
  // ───────────── Footer group ─────────────
  {
    type: "footer",
    name: "Footer",
    category: "footer",
    enabled_on: { group: "footer" },
    limit: 1,
    max_blocks: 6,
    settings: [
      scheme("scheme-2"),
      { id: "show_social", type: "checkbox", label: "Show social media icons", default: true },
      {
        id: "show_market_selector",
        type: "checkbox",
        label: "Show country / currency selector",
        default: true,
      },
      {
        id: "copyright",
        type: "text",
        label: "Copyright text",
        default: "",
        max: 200,
        info: "Empty: © year and store name.",
      },
      {
        id: "show_powered_by",
        type: "checkbox",
        label: "Show “Powered by CartForge”",
        default: true,
      },
    ],
    blocks: [
      {
        type: "brand",
        name: "Store information",
        limit: 1,
        settings: [
          { id: "text", type: "richtext", label: "Text", default: "" },
          { id: "show_email", type: "checkbox", label: "Show contact email", default: true },
        ],
      },
      {
        type: "menu",
        name: "Menu",
        settings: [
          heading("Quick links"),
          { id: "menu", type: "menu", label: "Menu", default: "footer" },
        ],
      },
      {
        type: "text",
        name: "Text",
        settings: [
          heading("About us"),
          { id: "text", type: "richtext", label: "Text", default: "" },
        ],
      },
    ],
    preset: {
      blocks: [
        { type: "brand" },
        { type: "menu", settings: { heading: "Shop", menu: "main-menu" } },
        { type: "menu", settings: { heading: "Help", menu: "footer" } },
      ],
    },
  },

  // ───────────── Banners ─────────────
  {
    type: "image_banner",
    name: "Image banner",
    category: "banner",
    enabled_on: { templates: "*" },
    max_blocks: 3,
    settings: [
      { id: "image", type: "image", label: "Image" },
      { id: "mobile_image", type: "image", label: "Mobile image", info: "Optional, for phones." },
      {
        id: "height",
        type: "select",
        label: "Height",
        options: o(
          ["small", "Small"],
          ["medium", "Medium"],
          ["large", "Large"],
          ["adapt", "Fit the image"],
        ),
        default: "medium",
      },
      {
        id: "overlay",
        type: "range",
        label: "Image overlay",
        min: 0,
        max: 90,
        step: 10,
        unit: "%",
        default: 30,
      },
      {
        id: "position",
        type: "select",
        label: "Content position",
        options: o(
          ["top-left", "Top left"],
          ["center-left", "Middle left"],
          ["bottom-left", "Bottom left"],
          ["center", "Middle"],
          ["bottom-center", "Bottom middle"],
          ["center-right", "Middle right"],
        ),
        default: "center",
      },
      align,
      { id: "text_light", type: "checkbox", label: "White text on the image", default: true },
      scheme(),
    ],
    blocks: [HEADING_BLOCK, TEXT_BLOCK, BUTTONS_BLOCK],
    preset: {
      blocks: [
        { type: "heading", settings: { heading: "Image banner", size: "large" } },
        { type: "text", settings: { text: "<p>Tell customers about your new collection.</p>" } },
        { type: "buttons" },
      ],
    },
  },
  {
    type: "slideshow",
    name: "Slideshow",
    category: "banner",
    enabled_on: { templates: "*" },
    max_blocks: 6,
    settings: [
      {
        id: "height",
        type: "select",
        label: "Height",
        options: o(["small", "Small"], ["medium", "Medium"], ["large", "Large"]),
        default: "medium",
      },
      { id: "autoplay", type: "checkbox", label: "Change slides automatically", default: true },
      { id: "speed", type: "range", label: "Change every", min: 3, max: 10, unit: "s", default: 5 },
      {
        id: "overlay",
        type: "range",
        label: "Image overlay",
        min: 0,
        max: 90,
        step: 10,
        unit: "%",
        default: 30,
      },
      scheme(),
    ],
    blocks: [
      {
        type: "slide",
        name: "Slide",
        settings: [
          { id: "image", type: "image", label: "Image" },
          heading("Slide heading"),
          { id: "subheading", type: "textarea", label: "Subheading", default: "", max: 240 },
          { id: "button_label", type: "text", label: "Button label", default: "Shop now", max: 40 },
          { id: "button_link", type: "link", label: "Button link", default: "/products" },
          align,
        ],
      },
    ],
    preset: {
      blocks: [
        { type: "slide", settings: { heading: "New season" } },
        { type: "slide", settings: { heading: "Best sellers" } },
      ],
    },
  },
  {
    type: "hero",
    name: "Text banner",
    category: "banner",
    enabled_on: { templates: "*" },
    settings: [
      heading("", "Heading (empty: store name)"),
      { id: "subheading", type: "textarea", label: "Subheading", default: "", max: 240 },
      { id: "button_label", type: "text", label: "Button label", default: "Shop all", max: 40 },
      { id: "button_link", type: "link", label: "Button link", default: "/products" },
      {
        id: "alignment",
        type: "select",
        label: "Text alignment",
        options: o(["left", "Left"], ["center", "Center"]),
        default: "left",
      },
      scheme("scheme-2"),
    ],
  },

  // ───────────── Products and collections ─────────────
  {
    type: "featured_collection",
    name: "Featured collection",
    category: "products",
    enabled_on: { templates: "*" },
    settings: [
      heading("", "Heading (empty: collection title)"),
      {
        id: "collection",
        type: "collection",
        label: "Collection",
        info: "Empty: your first collection with products.",
      },
      { id: "limit", type: "range", label: "Products to show", min: 2, max: 12, default: 4 },
      columns(4),
      { id: "show_view_all", type: "checkbox", label: "Show “View all”", default: true },
      scheme(),
    ],
  },
  {
    type: "featured_products",
    name: "Featured products",
    category: "products",
    enabled_on: { templates: "*" },
    settings: [
      heading("Featured products"),
      { id: "products", type: "products", label: "Products", max: 12 },
      columns(4),
      scheme(),
    ],
  },
  {
    type: "new_arrivals",
    name: "New arrivals",
    category: "products",
    enabled_on: { templates: "*" },
    settings: [
      heading("New arrivals"),
      { id: "limit", type: "range", label: "Products to show", min: 2, max: 12, default: 8 },
      columns(4),
      scheme(),
    ],
  },
  {
    type: "collection_list",
    name: "Collection list",
    category: "products",
    enabled_on: { templates: "*" },
    settings: [
      heading("Shop by collection"),
      {
        id: "collections",
        type: "collections",
        label: "Collections",
        max: 12,
        info: "Empty: collections with products.",
      },
      columns(3),
      {
        id: "image_ratio",
        type: "select",
        label: "Image shape",
        options: o(["square", "Square"], ["portrait", "Portrait"], ["landscape", "Landscape"]),
        default: "landscape",
      },
      scheme(),
    ],
  },
  {
    type: "category_list",
    name: "Category list",
    category: "products",
    enabled_on: { templates: "*" },
    settings: [
      heading("Shop by category"),
      { id: "limit", type: "range", label: "Categories to show", min: 2, max: 12, default: 6 },
      columns(3),
      scheme(),
    ],
  },
  {
    type: "product_recommendations",
    name: "Related products",
    category: "products",
    enabled_on: { templates: ["product"] },
    settings: [
      heading("You may also like"),
      { id: "limit", type: "range", label: "Products to show", min: 2, max: 8, default: 4 },
      columns(4),
      scheme(),
    ],
  },

  // ───────────── Text ─────────────
  {
    type: "rich_text",
    name: "Rich text",
    category: "text",
    enabled_on: { templates: "*" },
    max_blocks: 6,
    settings: [
      align,
      {
        id: "width",
        type: "select",
        label: "Width",
        options: o(["narrow", "Narrow"], ["wide", "Wide"]),
        default: "narrow",
      },
      scheme(),
    ],
    blocks: [HEADING_BLOCK, TEXT_BLOCK, BUTTONS_BLOCK],
    preset: {
      blocks: [
        { type: "heading", settings: { heading: "Talk about your brand" } },
        { type: "text" },
      ],
    },
  },
  {
    type: "image_with_text",
    name: "Image with text",
    category: "text",
    enabled_on: { templates: "*" },
    max_blocks: 4,
    settings: [
      { id: "image", type: "image", label: "Image" },
      {
        id: "image_position",
        type: "select",
        label: "Image position on desktop",
        options: o(["left", "Image first"], ["right", "Image second"]),
        default: "left",
      },
      {
        id: "alignment",
        type: "select",
        label: "Text alignment",
        options: o(["left", "Left"], ["center", "Center"]),
        default: "left",
      },
      scheme(),
    ],
    blocks: [HEADING_BLOCK, TEXT_BLOCK, BUTTONS_BLOCK],
    preset: {
      blocks: [
        { type: "heading", settings: { heading: "Image with text" } },
        { type: "text", settings: { text: "<p>Pair text with an image to tell your story.</p>" } },
        { type: "buttons", settings: { label: "Learn more", link: "/pages/about" } },
      ],
    },
  },
  {
    type: "multicolumn",
    name: "Multicolumn",
    category: "text",
    enabled_on: { templates: "*" },
    max_blocks: 8,
    settings: [
      heading(""),
      columns(3, 1, 4),
      {
        id: "image_ratio",
        type: "select",
        label: "Image shape",
        options: o(
          ["square", "Square"],
          ["portrait", "Portrait"],
          ["landscape", "Landscape"],
          ["circle", "Circle"],
        ),
        default: "landscape",
      },
      align,
      scheme(),
    ],
    blocks: [
      {
        type: "column",
        name: "Column",
        settings: [
          { id: "image", type: "image", label: "Image" },
          { id: "title", type: "text", label: "Title", default: "Column", max: 80 },
          {
            id: "text",
            type: "richtext",
            label: "Text",
            default: "<p>Pair text with an image.</p>",
          },
          { id: "link_label", type: "text", label: "Link label", default: "", max: 40 },
          { id: "link", type: "link", label: "Link" },
        ],
      },
    ],
    preset: { blocks: [{ type: "column" }, { type: "column" }, { type: "column" }] },
  },
  {
    type: "trust_badges",
    name: "Icons with text",
    category: "text",
    enabled_on: { templates: "*" },
    max_blocks: 6,
    settings: [
      {
        id: "layout",
        type: "select",
        label: "Layout",
        options: o(["row", "In a row"], ["grid", "Grid"]),
        default: "row",
      },
      scheme("scheme-2"),
    ],
    blocks: [
      {
        type: "item",
        name: "Item",
        settings: [
          { id: "icon", type: "select", label: "Icon", options: ICONS, default: "truck" },
          { id: "title", type: "text", label: "Title", default: "Fast delivery", max: 60 },
          { id: "text", type: "text", label: "Text", default: "", max: 160 },
        ],
      },
    ],
    preset: {
      blocks: [
        {
          type: "item",
          settings: {
            icon: "cash",
            title: "Cash on delivery",
            text: "Pay when your order arrives",
          },
        },
        {
          type: "item",
          settings: { icon: "truck", title: "Nationwide delivery", text: "Delivered in 3–5 days" },
        },
        {
          type: "item",
          settings: { icon: "return", title: "Easy returns", text: "7-day exchange" },
        },
      ],
    },
  },
  {
    type: "testimonials",
    name: "Testimonials",
    category: "text",
    enabled_on: { templates: "*" },
    max_blocks: 9,
    settings: [heading("What our customers say"), columns(3, 1, 3), scheme("scheme-2")],
    blocks: [
      {
        type: "quote",
        name: "Testimonial",
        settings: [
          {
            id: "quote",
            type: "textarea",
            label: "Quote",
            default: "Beautiful quality and quick delivery.",
            max: 500,
          },
          { id: "author", type: "text", label: "Name", default: "Ayesha K.", max: 80 },
          { id: "detail", type: "text", label: "Detail", default: "Lahore", max: 80 },
          { id: "rating", type: "range", label: "Stars (0 = none)", min: 0, max: 5, default: 5 },
        ],
      },
    ],
    preset: {
      blocks: [
        { type: "quote" },
        { type: "quote", settings: { author: "Sana R.", detail: "Karachi" } },
        { type: "quote", settings: { author: "Hira M.", detail: "Islamabad" } },
      ],
    },
  },
  {
    type: "faq",
    name: "Collapsible content",
    category: "text",
    enabled_on: { templates: "*" },
    max_blocks: 20,
    settings: [
      heading("Frequently asked questions"),
      { id: "open_first", type: "checkbox", label: "Open the first row", default: false },
      scheme(),
    ],
    blocks: [
      {
        type: "row",
        name: "Row",
        settings: [
          { id: "question", type: "text", label: "Heading", default: "Question", max: 200 },
          { id: "answer", type: "richtext", label: "Content", default: "<p>Answer.</p>" },
        ],
      },
    ],
    preset: {
      blocks: [
        {
          type: "row",
          settings: {
            question: "How long does delivery take?",
            answer: "<p>Orders arrive in 3–5 working days across Pakistan.</p>",
          },
        },
        {
          type: "row",
          settings: {
            question: "Can I pay cash on delivery?",
            answer: "<p>Yes, pay when your parcel arrives.</p>",
          },
        },
        {
          type: "row",
          settings: {
            question: "What is your exchange policy?",
            answer: "<p>Exchange unworn items within 7 days.</p>",
          },
        },
      ],
    },
  },

  // ───────────── Media and layout ─────────────
  {
    type: "video",
    name: "Video",
    category: "media",
    enabled_on: { templates: "*" },
    settings: [
      heading(""),
      { id: "video", type: "video", label: "YouTube or Vimeo link" },
      { id: "full_width", type: "checkbox", label: "Full page width", default: false },
      scheme(),
    ],
  },
  {
    type: "spacer",
    name: "Spacer",
    category: "layout",
    enabled_on: { templates: "*" },
    settings: [
      {
        id: "height",
        type: "range",
        label: "Height",
        min: 8,
        max: 160,
        step: 8,
        unit: "px",
        default: 48,
      },
      { id: "divider", type: "checkbox", label: "Show a line", default: false },
      scheme(),
    ],
  },

  // ───────────── Main sections (one per template) ─────────────
  {
    type: "main_product",
    name: "Product information",
    category: "main",
    main: "product",
    enabled_on: { templates: ["product"] },
    max_blocks: 16,
    settings: [
      {
        id: "gallery_position",
        type: "select",
        label: "Images on desktop",
        options: o(["left", "Left"], ["right", "Right"]),
        default: "left",
      },
      {
        id: "sticky_info",
        type: "checkbox",
        label: "Keep product info in view while scrolling",
        default: true,
      },
      scheme(),
    ],
    blocks: [
      { type: "vendor", name: "Vendor", limit: 1, settings: [] },
      { type: "title", name: "Title", limit: 1, settings: [] },
      { type: "price", name: "Price", limit: 1, settings: [] },
      {
        type: "variant_picker",
        name: "Variant picker",
        limit: 1,
        settings: [
          {
            id: "style",
            type: "select",
            label: "Style",
            options: o(["buttons", "Buttons"], ["dropdown", "Dropdown"]),
            default: "buttons",
          },
        ],
      },
      { type: "buy_buttons", name: "Quantity and buy button", limit: 1, settings: [] },
      { type: "description", name: "Description", limit: 1, settings: [] },
      {
        type: "text",
        name: "Text",
        settings: [{ id: "text", type: "richtext", label: "Text", default: "<p>Text block</p>" }],
      },
      {
        type: "collapsible",
        name: "Collapsible tab",
        settings: [
          {
            id: "heading",
            type: "text",
            label: "Heading",
            default: "Shipping and returns",
            max: 120,
          },
          {
            id: "icon",
            type: "select",
            label: "Icon",
            options: [{ value: "none", label: "None" }, ...ICONS],
            default: "none",
          },
          {
            id: "content",
            type: "richtext",
            label: "Content",
            default: "<p>Delivered in 3–5 working days.</p>",
          },
        ],
      },
      {
        type: "icon_text",
        name: "Icon with text",
        settings: [
          { id: "icon", type: "select", label: "Icon", options: ICONS, default: "truck" },
          {
            id: "text",
            type: "text",
            label: "Text",
            default: "Free delivery over Rs 3,000",
            max: 120,
          },
        ],
      },
      { type: "share", name: "Share", limit: 1, settings: [] },
    ],
    preset: {
      blocks: [
        { type: "vendor" },
        { type: "title" },
        { type: "price" },
        { type: "variant_picker" },
        { type: "buy_buttons" },
        { type: "description" },
      ],
    },
  },
  {
    type: "main_collection",
    name: "Product grid",
    category: "main",
    main: "collection",
    enabled_on: { templates: ["collection"] },
    settings: [
      { id: "show_description", type: "checkbox", label: "Show the description", default: true },
      { id: "show_sort", type: "checkbox", label: "Show sorting", default: true },
      {
        id: "per_page",
        type: "range",
        label: "Products per page",
        min: 8,
        max: 48,
        step: 4,
        default: 24,
      },
      columns(4, 2, 5),
      scheme(),
    ],
  },
  {
    type: "main_list_collections",
    name: "Collections list page",
    category: "main",
    main: "list_collections",
    enabled_on: { templates: ["list_collections"] },
    settings: [heading("Collections"), columns(3), scheme()],
  },
  {
    type: "main_cart",
    name: "Cart items",
    category: "main",
    main: "cart",
    enabled_on: { templates: ["cart"] },
    settings: [heading("Your cart"), scheme()],
  },
  {
    type: "main_search",
    name: "Search results",
    category: "main",
    main: "search",
    enabled_on: { templates: ["search"] },
    settings: [columns(4, 2, 5), scheme()],
  },
  {
    type: "main_page",
    name: "Page content",
    category: "main",
    main: "page",
    enabled_on: { templates: ["page"] },
    settings: [
      {
        id: "width",
        type: "select",
        label: "Width",
        options: o(["narrow", "Narrow"], ["wide", "Wide"]),
        default: "narrow",
      },
      scheme(),
    ],
  },
  {
    type: "main_404",
    name: "Page not found",
    category: "main",
    main: "not_found",
    enabled_on: { templates: ["not_found"] },
    settings: [
      heading("Page not found"),
      {
        id: "text",
        type: "textarea",
        label: "Text",
        default: "The page you’re looking for doesn’t exist or is no longer available.",
        max: 300,
      },
      scheme(),
    ],
  },
];

export const SECTIONS: Record<string, SectionDef> = Object.fromEntries(
  SECTION_DEFS.map((d) => [d.type, d]),
);

/** The main section type of each template. */
export const MAIN_SECTION: Partial<Record<TemplateKey, string>> = Object.fromEntries(
  SECTION_DEFS.filter((d) => d.main).map((d) => [d.main!, d.type]),
);

export function canAddTo(
  def: SectionDef,
  where: { group: GroupKey } | { template: TemplateKey },
): boolean {
  if (def.main) return false;
  if ("group" in where) return "group" in def.enabled_on && def.enabled_on.group === where.group;
  if (!("templates" in def.enabled_on)) return false;
  return def.enabled_on.templates === "*" || def.enabled_on.templates.includes(where.template);
}
