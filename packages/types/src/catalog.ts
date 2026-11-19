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
  /** Populated from Sprint 2 (media). */
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductVariantSummary {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  position: number;
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
} as const;
