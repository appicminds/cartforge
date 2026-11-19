import { describe, expect, it } from "vitest";
import { inventoryAdjustSchema, productOptionsSchema, variantUpdateSchema } from "./variants.js";

describe("options", () => {
  it("accepts up to 3 options within the variant cap", () => {
    expect(
      productOptionsSchema.safeParse([
        { name: "Size", values: ["S", "M"] },
        { name: "Color", values: ["Red"] },
      ]).success,
    ).toBe(true);
  });
  it("rejects duplicates and over-limit combinations", () => {
    expect(productOptionsSchema.safeParse([{ name: "Size", values: ["S", "s"] }]).success).toBe(
      false,
    );
    expect(
      productOptionsSchema.safeParse([
        { name: "Size", values: ["S"] },
        { name: "size", values: ["M"] },
      ]).success,
    ).toBe(false);
    const many = (n: number) => Array.from({ length: n }, (_, i) => `v${i}`);
    expect(
      productOptionsSchema.safeParse([
        { name: "A", values: many(11) },
        { name: "B", values: many(10) },
      ]).success,
    ).toBe(false);
    expect(
      productOptionsSchema.safeParse(
        Array.from({ length: 4 }, (_, i) => ({ name: `O${i}`, values: ["x"] })),
      ).success,
    ).toBe(false);
  });
  it("allows removing all options", () => {
    expect(productOptionsSchema.safeParse([]).success).toBe(true);
  });
});

describe("variant update", () => {
  it("requires a field and checks compare-at", () => {
    expect(variantUpdateSchema.safeParse({}).success).toBe(false);
    expect(variantUpdateSchema.safeParse({ price_minor: 100, compare_at_minor: 100 }).success).toBe(
      false,
    );
    expect(variantUpdateSchema.parse({ sku: "  " })).toEqual({ sku: null });
  });
});

describe("inventory adjustments", () => {
  it("validates per mode", () => {
    expect(
      inventoryAdjustSchema.safeParse({
        variant_id: crypto.randomUUID(),
        quantity: 0,
        reason: "received",
      }).success,
    ).toBe(false);
    expect(
      inventoryAdjustSchema.safeParse({
        variant_id: crypto.randomUUID(),
        mode: "set",
        quantity: -1,
        reason: "correction",
      }).success,
    ).toBe(false);
    expect(
      inventoryAdjustSchema.safeParse({
        variant_id: crypto.randomUUID(),
        quantity: 5,
        reason: "other",
      }).success,
    ).toBe(false);
    expect(
      inventoryAdjustSchema.parse({
        variant_id: crypto.randomUUID(),
        quantity: -3,
        reason: "damaged",
      }).mode,
    ).toBe("delta");
  });
  it("requires a reason", () => {
    expect(
      inventoryAdjustSchema.safeParse({ variant_id: crypto.randomUUID(), quantity: 2 }).success,
    ).toBe(false);
  });
});
