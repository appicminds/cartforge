/** Sales: bulk price changes written to the products, with the old prices kept to put back. */

export const SALE_ERROR_CODES = {
  SALE_NOT_FOUND: "SALE_NOT_FOUND",
  SALE_NOT_EDITABLE: "SALE_NOT_EDITABLE",
  SALE_NO_PRODUCTS: "SALE_NO_PRODUCTS",
} as const;

export type SaleStatus = "scheduled" | "running" | "ended" | "canceled";
export type SaleExistingMode = "skip" | "original" | "current";
export type SaleRoundingRule = "none" | "whole" | "x9" | "ten" | "hundred";
export type SaleSkipReason =
  | "no_price"
  | "already_discounted"
  | "not_lower"
  | "below_zero"
  | "in_other_sale";

export interface SaleTarget {
  all: boolean;
  product_ids: string[];
  collection_ids: string[];
}

export interface SaleView {
  id: string;
  title: string;
  value_type: "percent" | "fixed";
  /** percent: basis points (2000 = 20%); fixed: store-currency minor units. */
  value: number;
  target: SaleTarget;
  existing: SaleExistingMode;
  rounding: SaleRoundingRule;
  starts_at: string;
  ends_at: string | null;
  status: SaleStatus;
  started_at: string | null;
  ended_at: string | null;
  /** "20% off all products". */
  summary: string;
  /** Products / variants on sale now (running) or that were (ended). */
  product_count: number;
  variant_count: number;
  /** After ending: variants put back, and those kept because they were edited during the sale. */
  restored_count: number;
  kept_count: number;
  created_at: string;
}

export interface SalePreviewRow {
  product_id: string;
  product_title: string;
  variant_title: string;
  price_minor: number | null;
  compare_at_minor: number | null;
  sale_price_minor: number | null;
  sale_compare_minor: number | null;
  skip: SaleSkipReason | null;
}

export interface SalePreview {
  currency: string;
  /** Variants matching the products chosen. */
  matched: number;
  /** Variants / products whose price will change. */
  changing: number;
  changing_products: number;
  /** Matching variants that already have a sale price (compare-at above price). */
  already_discounted: number;
  skipped: { reason: SaleSkipReason; count: number }[];
  /** Up to 12 examples: changes first. */
  samples: SalePreviewRow[];
}

export interface SaleItemView {
  product_id: string;
  product_title: string;
  variant_title: string;
  old_price_minor: number;
  old_compare_minor: number | null;
  sale_price_minor: number;
  /** The variant's price now (differs from the sale price when edited during the sale). */
  current_price_minor: number | null;
  status: "active" | "restored" | "kept" | "removed";
}

export interface SaleDetail extends SaleView {
  currency: string;
  items: SaleItemView[];
}

/** What ending a sale (or taking products out of it) did. */
export interface SaleEndResult {
  restored: number;
  /** Edited by hand during the sale: left at their new price. */
  kept: { product_title: string; variant_title: string }[];
}

/** The running or scheduled sale a product is in (product page banner). */
export interface ProductSaleInfo {
  id: string;
  title: string;
  summary: string;
  status: SaleStatus;
  ends_at: string | null;
}
