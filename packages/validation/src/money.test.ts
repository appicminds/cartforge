import { describe, expect, it } from "vitest";
import { currencyExponent, formatMoney, minorToDecimalString, parseMoneyToMinor } from "./money.js";

describe("money", () => {
  it("knows currency exponents", () => {
    expect(currencyExponent("USD")).toBe(2);
    expect(currencyExponent("JPY")).toBe(0);
    expect(currencyExponent("KWD")).toBe(3);
  });

  it.each([
    ["12", "USD", 1200],
    ["12.5", "USD", 1250],
    ["12.34", "USD", 1234],
    ["0.1", "USD", 10],
    [".99", "USD", 99],
    ["1,234.50", "USD", 123450],
    ["19.99", "EUR", 1999],
    ["500", "JPY", 500],
    ["1.234", "KWD", 1234],
  ])("parses %s %s → %d", (input, cur, out) => expect(parseMoneyToMinor(input, cur)).toBe(out));

  it("avoids float rounding (0.1 + 0.2 class bugs)", () => {
    expect(parseMoneyToMinor("1.15", "USD")).toBe(115);
    expect(parseMoneyToMinor("4.35", "USD")).toBe(435);
  });

  it("rejects invalid input", () => {
    for (const bad of ["abc", "-1", "1.234", "1e3", "12.3.4"])
      expect(parseMoneyToMinor(bad, "USD")).toBeNaN();
    expect(parseMoneyToMinor("1.5", "JPY")).toBeNaN();
    expect(parseMoneyToMinor("", "USD")).toBeNull();
  });

  it("round-trips to decimal strings and formats", () => {
    expect(minorToDecimalString(5, "USD")).toBe("0.05");
    expect(minorToDecimalString(123450, "USD")).toBe("1234.50");
    expect(minorToDecimalString(500, "JPY")).toBe("500");
    expect(minorToDecimalString(null, "USD")).toBe("");
    expect(formatMoney(1234, "USD", "en-US")).toBe("$12.34");
  });
});
