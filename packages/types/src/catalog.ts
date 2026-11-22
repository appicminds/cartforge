import type { FieldError } from "./api.js";

/** Catalog API contracts. Admin-facing shapes — never returned by storefront endpoints. */

export type ProductStatus = "draft" | "active" | "archived";
export type ProductType = "simple" | "variable";

export interface ActorSummary {
  id: string;
  name: string;
}

export interface ProductListItem {
  id: string;
  title: string;
  handle: string;
  status: ProductStatus;
  product_type: ProductType;
  vendor: string | null;
  variant_count: number;
  /** SKU of the default variant for simple products; null otherwise or when unset. */
  sku: string | null;
  /** Primary image thumbnail, or null. */
  thumbnail_url: string | null;
  /** Simple: the price. Variable: the lowest variant price. Null if no prices set. */
  price_minor: number | null;
  /** Variable products: highest variant price (equal to price_minor when uniform). */
  price_max_minor: number | null;
  currency: string;
  /** Sum of available stock over tracked variants; null when nothing is tracked. */
  inventory_available: number | null;
  created_at: string;
  updated_at: string;
}

export interface InventorySnapshot {
  location_id: string;
  on_hand: number;
  reserved: number;
  /** on_hand − reserved (PRD §9.3). */
  available: number;
  low_stock_threshold: number | null;
  /** "in_stock" | "low" | "out" | "untracked" */
  state: StockState;
}

export type StockState = "in_stock" | "low" | "out" | "untracked";

export interface VariantOptionValue {
  option: string;
  value: string;
}

export interface ProductVariantSummary {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  position: number;
  price_minor: number | null;
  compare_at_minor: number | null;
  /** Internal; admin endpoints only. */
  cost_minor: number | null;
  currency: string;
  option_values: VariantOptionValue[];
  inventory_tracking: boolean;
  continue_selling: boolean;
  media_asset_id: string | null;
  inventory: InventorySnapshot;
}

export interface ProductOptionSummary {
  id: string;
  name: string;
  position: number;
  values: { id: string; value: string; position: number }[];
}

/** Result of reconciling options against existing variants (PRD §8.4 F). */
export interface VariantPlan {
  keep: { variant_id: string; from_title: string; title: string }[];
  create: { title: string }[];
  remove: { variant_id: string; title: string; sku: string | null; on_hand: number }[];
  total_after: number;
}

export interface InventoryRow {
  variant_id: string;
  product_id: string;
  product_title: string;
  variant_title: string;
  product_type: ProductType;
  sku: string | null;
  thumbnail_url: string | null;
  inventory_tracking: boolean;
  location_id: string;
  location_name: string;
  on_hand: number;
  reserved: number;
  available: number;
  low_stock_threshold: number | null;
  state: StockState;
  updated_at: string;
}

export interface StockMovementSummary {
  id: string;
  movement_type: string;
  quantity_delta: number;
  quantity_before: number;
  quantity_after: number;
  reason: string | null;
  reference_type: string | null;
  reference_id: string | null;
  actor: ActorSummary | null;
  location_name: string;
  created_at: string;
}

export interface MediaUrls {
  /**
   * Always an image: the original upload (EXIF-stripped), or for a video its cover
   * frame. Safe to put in an <img>.
   */
  url: string;
  media_type: "image" | "video";
  /** The video file; null for images. */
  video_url: string | null;
  /** Videos only. */
  duration_ms: number | null;
  /** The file's type, e.g. "image/jpeg" or "video/mp4". */
  mime_type: string;
  thumb_url: string | null;
  medium_url: string | null;
  large_url: string | null;
}

export interface ProductMediaItem extends MediaUrls {
  media_asset_id: string;
  position: number;
  is_primary: boolean;
  /** Product-specific alt text, falling back to the asset's. */
  alt_text: string | null;
  width: number | null;
  height: number | null;
}

export interface MediaAssetSummary extends MediaUrls {
  id: string;
  original_filename: string | null;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  /** How many places use this asset (products, later pages/themes). */
  reference_count: number;
  created_at: string;
  /** True when an identical file already existed and was reused. */
  deduplicated?: boolean;
}

