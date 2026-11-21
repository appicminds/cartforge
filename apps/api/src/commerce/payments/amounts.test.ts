import { describe, expect, it } from "vitest";
import { fromUnits, stripeDigits, toMajor, toUnits } from "./amounts";

describe("amount conversion", () => {
  it("converts between CartForge minor units and gateway units", () => {
    expect(toMajor(1234, "USD")).toBe(12.34);
    expect(toMajor(3750, "PKR")).toBe(3750); // whole rupees
    expect(toUnits(3750, "PKR", 2)).toBe(375000); // JazzCash paisa
    expect(fromUnits(375000, "PKR", 2)).toBe(3750);
    expect(toUnits(1234, "USD", stripeDigits("USD"))).toBe(1234);
    expect(toUnits(4800, "JPY", stripeDigits("JPY"))).toBe(4800);
    expect(toUnits(3750, "PKR", stripeDigits("PKR"))).toBe(375000);
  });
});
