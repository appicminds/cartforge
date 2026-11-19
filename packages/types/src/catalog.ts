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
  /** Default-variant price for simple products (minor units); null if unset or variable. */
  price_minor: number | null;
  currency: string;
  created_at: string;
  updated_at: string;
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
} as const;
