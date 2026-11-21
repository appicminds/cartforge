import { describe, expect, it } from "vitest";
import { salePrice, type SaleRule } from "./sales";

const rule = (over: Partial<SaleRule> = {}): SaleRule => ({
  value_type: "percent",
  value: 2000,
  existing: "skip",
  rounding: "none",
  currency: "PKR",
  ...over,
});
const v = (price: number | null, compare: number | null = null) => ({
  price_minor: price,
  compare_at_minor: compare,
});

describe("salePrice", () => {
  it("takes a percentage off and strikes through the old price", () => {
    expect(salePrice(v(4000), rule())).toEqual({
      ok: true,
      price_minor: 3200,
      compare_at_minor: 4000,
      discounted_before: false,
    });
  });

  it("takes a fixed amount off", () => {
    expect(salePrice(v(4000), rule({ value_type: "fixed", value: 500 }))).toMatchObject({
      price_minor: 3500,
    });
    expect(salePrice(v(400), rule({ value_type: "fixed", value: 500 }))).toMatchObject({
      ok: false,
      reason: "below_zero",
    });
  });

  it("handles products already on sale three ways", () => {
    const onSale = v(4000, 5000);
    expect(salePrice(onSale, rule())).toMatchObject({ ok: false, reason: "already_discounted" });
    expect(salePrice(onSale, rule({ existing: "original" }))).toMatchObject({
      ok: false,
      reason: "not_lower", // 20% off 5,000 = 4,000: no cheaper
    });
    expect(salePrice(v(4500, 5000), rule({ existing: "original" }))).toMatchObject({
      price_minor: 4000,
      compare_at_minor: 5000,
    });
    expect(salePrice(onSale, rule({ existing: "current" }))).toMatchObject({
      price_minor: 3200,
      compare_at_minor: 5000,
      discounted_before: true,
    });
    // A compare-at below the price isn't a sale.
    expect(salePrice(v(4000, 3000), rule())).toMatchObject({
      price_minor: 3200,
      compare_at_minor: 4000,
    });
  });

  it("rounds down", () => {
    const p = v(3995); // 20% off = 3,196
    expect(salePrice(p, rule({ rounding: "x9" }))).toMatchObject({ price_minor: 3189 });
    expect(salePrice(p, rule({ rounding: "ten" }))).toMatchObject({ price_minor: 3190 });
    expect(salePrice(p, rule({ rounding: "hundred" }))).toMatchObject({ price_minor: 3100 });
    expect(salePrice(v(4000), rule({ rounding: "x9" }))).toMatchObject({ price_minor: 3199 });
    expect(salePrice(v(7900), rule({ rounding: "x9", currency: "USD" }))).toMatchObject({
      price_minor: 6299, // 63.20 → 62.99
    });
    expect(salePrice(v(7900), rule({ rounding: "whole", currency: "USD" }))).toMatchObject({
      price_minor: 6300,
    });
    // Rounding never takes a small price to zero.
    expect(salePrice(v(50), rule({ rounding: "hundred" }))).toMatchObject({ price_minor: 40 });
  });

  it("skips variants without a price", () => {
    expect(salePrice(v(null), rule())).toMatchObject({ ok: false, reason: "no_price" });
  });
});
