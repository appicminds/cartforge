/** Store builder (Next 3): themes, menus and content pages. */

export const ONLINE_STORE_ERROR_CODES = {
  THEME_NOT_FOUND: "THEME_NOT_FOUND",
  THEME_LIVE: "THEME_LIVE",
  THEME_LIMIT: "THEME_LIMIT",
  MENU_NOT_FOUND: "MENU_NOT_FOUND",
  PAGE_NOT_FOUND: "PAGE_NOT_FOUND",
  BLOG_NOT_FOUND: "BLOG_NOT_FOUND",
  ARTICLE_NOT_FOUND: "ARTICLE_NOT_FOUND",
} as const;

export const MAX_THEMES = 6;

export interface ThemeSummary {
  id: string;
  name: string;
  preset: string;
  role: "live" | "unpublished";
  updated_at: string;
  published_at: string | null;
  /** Saved in the editor but not published yet (live theme). */
  has_unpublished_changes: boolean;
}

export interface ThemeImage {
  url: string;
  medium_url: string | null;
  large_url: string | null;
  width: number | null;
  height: number | null;
  alt: string | null;
}

export interface ThemeDetail extends ThemeSummary {
  /** ThemeData from @cartforge/theme-engine. */
  data: unknown;
  /** Images the theme uses, by media id (for the editor's thumbnails). */
  images: Record<string, ThemeImage>;
}

export interface ThemeSaveResult {
  updated_at: string;
  /** Color pairs below WCAG AA, by color scheme id. */
  contrast: Record<string, string[]>;
}

export interface ThemeVersionSummary {
  id: string;
  created_at: string;
  created_by: string | null;
}

export interface ThemePresetSummary {
  key: string;
  name: string;
  description: string;
}

export interface ThemePreviewLink {
  token: string;
  expires_at: string;
}

// ───────────── Menus ─────────────

export type MenuLinkType =
  | "home"
  | "products"
  | "collections"
  | "search"
  | "collection"
  | "category"
  | "product"
  | "page"
  | "blog"
  | "url";

export interface MenuLink {
  type: MenuLinkType;
  /** collection / category / product / page / blog id. */
  id?: string;
  /** type "url": a path on the store or an https link. */
  url?: string;
}

export interface MenuItem {
  id: string;
  title: string;
  link: MenuLink;
  children: MenuItem[];
}

export interface MenuView {
  id: string;
  handle: string;
  title: string;
  items: MenuItem[];
  updated_at: string;
}

// ───────────── Pages ─────────────

export interface PageView {
  id: string;
  title: string;
  handle: string;
  body_html: string;
  seo_title: string | null;
  seo_description: string | null;
  published: boolean;
  updated_at: string;
}

// ───────────── Storefront ─────────────

export interface StorefrontMenuItem {
  title: string;
  url: string;
  children: StorefrontMenuItem[];
}

export interface StorefrontThemePayload {
  theme_id: string | null;
  /** Rendering an unpublished draft (theme editor / preview link). */
  preview: boolean;
  data: unknown;
  images: Record<string, ThemeImage>;
  menus: Record<string, StorefrontMenuItem[]>;
}

export interface StorefrontPage {
  title: string;
  handle: string;
  body_html: string;
  seo: { title: string; description: string };
  updated_at: string;
  template_suffix?: string | null;
}

// ───────────── Alternate templates ─────────────

export type TemplateTargetKind = "product" | "collection" | "page";

/** Alternate template names in the live theme (draft and published), per kind. */
export type ThemeTemplateNames = Record<TemplateTargetKind, string[]>;

export interface TemplateAssignment {
  template: string | null;
  /** Names that can be chosen. */
  available: string[];
}

// ───────────── Blog ─────────────

export interface BlogView {
  id: string;
  handle: string;
  title: string;
  article_count: number;
}

export interface ArticleImage {
  media_asset_id: string;
  url: string;
  medium_url: string | null;
  large_url: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
}

export interface ArticleView {
  id: string;
  blog_id: string;
  blog_title: string;
  blog_handle: string;
  title: string;
  handle: string;
  body_html: string;
  excerpt: string;
  image: ArticleImage | null;
  author: string | null;
  tags: string[];
  published: boolean;
  published_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
  updated_at: string;
}

export interface StorefrontArticleSummary {
  title: string;
  handle: string;
  blog_handle: string;
  excerpt: string;
  image: ArticleImage | null;
  author: string | null;
  tags: string[];
  published_at: string | null;
}

export interface StorefrontBlog {
  handle: string;
  title: string;
  articles: StorefrontArticleSummary[];
  meta: { page: number; page_size: number; total: number; total_pages: number };
  /** Tags used in the blog, for filtering. */
  tags: string[];
}

export interface StorefrontArticle extends StorefrontArticleSummary {
  body_html: string;
  blog_title: string;
  seo: { title: string; description: string };
  updated_at: string;
}

// ───────────── Saved sections ─────────────

export const MAX_SAVED_SECTIONS = 50;

export interface SavedSectionSummary {
  id: string;
  name: string;
  /** Section type (custom_section, image_banner…). */
  type: string;
  created_at: string;
}

export interface SavedSectionDetail extends SavedSectionSummary {
  /** The section (theme-engine SectionInstance). */
  section: unknown;
}