export interface ProductDetail {
  id: string;
  title: string;
  handle: string;
  description_html: string;
  product_type: ProductType;
  vendor: string | null;
  status: ProductStatus;
  published_at: string | null;
  taxable: boolean;
  /** Store currency; all amounts are minor units of it. */
  currency: string;
  /** Simple products: the default variant's pricing. */
  price_minor: number | null;
  compare_at_minor: number | null;
  cost_minor: number | null;
  media: ProductMediaItem[];
  seo_title: string | null;
  seo_description: string | null;
  categories: { id: string; name: string; handle: string; path: string }[];
  collections: { id: string; title: string; handle: string }[];
  tags: string[];
  options: ProductOptionSummary[];
  variants: ProductVariantSummary[];
  created_at: string;
  updated_at: string;
  created_by: ActorSummary | null;
  updated_by: ActorSummary | null;
}

export const CATALOG_ERROR_CODES = {
  PRODUCT_HANDLE_TAKEN: "PRODUCT_HANDLE_TAKEN",
  HANDLE_CHANGE_REQUIRES_CONFIRMATION: "HANDLE_CHANGE_REQUIRES_CONFIRMATION",
  PRODUCT_NOT_PUBLISHABLE: "PRODUCT_NOT_PUBLISHABLE",
  PRODUCT_TYPE_CHANGE_BLOCKED: "PRODUCT_TYPE_CHANGE_BLOCKED",
  PRICING_REQUIRES_VARIANTS: "PRICING_REQUIRES_VARIANTS",
  MEDIA_NOT_FOUND: "MEDIA_NOT_FOUND",
  MEDIA_IN_USE: "MEDIA_IN_USE",
  MEDIA_INVALID_FILE: "MEDIA_INVALID_FILE",
  MEDIA_TOO_LARGE: "MEDIA_TOO_LARGE",
  SKU_TAKEN: "SKU_TAKEN",
  VARIANT_REMOVAL_REQUIRES_CONFIRMATION: "VARIANT_REMOVAL_REQUIRES_CONFIRMATION",
  VARIANT_NOT_FOUND: "VARIANT_NOT_FOUND",
  CATEGORY_NOT_FOUND: "CATEGORY_NOT_FOUND",
  CATEGORY_HANDLE_TAKEN: "CATEGORY_HANDLE_TAKEN",
  CATEGORY_DEPTH_EXCEEDED: "CATEGORY_DEPTH_EXCEEDED",
  CATEGORY_CYCLE: "CATEGORY_CYCLE",
  CATEGORY_HAS_CHILDREN: "CATEGORY_HAS_CHILDREN",
  CATEGORY_HAS_PRODUCTS: "CATEGORY_HAS_PRODUCTS",
  COLLECTION_NOT_FOUND: "COLLECTION_NOT_FOUND",
  COLLECTION_HANDLE_TAKEN: "COLLECTION_HANDLE_TAKEN",
  INVENTORY_NOT_TRACKED: "INVENTORY_NOT_TRACKED",
  INVENTORY_NO_CHANGE: "INVENTORY_NO_CHANGE",
} as const;

// ───────────── Organization ─────────────

/** A category or collection image (admin). */
export interface CatalogImage extends MediaUrls {
  media_asset_id: string;
  alt: string | null;
  width: number | null;
  height: number | null;
}

export interface CategorySummary {
  id: string;
  parent_id: string | null;
  name: string;
  handle: string;
  description_html: string;
  status: "active" | "archived";
  sort_order: number;
  /** 0 = top level */
  depth: number;
  /** "Apparel › Tops › Tees" */
  path: string;
  product_count: number;
  child_count: number;
  /** The image the merchant chose, or null. */
  image: CatalogImage | null;
  /**
   * Used when no image is chosen: the main photo of the newest active product in this
   * category or its subcategories. null when none of them has a photo.
   */
  auto_image: CatalogImage | null;
  seo_title: string | null;
  seo_description: string | null;
  updated_at: string;
}

