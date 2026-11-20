import { describe, expect, it } from "vitest";
import { formatMoney, priceView } from "./money";

describe("money", () => {
  it("formats minor units using the currency's own digits", () => {
    expect(formatMoney(1999, "USD")).toBe("$19.99");
    expect(formatMoney(1999, "JPY")).toBe("¥1,999");
    expect(formatMoney(1999, "KWD", "en-US")).toBe("KWD\u00a01.999");
    expect(formatMoney(0, "EUR", "de-DE")).toBe("0,00 €");
  });

  it("builds price labels for single prices, ranges and sales", () => {
    expect(
      priceView(
        { price_min_minor: 1000, price_max_minor: 1000, compare_at_min_minor: 1500 },
        "USD",
      ),
    ).toEqual({ label: "$10.00", compareAt: "$15.00", onSale: true });
    expect(
      priceView(
        { price_min_minor: 1000, price_max_minor: 2000, compare_at_min_minor: null },
        "USD",
      ),
    ).toEqual({ label: "From $10.00", compareAt: null, onSale: false });
    expect(
      priceView(
        { price_min_minor: null, price_max_minor: null, compare_at_min_minor: null },
        "USD",
      ),
    ).toBeNull();
  });
});
