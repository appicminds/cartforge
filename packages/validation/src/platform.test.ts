import { describe, expect, it } from "vitest";
import { handleFromName, hostnameSchema, signupSchema, storeHandleSchema } from "./platform";

describe("platform validation", () => {
  it("derives store handles from names", () => {
    expect(handleFromName("Northwind Goods!")).toBe("northwind-goods");
    expect(handleFromName("Café Crème")).toBe("cafe-creme");
    expect(handleFromName("A")).toBe("a-shop");
    expect(handleFromName("Shop")).toBe("shop-shop");
    expect(handleFromName("x".repeat(80))).toHaveLength(50);
  });

  it("accepts only safe, unreserved subdomain labels", () => {
    expect(storeHandleSchema.safeParse("north-wind").success).toBe(true);
    for (const bad of ["ab", "-north", "north-", "no--rth", "www", "admin", "UPPER_case", "a.b"])
      expect(storeHandleSchema.safeParse(bad).success, bad).toBe(false);
  });

  it("normalizes domains and rejects junk", () => {
    expect(hostnameSchema.parse("https://Shop.Example.com/path")).toBe("shop.example.com");
    for (const bad of ["localhost", "shop", "-a.com", "a..com", "exa mple.com"])
      expect(hostnameSchema.safeParse(bad).success, bad).toBe(false);
  });

  it("requires a strong-enough password and valid email on sign-up", () => {
    const ok = {
      name: "Ada",
      email: "ADA@example.com",
      password: "correct horse 9",
      store_name: "Ada's",
    };
    expect(signupSchema.parse(ok)).toMatchObject({ email: "ada@example.com", currency: "USD" });
    expect(signupSchema.safeParse({ ...ok, password: "short1" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...ok, password: "onlylettersheretoo" }).success).toBe(false);
  });
});
