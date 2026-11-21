/** Discounts (Next 8): codes and automatic discounts. */

export const DISCOUNT_ERROR_CODES = {
  DISCOUNT_NOT_FOUND: "DISCOUNT_NOT_FOUND",
  DISCOUNT_CODE_TAKEN: "DISCOUNT_CODE_TAKEN",
  DISCOUNT_CODE_INVALID: "DISCOUNT_CODE_INVALID",
  DISCOUNT_USED_UP: "DISCOUNT_USED_UP",
} as const;

export type DiscountKindKey = "order" | "products" | "bxgy" | "shipping";
export type DiscountStatus = "active" | "scheduled" | "expired" | "disabled" | "used_up";

export interface DiscountTargetView {
  all: boolean;
  product_ids: string[];
  collection_ids: string[];
}

export interface DiscountView {
  id: string;
  title: string;
  method: "code" | "automatic";
  code: string | null;
  kind: DiscountKindKey;
  value_type: "percent" | "fixed";
  /** percent: basis points; fixed: store-currency minor units. */
  value: number;
  target: DiscountTargetView;
  buy: {
    quantity: number;
    target: DiscountTargetView;
    get_quantity: number;
    max_uses: number | null;
  } | null;
  min_subtotal_minor: number | null;
  min_quantity: number | null;
  starts_at: string;
  ends_at: string | null;
  usage_limit: number | null;
  once_per_customer: boolean;
  combines: boolean;
  /** Empty = every market. */
  market_ids: string[];
  enabled: boolean;
  used_count: number;
  status: DiscountStatus;
  /** "10% off order", "Buy 2, get 1 free" … */
  summary: string;
  created_at: string;
}

/** A discount applied at checkout or on an order. */
export interface AppliedDiscount {
  id: string;
  title: string;
  code: string | null;
  kind: DiscountKindKey;
  amount_minor: number;
}
