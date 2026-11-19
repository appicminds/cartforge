import type { FieldError } from "@cartforge/types";

export interface PublishCandidate {
  title: string;
  handle: string;
  product_type: "simple" | "variable";
  variant_count: number;
}

/**
 * Rules a product must satisfy to become Active (PRD §8.4 I, §8.8 rule 6).
 * Grows with each sprint: price (Sprint 2), variant configuration (Sprint 3).
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
  return errors;
}
