import { describe, expect, it } from "vitest";
import {
  productCreateSchema,
  productListQuerySchema,
  productUpdateSchema,
  slugify,
} from "./product.js";

describe("slugify", () => {
  it.each([
    ["Classic T-Shirt", "classic-t-shirt"],
    ["  Café Crème — 2-Pack! ", "cafe-creme-2-pack"],
    ["Salt & Pepper", "salt-and-pepper"],
    ["---", ""],
    ["日本語", ""],
  ])("%s → %s", (input, out) => expect(slugify(input)).toBe(out));

  it("respects max length without a trailing hyphen", () => {
    expect(slugify("abc def", 4)).toBe("abc");
  });
});

describe("productCreateSchema", () => {
  it("applies defaults for a minimal draft", () => {
    expect(productCreateSchema.parse({ title: "  Mug " })).toEqual({
      title: "Mug",
      description_html: "",
      product_type: "simple",
      status: "draft",
    });
  });

  it("rejects whitespace-only and over-long titles", () => {
    expect(productCreateSchema.safeParse({ title: "   " }).success).toBe(false);
    expect(productCreateSchema.safeParse({ title: "x".repeat(201) }).success).toBe(false);
    expect(productCreateSchema.safeParse({ title: "x".repeat(200) }).success).toBe(true);
  });

  it("validates handle format and normalizes case", () => {
    expect(productCreateSchema.parse({ title: "A", handle: "My-Mug" }).handle).toBe("my-mug");
    expect(productCreateSchema.safeParse({ title: "A", handle: "my mug" }).success).toBe(false);
    expect(productCreateSchema.safeParse({ title: "A", handle: "my--mug" }).success).toBe(false);
  });

  it("turns a blank vendor into null", () => {
    expect(productCreateSchema.parse({ title: "A", vendor: "  " }).vendor).toBeNull();
    expect(productCreateSchema.parse({ title: "A", vendor: null }).vendor).toBeNull();
  });
});

describe("productUpdateSchema", () => {
  it("requires at least one real field", () => {
    expect(productUpdateSchema.safeParse({}).success).toBe(false);
    expect(productUpdateSchema.safeParse({ confirm_handle_change: true }).success).toBe(false);
    expect(productUpdateSchema.safeParse({ title: "New" }).success).toBe(true);
  });

  it("leaves omitted optional fields untouched", () => {
    expect(productUpdateSchema.parse({ title: "New" })).toEqual({ title: "New" });
  });

  it("rejects unknown fields (no mass assignment)", () => {
    expect(productUpdateSchema.safeParse({ title: "x", store_id: "other" }).success).toBe(false);
  });
});

describe("productListQuerySchema", () => {
  it("parses comma-separated filters and defaults", () => {
    expect(productListQuerySchema.parse({ status: "draft,active,draft", q: "  " })).toEqual({
      page: 1,
      page_size: 25,
      status: ["draft", "active"],
      q: undefined,
      product_type: undefined,
      sort: "updated_at",
      order: "desc",
    });
  });

  it("rejects unknown filter values and sort fields", () => {
    expect(productListQuerySchema.safeParse({ status: "live" }).success).toBe(false);
    expect(productListQuerySchema.safeParse({ sort: "price; drop table" }).success).toBe(false);
  });
});

describe("pricing and media input", () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

  it("accepts minor-unit prices and rejects floats/negatives", () => {
    expect(productCreateSchema.safeParse({ title: "A", price_minor: 1999 }).success).toBe(true);
    expect(productCreateSchema.safeParse({ title: "A", price_minor: 19.99 }).success).toBe(false);
    expect(productCreateSchema.safeParse({ title: "A", price_minor: -1 }).success).toBe(false);
  });

  it("requires compare-at to exceed price when both are given", () => {
    const r = productCreateSchema.safeParse({
      title: "A",
      price_minor: 1000,
      compare_at_minor: 1000,
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["compare_at_minor"]);
    expect(
      productUpdateSchema.safeParse({ price_minor: 1000, compare_at_minor: 1500 }).success,
    ).toBe(true);
  });

  it("rejects duplicate images", () => {
    const media = [{ media_asset_id: id(1) }, { media_asset_id: id(1) }];
    expect(productUpdateSchema.safeParse({ media }).success).toBe(false);
  });
});
