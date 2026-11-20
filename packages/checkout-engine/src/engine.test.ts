import { describe, expect, it } from "vitest";
import {
  addressSchema,
  allocate,
  checkoutSettingsSchema,
  computeTotals,
  quoteShipping,
  shippingCountries,
  taxOn,
  validateCustomFields,
  type ShippingMethodConfig,
} from "./index";

const line = (key: string, unit: number, qty: number, ship = true) => ({
  key,
  unit_price_minor: unit,
  quantity: qty,
  requires_shipping: ship,
});
const noTax = { rate_bps: 0, prices_include_tax: false, tax_shipping: false };

describe("totals", () => {
  it("adds lines and shipping without tax", () => {
    const t = computeTotals({
      lines: [line("a", 1999, 2), line("b", 500, 1)],
      shipping_minor: 495,
      tax: noTax,
    });
    expect(t).toMatchObject({
      subtotal_minor: 4498,
      shipping_minor: 495,
      tax_minor: 0,
      total_minor: 4993,
    });
  });

  it("adds exclusive tax per line (half-up) and optionally on shipping", () => {
    const tax = { rate_bps: 825, prices_include_tax: false, tax_shipping: true };
    const t = computeTotals({
      lines: [line("a", 1999, 1), line("b", 1001, 3)],
      shipping_minor: 500,
      tax,
    });
    // 1999×8.25% = 164.9175 → 165; 3003×8.25% = 247.7475 → 248; 500×8.25% = 41.25 → 41
    expect(t.lines.map((l) => l.tax_minor)).toEqual([165, 248]);
    expect(t.shipping_tax_minor).toBe(41);
    expect(t.tax_minor).toBe(454);
    expect(t.total_minor).toBe(1999 + 3003 + 500 + 454);
  });

  it("extracts inclusive tax without changing the total", () => {
    const tax = { rate_bps: 2000, prices_include_tax: true, tax_shipping: true };
    const t = computeTotals({ lines: [line("a", 1200, 1)], shipping_minor: 600, tax });
    expect(t.lines[0]!.tax_minor).toBe(200); // 1200 − 1200/1.2
    expect(t.shipping_tax_minor).toBe(100);
    expect(t.total_minor).toBe(1800);
  });

  it("distributes discounts across lines and taxes the remainder", () => {
    const t = computeTotals({
      lines: [line("a", 3000, 1), line("b", 1000, 1)],
      shipping_minor: 0,
      discount_minor: 1001,
      tax: { rate_bps: 1000, prices_include_tax: false, tax_shipping: false },
    });
    expect(t.lines.map((l) => l.discount_minor)).toEqual([751, 250]);
    expect(t.lines.map((l) => l.tax_minor)).toEqual([225, 75]);
    expect(t.total_minor).toBe(4000 - 1001 + 300);
  });

  it("rejects unsafe inputs", () => {
    expect(() =>
      computeTotals({ lines: [line("a", -1, 1)], shipping_minor: 0, tax: noTax }),
    ).toThrow();
    expect(() =>
      computeTotals({ lines: [line("a", 1, 0)], shipping_minor: 0, tax: noTax }),
    ).toThrow();
    expect(() =>
      computeTotals({ lines: [line("a", 1.5, 1)], shipping_minor: 0, tax: noTax }),
    ).toThrow();
    expect(() =>
      computeTotals({ lines: [], shipping_minor: 0, tax: { ...noTax, rate_bps: 20_000 } }),
    ).toThrow();
  });

  it("rounds exactly on large amounts and allocates remainders deterministically", () => {
    expect(taxOn(999_999_999_999, 2000, false)).toBe(200_000_000_000);
    expect(allocate(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
  });
});

describe("shipping", () => {
  const m = (over: Partial<ShippingMethodConfig>): ShippingMethodConfig => ({
    id: "x",
    name: "Standard",
    description: null,
    price_minor: 500,
    free_over_minor: null,
    countries: [],
    active: true,
    ...over,
  });
  const methods = [
    m({ id: "std", name: "Standard", free_over_minor: 5000, countries: ["US", "CA"] }),
    m({ id: "exp", name: "Express", price_minor: 1500, countries: ["US"] }),
    m({ id: "intl", name: "International", price_minor: 2500 }),
    m({ id: "off", name: "Retired", active: false }),
  ];

  it("offers only methods for the destination, cheapest first", () => {
    expect(quoteShipping(methods, "us", 1000).map((q) => q.id)).toEqual(["std", "exp", "intl"]);
    expect(quoteShipping(methods, "FR", 1000).map((q) => q.id)).toEqual(["intl"]);
    expect(quoteShipping(methods, null, 1000)).toEqual([]);
  });

  it("applies free-shipping thresholds", () => {
    const std = quoteShipping(methods, "CA", 5000).find((q) => q.id === "std");
    expect(std).toMatchObject({ price_minor: 0, free: true });
  });

  it("lists shippable countries", () => {
    expect(shippingCountries(methods)).toBeNull();
    expect(shippingCountries(methods.slice(0, 2))).toEqual(["CA", "US"]);
  });
});

describe("addresses", () => {
  const base = {
    last_name: "Doe",
    address1: "1 Main St",
    city: "Springfield",
    country: "us",
    region: "IL",
    postal_code: "62701",
  };
  it("normalizes and accepts a valid address", () => {
    expect(addressSchema.parse(base)).toMatchObject({
      country: "US",
      first_name: null,
      phone: null,
    });
  });
  it("applies country rules", () => {
    const err = (a: object) =>
      addressSchema.safeParse(a).error?.issues.map((i) => i.path.join(".")) ?? [];
    expect(err({ ...base, region: "" })).toEqual(["region"]);
    expect(err({ ...base, postal_code: "ABC" })).toEqual(["postal_code"]);
    expect(err({ ...base, country: "IE", region: "", postal_code: "" })).toEqual([]);
    expect(err({ ...base, country: "ZZ" })).toEqual(["country"]);
    expect(err({ ...base, phone: "<script>" })).toEqual(["phone"]);
    expect(err({ ...base, last_name: "  " })).toEqual(["last_name"]);
    expect(err({ ...base, company: null, address2: null })).toEqual([]);
  });
});

describe("settings and custom fields", () => {
  it("defaults to a safe, closed checkout", () => {
    const s = checkoutSettingsSchema.parse({});
    expect(s).toMatchObject({
      cod_enabled: false,
      bank_transfer_enabled: false,
      reservation_minutes: 15,
    });
  });
  it("requires bank instructions and rejects unsafe terms links", () => {
    expect(checkoutSettingsSchema.safeParse({ bank_transfer_enabled: true }).success).toBe(false);
    expect(checkoutSettingsSchema.safeParse({ terms_url: "javascript:alert(1)" }).success).toBe(
      false,
    );
    expect(checkoutSettingsSchema.safeParse({ terms_url: "//evil.example" }).success).toBe(false);
    expect(checkoutSettingsSchema.safeParse({ terms_url: "/pages/terms" }).success).toBe(true);
  });
  it("validates custom field values on the server", () => {
    const fields = checkoutSettingsSchema.parse({
      custom_fields: [
        { key: "gift_note", label: "Gift note", type: "textarea" },
        {
          key: "delivery",
          label: "Delivery window",
          type: "select",
          required: true,
          options: ["AM", "PM"],
        },
        { key: "leave", label: "Leave at door", type: "checkbox", required: true },
      ],
    }).custom_fields;
    expect(
      validateCustomFields(fields, { delivery: "AM", leave: true, gift_note: " Hi " }),
    ).toEqual({
      values: { gift_note: "Hi", delivery: "AM", leave: true },
      errors: [],
    });
    expect(validateCustomFields(fields, { delivery: "Night" }).errors.map((e) => e.path)).toEqual([
      "custom_fields.delivery",
      "custom_fields.leave",
    ]);
  });
});
