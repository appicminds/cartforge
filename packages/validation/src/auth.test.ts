import { describe, expect, it } from "vitest";
import { loginSchema } from "./auth.js";
import { paginationQuerySchema, requiredText } from "./common.js";

describe("loginSchema", () => {
  it("normalizes email", () => {
    expect(loginSchema.parse({ email: "  Owner@Example.COM ", password: "x" }).email).toBe(
      "owner@example.com",
    );
  });
  it("rejects invalid email and empty password", () => {
    const r = loginSchema.safeParse({ email: "nope", password: "" });
    expect(r.success).toBe(false);
  });
});

describe("common", () => {
  it("rejects whitespace-only required text", () => {
    expect(requiredText(200).safeParse("   ").success).toBe(false);
  });
  it("applies pagination defaults and bounds", () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, page_size: 25 });
    expect(paginationQuerySchema.safeParse({ page_size: 500 }).success).toBe(false);
  });
});
