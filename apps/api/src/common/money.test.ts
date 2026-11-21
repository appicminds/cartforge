import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";

describe("formatMoney", () => {
  it("uses each currency's decimals", () => {
    expect(formatMoney(4800, "USD")).toBe("$48.00");
    expect(formatMoney(4800, "JPY")).toBe("¥4,800");
    expect(formatMoney(1500, "KWD")).toMatch(/1\.500/);
    expect(formatMoney(549900n, "EUR", "de-DE")).toBe("5.499,00\u00a0€");
  });
});
