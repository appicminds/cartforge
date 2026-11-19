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
  /** Original upload (EXIF-stripped). */
  url: string;
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
  INVENTORY_NOT_TRACKED: "INVENTORY_NOT_TRACKED",
  INVENTORY_NO_CHANGE: "INVENTORY_NO_CHANGE",
} as const;
