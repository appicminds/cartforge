import type { FieldError } from "@cartforge/types";

export interface PublishCandidate {
  title: string;
  handle: string;
  product_type: "simple" | "variable";
  variant_count: number;
  /** Default-variant price for simple products. */
  price_minor: number | bigint | null;
}

/**
 * Rules a product must satisfy to become Active (PRD §8.4 I, §8.8 rule 6).
 * Sprint 3 adds per-variant pricing/option checks for variable products.
 * Returns actionable field errors; empty array = publishable.
 */
export function publishErrors(p: PublishCandidate): FieldError[] {
  const errors: FieldError[] = [];
  if (!p.title.trim()) errors.push({ path: "title", message: "Add a title before publishing." });
  if (!p.handle) errors.push({ path: "handle", message: "Add a URL handle before publishing." });
  if (p.variant_count < 1) {
    errors.push({
      path: "variants",
      message: "A product needs at least one variant to be published.",
    });
  }
  if (p.product_type === "simple" && (p.price_minor === null || p.price_minor === undefined)) {
    errors.push({ path: "price_minor", message: "Set a price before publishing." });
  }
  return errors;
}
