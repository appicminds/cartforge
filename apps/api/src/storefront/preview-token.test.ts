import { describe, expect, it } from "vitest";
import { PREVIEW_TTL_SECONDS, PreviewTokens } from "./preview-token";

const STORE = "00000000-0000-4000-8000-000000000001";
const PRODUCT = "11111111-1111-4111-8111-111111111111";
const tokens = new PreviewTokens("x".repeat(48));

describe("preview tokens", () => {
  it("round-trips for the same store", () => {
    const { token } = tokens.sign(STORE, PRODUCT);
    expect(tokens.verify(token, STORE)).toBe(PRODUCT);
  });

  it("rejects another store, expiry, tampering and another secret", () => {
    const now = Date.now();
    const { token } = tokens.sign(STORE, PRODUCT, now);
    expect(tokens.verify(token, "00000000-0000-4000-8000-000000000002", now)).toBeNull();
    expect(tokens.verify(token, STORE, now + PREVIEW_TTL_SECONDS * 1000 + 1)).toBeNull();
    const [body, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ s: STORE, p: "22222222-2222-4222-8222-222222222222", e: 9e9 }),
    ).toString("base64url");
    expect(tokens.verify(`${forged}.${sig}`, STORE, now)).toBeNull();
    expect(tokens.verify(`${body}.${sig}x`, STORE, now)).toBeNull();
    expect(tokens.verify(`${body}.${sig}.x`, STORE, now)).toBeNull();
    expect(new PreviewTokens("y".repeat(48)).verify(token, STORE, now)).toBeNull();
    expect(tokens.verify("garbage", STORE, now)).toBeNull();
  });
});
