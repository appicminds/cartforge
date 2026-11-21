import { describe, expect, it } from "vitest";
import {
  computeTotals,
  evaluateDiscount,
  selectDiscounts,
  type DiscountLine,
  type DiscountRule,
} from "./index";

const ALL = { all: true, product_ids: [], collection_ids: [] };
const rule = (over: Partial<DiscountRule>): DiscountRule => ({
  id: over.id ?? "d",
  title: "Discount",
  code: null,
  kind: "order",
  value_type: "percent",
  value: 1000,
  target: ALL,
  min_subtotal_minor: null,
  min_quantity: null,
  combines: false,
  ...over,
});
// Rupees (no minor unit): suit Rs 4,000 ×2, dupatta Rs 1,000 ×1, shawl Rs 2,500 ×1.
const lines: DiscountLine[] = [
  {
    key: "suit",
    product_id: "p-suit",
    collection_ids: ["c-lawn"],
    unit_price_minor: 4000,
    quantity: 2,
  },
  {
    key: "dup",
    product_id: "p-dup",
    collection_ids: ["c-acc"],
    unit_price_minor: 1000,
    quantity: 1,
  },
  {
    key: "shawl",
    product_id: "p-shawl",
    collection_ids: ["c-acc"],
    unit_price_minor: 2500,
    quantity: 1,
  },
];
const amount = (r: ReturnType<typeof evaluateDiscount>) => ("rule" in r ? r.amount_minor : r);

describe("discounts: each kind", () => {
  it("order: percent or fixed, with minimums", () => {
    expect(amount(evaluateDiscount(rule({}), lines, 250))).toBe(1150); // 10% of 11,500
    expect(amount(evaluateDiscount(rule({ value_type: "fixed", value: 500 }), lines, 250))).toBe(
      500,
    );
    expect(evaluateDiscount(rule({ min_subtotal_minor: 15_000 }), lines, 250)).toEqual({
      reason: "min_subtotal",
      missing_minor: 3500,
    });
    expect(evaluateDiscount(rule({ min_quantity: 5 }), lines, 250)).toEqual({
      reason: "min_quantity",
      missing: 1,
    });
    // A fixed amount never exceeds the order.
    expect(amount(evaluateDiscount(rule({ value_type: "fixed", value: 99_999 }), lines, 0))).toBe(
      11_500,
    );
  });

  it("products: only eligible items, per item for fixed amounts", () => {
    const acc = { all: false, product_ids: [], collection_ids: ["c-acc"] };
    const r = evaluateDiscount(rule({ kind: "products", target: acc, value: 2000 }), lines, null);
    expect("rule" in r && Object.fromEntries(r.line_minor)).toEqual({ dup: 200, shawl: 500 });
    const fixed = evaluateDiscount(
      rule({
        kind: "products",
        target: { all: false, product_ids: ["p-suit"], collection_ids: [] },
        value_type: "fixed",
        value: 300,
      }),
      lines,
      null,
    );
    expect("rule" in fixed && Object.fromEntries(fixed.line_minor)).toEqual({ suit: 600 });
    expect(
      evaluateDiscount(
        rule({ kind: "products", target: { all: false, product_ids: ["x"], collection_ids: [] } }),
        lines,
        null,
      ),
    ).toEqual({ reason: "no_items" });
  });

  it("buy X get Y: cheapest eligible items, limited uses", () => {
    // Buy 2 lawn suits, get an accessory free.
    const bxgy = rule({
      kind: "bxgy",
      value: 10_000,
      target: { all: false, product_ids: [], collection_ids: ["c-acc"] },
      buy: {
        quantity: 2,
        target: { all: false, product_ids: [], collection_ids: ["c-lawn"] },
        get_quantity: 1,
        max_uses: null,
      },
    });
    const r = evaluateDiscount(bxgy, lines, null);
    expect("rule" in r && Object.fromEntries(r.line_minor)).toEqual({ dup: 1000 });
    // Only one suit: not enough.
    const one = lines.map((l) => (l.key === "suit" ? { ...l, quantity: 1 } : l));
    expect("reason" in evaluateDiscount(bxgy, one, null)).toBe(true);
    // Buy 2 get 1 on everything at 50%: 4 items → 1 use; the cheapest item is discounted.
    const any = rule({
      kind: "bxgy",
      value: 5000,
      target: ALL,
      buy: { quantity: 2, target: ALL, get_quantity: 1, max_uses: 1 },
    });
    const r2 = evaluateDiscount(any, lines, null);
    expect("rule" in r2 && Object.fromEntries(r2.line_minor)).toEqual({ dup: 500 });
  });

  it("free shipping needs a shipping charge", () => {
    expect(amount(evaluateDiscount(rule({ kind: "shipping" }), lines, 250))).toBe(250);
    expect(evaluateDiscount(rule({ kind: "shipping" }), lines, null)).toEqual({
      reason: "no_shipping",
    });
  });
});

describe("discounts: choosing the best", () => {
  it("picks the single best unless discounts combine", () => {
    const tenOff = rule({ id: "ten", value: 1000 });
    const ship = rule({ id: "ship", kind: "shipping" });
    const s = selectDiscounts([tenOff, ship], lines, 250);
    expect(s.applied.map((a) => a.rule.id)).toEqual(["ten"]);
    expect(s.total_minor).toBe(1150);
    const both = selectDiscounts(
      [
        { ...tenOff, combines: true },
        { ...ship, combines: true },
      ],
      lines,
      250,
    );
    expect(both.applied.map((a) => a.rule.id).sort()).toEqual(
      ["seen", "ship", "ten"].filter((x) => x !== "seen"),
    );
    expect(both).toMatchObject({ order_minor: 1150, shipping_minor: 250, total_minor: 1400 });
  });

  it("applies the order discount after item discounts", () => {
    const items = rule({ id: "items", kind: "products", value: 5000, combines: true }); // 50% off all
    const order = rule({ id: "order", value: 1000, combines: true }); // then 10%
    const s = selectDiscounts([items, order], lines, null);
    expect(s.total_minor).toBe(5750 + 575);
  });

  it("prefers the entered code on a tie, and nothing when nothing applies", () => {
    const auto = rule({ id: "auto", value: 1000 });
    const code = rule({ id: "code", code: "EID10", value: 1000 });
    expect(selectDiscounts([auto, code], lines, null).applied[0]!.rule.id).toBe("code");
    expect(selectDiscounts([rule({ min_quantity: 99 })], lines, null).total_minor).toBe(0);
  });
});

describe("totals with line discounts", () => {
  it("takes item discounts from their lines and spreads the order discount over the rest", () => {
    const t = computeTotals({
      lines: [
        { key: "a", unit_price_minor: 4000, quantity: 2, requires_shipping: true },
        { key: "b", unit_price_minor: 1000, quantity: 1, requires_shipping: true },
      ],
      line_discounts: [0, 1000],
      discount_minor: 800,
      shipping_minor: 250,
      tax: { rate_bps: 0, prices_include_tax: false, tax_shipping: false },
    });
    expect(t.lines.map((l) => l.discount_minor)).toEqual([800, 1000]);
    expect(t).toMatchObject({ discount_minor: 1800, total_minor: 9000 - 1800 + 250 });
  });
});
