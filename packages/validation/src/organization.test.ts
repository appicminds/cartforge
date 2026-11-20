import { describe, expect, it } from "vitest";
import {
  categoryDeleteSchema,
  normalizeTag,
  productBulkSchema,
  tagsSchema,
} from "./organization.js";

const id = () => crypto.randomUUID();

describe("tags", () => {
  it("normalizes and de-duplicates", () => {
    expect(normalizeTag("  Summer   SALE ")).toBe("summer sale");
    expect(tagsSchema.parse(["Summer  Sale", "summer sale", "Gift"])).toEqual([
      "Summer Sale",
      "Gift",
    ]);
  });
});

describe("bulk actions", () => {
  it("requires targets for organization actions", () => {
    expect(
      productBulkSchema.safeParse({ action: "add_categories", product_ids: [id()] }).success,
    ).toBe(false);
    expect(
      productBulkSchema.safeParse({
        action: "add_categories",
        product_ids: [id()],
        category_ids: [id()],
      }).success,
    ).toBe(true);
    expect(productBulkSchema.safeParse({ action: "publish", product_ids: [] }).success).toBe(false);
    expect(productBulkSchema.safeParse({ action: "explode", product_ids: [id()] }).success).toBe(
      false,
    );
  });
});

describe("category delete", () => {
  it("accepts one choice at most", () => {
    expect(categoryDeleteSchema.safeParse({ reassign_to: id(), unassign: true }).success).toBe(
      false,
    );
    expect(categoryDeleteSchema.safeParse({}).success).toBe(true);
  });
});
