/**
 * Sales: a bulk price change (e.g. 20% off everything) written to the variants
 * themselves, with the old price shown struck through (compare-at). Pure — the
 * API saves the old prices so a sale can be ended and everything put back.
 */
import { minorDigits } from "./markets";

/**
 * Sale prices are rounded *down*, so "20% off" is never less than 20% off.
 * - none:    exact
 * - whole:   to a whole amount (63.20 → 63)
 * - x9:      to an amount ending in 9, or .99 for cents currencies (3,196 → 3,189; 63.20 → 62.99)
 * - ten:     to a multiple of 10 (3,196 → 3,190)
 * - hundred: to a multiple of 100 (3,196 → 3,100)
 */
export const SALE_ROUNDING = ["none", "whole", "x9", "ten", "hundred"] as const;
export type SaleRounding = (typeof SALE_ROUNDING)[number];

export const SALE_ROUNDING_LABELS: Record<SaleRounding, string> = {
  none: "Don't round",
  whole: "Down to a whole amount (63.20 → 63)",
  x9: "Down to an amount ending in 9 (3,196 → 3,189)",
  ten: "Down to a multiple of 10 (3,196 → 3,190)",
  hundred: "Down to a multiple of 100 (3,196 → 3,100)",
};

/**
 * Products that already have a sale price (compare-at above the price):
 * - skip:     leave them as they are
 * - original: take the sale off the original (compare-at) price
 * - current:  take the sale off the current price (stacks)
 */
export const SALE_EXISTING = ["skip", "original", "current"] as const;
export type SaleExisting = (typeof SALE_EXISTING)[number];

export interface SaleRule {
  value_type: "percent" | "fixed";
  /** percent: basis points (2000 = 20%); fixed: store-currency minor units. */
  value: number;
  existing: SaleExisting;
  rounding: SaleRounding;
  currency: string;
}

export type SaleSkip = "no_price" | "already_discounted" | "not_lower" | "below_zero";

export const SALE_SKIP_LABELS: Record<SaleSkip, string> = {
  no_price: "No price",
  already_discounted: "Already discounted",
  not_lower: "Wouldn't be cheaper",
  below_zero: "Discount is more than the price",
};

export type SalePrice =
  | { ok: true; price_minor: number; compare_at_minor: number; discounted_before: boolean }
  | { ok: false; reason: SaleSkip; discounted_before: boolean };

function roundDown(minor: number, rule: SaleRounding, currency: string): number {
  const digits = minorDigits(currency);
  const unit = 10 ** digits;
  switch (rule) {
    case "whole":
      return Math.floor(minor / unit) * unit;
    case "x9": {
      // Cents currencies: x.99; whole-unit currencies: …9.
      const step = digits >= 2 ? unit : 10;
      const end = digits >= 2 ? unit - 1 : 9;
      const r = Math.floor((minor - end) / step) * step + end;
      return r;
    }
    case "ten":
      return Math.floor(minor / (10 * unit)) * 10 * unit;
    case "hundred":
      return Math.floor(minor / (100 * unit)) * 100 * unit;
    default:
      return minor;
  }
}

/** The sale price for one variant, or why it's left out. */
export function salePrice(
  variant: { price_minor: number | null; compare_at_minor: number | null },
  rule: SaleRule,
): SalePrice {
  const price = variant.price_minor;
  const compare = variant.compare_at_minor;
  const discounted_before = price !== null && compare !== null && compare > price;
  if (price === null || price <= 0) return { ok: false, reason: "no_price", discounted_before };
  if (discounted_before && rule.existing === "skip")
    return { ok: false, reason: "already_discounted", discounted_before };
  const base = discounted_before && rule.existing === "original" ? compare! : price;
  const off = rule.value_type === "percent" ? Math.round((base * rule.value) / 10_000) : rule.value;
  const raw = base - off;
  if (raw <= 0) return { ok: false, reason: "below_zero", discounted_before };
  let next = roundDown(raw, rule.rounding, rule.currency);
  // Rounding never wipes the price out: keep the exact amount instead.
  if (next <= 0) next = raw;
  if (next >= price) return { ok: false, reason: "not_lower", discounted_before };
  return {
    ok: true,
    price_minor: next,
    compare_at_minor: discounted_before ? compare! : price,
    discounted_before,
  };
}
