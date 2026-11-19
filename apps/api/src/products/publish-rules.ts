import type { FieldError } from "@cartforge/types";

export interface PublishCandidate {
  title: string;
  handle: string;
  product_type: "simple" | "variable";
  variant_count: number;
  /** Simple products: default-variant price. */
  price_minor: number | bigint | null;
  /** Variable products: titles of variants that have no price. */
  unpriced_variants?: string[];
}

/**
 * Rules a product must satisfy to become Active (PRD §8.4 I, §8.8 rule 6).
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
  if (p.product_type === "variable" && p.unpriced_variants?.length) {
    const list = p.unpriced_variants.slice(0, 5).join(", ");
    const more =
      p.unpriced_variants.length > 5 ? ` and ${p.unpriced_variants.length - 5} more` : "";
    errors.push({
      path: "variants",
      message: `Set a price for every variant before publishing (missing: ${list}${more}).`,
    });
  }
  return errors;
}
