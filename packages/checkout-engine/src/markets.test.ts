import { describe, expect, it } from "vitest";
import {
  convertAmount,
  convertPrice,
  marketCountries,
  marketForCountry,
  toStoreCurrency,
  type MarketPricing,
} from "./markets";

// 1 AED = 76 PKR → 1 PKR = 1/76 AED.
const aed: MarketPricing = {
  store_currency: "PKR",
  currency: "AED",
  rate: 1 / 76,
  adjustment_bps: 0,
  rounding: "none",
};

describe("markets: prices", () => {
  it("converts between currencies with different decimals", () => {
    // Rs 4,799 (PKR has no minor unit) → AED 63.14 (fils)
    expect(convertPrice(4799, aed)).toBe(6314);
    // back: AED 63.14 → Rs 4,799
    expect(toStoreCurrency(6314, aed)).toBe(4799);
    const usdStore = { ...aed, store_currency: "USD", currency: "PKR", rate: 280 };
    expect(convertPrice(1999, usdStore)).toBe(5597); // $19.99 → Rs 5,597
  });

  it("adds the adjustment, then rounds up by the chosen rule", () => {
    expect(convertPrice(4799, { ...aed, adjustment_bps: 1000 })).toBe(6946); // +10%
    expect(convertPrice(4799, { ...aed, rounding: "whole" })).toBe(6400);
    expect(convertPrice(4799, { ...aed, rounding: "x99" })).toBe(6399);
    expect(convertPrice(4799, { ...aed, rounding: "five" })).toBe(6500);
    expect(convertPrice(4799, { ...aed, rounding: "ten" })).toBe(7000);
    expect(convertPrice(4799, { ...aed, rounding: "x9" })).toBe(6900);
    // Whole-unit target currency: .99 means a whole amount.
    const pkr = { store_currency: "USD", currency: "PKR", rate: 280, adjustment_bps: 0 };
    expect(convertPrice(1999, { ...pkr, rounding: "x99" })).toBe(5598);
    expect(convertPrice(1999, { ...pkr, rounding: "x9" })).toBe(5599);
  });

  it("leaves the store's own market alone and never goes negative", () => {
    const same = { ...aed, currency: "PKR", rate: 1 };
    expect(convertPrice(4799, same)).toBe(4799);
    expect(convertPrice(0, { ...aed, rounding: "ten" })).toBe(0);
    expect(convertPrice(100, { ...aed, adjustment_bps: -20000 })).toBe(0);
  });

  it("converts fees exactly, without price adjustment or rounding", () => {
    expect(convertAmount(250, { ...aed, adjustment_bps: 1000, rounding: "ten" })).toBe(329);
  });
});

describe("markets: which market a shopper is in", () => {
  const markets = [
    { id: "pk", countries: ["PK"], is_primary: true, active: true },
    { id: "gulf", countries: ["AE", "SA"], is_primary: false, active: true },
    { id: "uk", countries: ["GB"], is_primary: false, active: false },
  ];
  it("matches by country, falls back to the primary market", () => {
    expect(marketForCountry(markets, "ae")?.id).toBe("gulf");
    expect(marketForCountry(markets, "GB")?.id).toBe("pk"); // inactive market
    expect(marketForCountry(markets, "FR")?.id).toBe("pk");
    expect(marketForCountry(markets, null)?.id).toBe("pk");
  });
  it("lists the countries each market ships to", () => {
    const all = ["AE", "FR", "GB", "PK", "SA"];
    expect(marketCountries(markets[1]!, markets, all)).toEqual(["AE", "SA"]);
    expect(marketCountries(markets[0]!, markets, all)).toEqual(["PK"]);
    const open = { ...markets[0]!, countries: [] };
    expect(marketCountries(open, [open, markets[1]!], all)).toEqual(["FR", "GB", "PK"]);
    expect(marketCountries(open, [open], all)).toBeNull(); // everywhere
  });
});