export type CollectionStatus = "draft" | "active" | "archived";
export type CollectionSortOrder =
  | "manual"
  | "title_asc"
  | "title_desc"
  | "price_asc"
  | "price_desc"
  | "created_desc"
  | "created_asc";

export interface CollectionSummary {
  id: string;
  title: string;
  handle: string;
  description_html: string;
  status: CollectionStatus;
  sort_order: CollectionSortOrder;
  collection_type: "manual" | "automated";
  product_count: number;
  /** The image the merchant chose, or null. */
  image: CatalogImage | null;
  /** Used when no image is chosen: the main photo of the first active product with one. */
  auto_image: CatalogImage | null;
  seo_title: string | null;
  seo_description: string | null;
  published_handle_locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface CollectionProductItem {
  id: string;
  title: string;
  handle: string;
  status: ProductStatus;
  thumbnail_url: string | null;
  price_minor: number | null;
  position: number;
}

export interface CollectionDetail extends CollectionSummary {
  products: CollectionProductItem[];
}

export interface BulkResult {
  action: string;
  succeeded: string[];
  failed: { id: string; title: string; errors: FieldError[] }[];
}

// ───────────── Storefront (public, no internal fields) ─────────────

export interface StorefrontImage {
  url: string;
  thumb_url: string | null;
  medium_url: string | null;
  large_url: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
  /** Set when this gallery item is a video; the fields above are then its cover frame. */
  video?: { url: string; mime_type: string; duration_ms: number | null } | null;
}

export interface StorefrontVariant {
  id: string;
  title: string;
  options: VariantOptionValue[];
  price_minor: number | null;
  compare_at_minor: number | null;
  /** In stock, untracked, or allowed to oversell. Exact stock counts are never exposed. */
  available: boolean;
  image_index: number | null;
}

export interface StorefrontProduct {
  id: string;
  handle: string;
  title: string;
  description_html: string;
  vendor: string | null;
  /** The shopper's market currency (prices below are in it). */
  currency: string;
  /** false when the product isn't sold in the shopper's market (Markets). */
  market_available?: boolean;
  price_min_minor: number | null;
  price_max_minor: number | null;
  compare_at_min_minor: number | null;
  available: boolean;
  images: StorefrontImage[];
  options: { name: string; values: string[] }[];
  variants: StorefrontVariant[];
  tags: string[];
  /** Active categories the product is in (for breadcrumbs), deepest first. */
  categories: { handle: string; name: string }[];
  seo: { title: string; description: string };
  published_at: string | null;
  /** Content changes since the last publish, for sitemaps and caching. */
  updated_at: string;
}

/** Store identity and presentation settings for the storefront (Next 2). */
export interface StorefrontStore {
  id: string;
  name: string;
  currency: string;
  locale: string;
  contact_email: string | null;
}

export interface StorefrontCategory {
  id: string;
  parent_id: string | null;
  name: string;
  handle: string;
  depth: number;
  /** Active products in this category or any subcategory. */
  product_count: number;
  /** The chosen image, else a product photo from the category; null when neither exists. */
  image: StorefrontImage | null;
}

export interface StorefrontCategoryDetail extends StorefrontCategory {
  description_html: string;
  /** Root → parent, for breadcrumbs. */
  ancestors: { name: string; handle: string }[];
  children: { name: string; handle: string }[];
  seo: { title: string; description: string };
}

export interface StorefrontCollectionSummary {
  id: string;
  handle: string;
  title: string;
  description_html: string;
  product_count: number;
  /** The chosen image, else a product photo from the collection; null when neither exists. */
  image: StorefrontImage | null;
}

export interface StorefrontSitemap {
  products: { handle: string; updated_at: string }[];
  collections: { handle: string; updated_at: string }[];
  categories: { handle: string; updated_at: string }[];
}

/** A previewed product also carries its status, so the storefront can label it. */
export interface StorefrontPreviewProduct extends StorefrontProduct {
  status: ProductStatus;
}

export interface PreviewLink {
  token: string;
  expires_at: string;
  /** Storefront path to open (append to the storefront origin). */
  path: string;
  /** Absolute URL when the API knows the storefront URL. */
  url: string | null;
}
