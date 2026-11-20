import { describe, expect, it } from "vitest";
import { SecretBox } from "../common/secret-box";
import { base32Decode, base32Encode, hotp, newRecoveryCodes, otpauthUrl, verifyTotp } from "./totp";

// RFC 6238 appendix B, SHA-1 seed "12345678901234567890".
const SEED = Buffer.from("12345678901234567890");

describe("TOTP", () => {
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
  ])("RFC 6238 vector at %i s", (t, code) => {
    expect(hotp(SEED, BigInt(Math.floor(t / 30)), 8)).toBe(code);
  });

  it("round-trips base32", () => {
    expect(base32Encode(SEED)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ").equals(SEED)).toBe(true);
  });

  it("accepts the current code ±1 step, once", () => {
    const secret = base32Encode(SEED);
    const now = 1_700_000_000_000;
    const code = hotp(SEED, BigInt(Math.floor(now / 30000)));
    const step = verifyTotp(secret, code, now);
    expect(step).not.toBeNull();
    expect(verifyTotp(secret, code, now + 30_000)).toBe(step); // drift
    expect(verifyTotp(secret, code, now + 90_000)).toBeNull(); // too late
    expect(verifyTotp(secret, code, now, step)).toBeNull(); // replay
    expect(verifyTotp(secret, "12345", now)).toBeNull();
  });

  it("builds an authenticator URL and readable recovery codes", () => {
    expect(otpauthUrl("ABC", "pat@example.com")).toBe(
      "otpauth://totp/CartForge%3Apat%40example.com?secret=ABC&issuer=CartForge&algorithm=SHA1&digits=6&period=30",
    );
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
  });
});

describe("SecretBox", () => {
  const box = new SecretBox(Buffer.alloc(32, 7).toString("base64"));
  it("encrypts and decrypts, and detects tampering", () => {
    const sealed = box.seal("JBSWY3DPEHPK3PXP");
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain("JBSWY3DP");
    expect(box.open(sealed)).toBe("JBSWY3DPEHPK3PXP");
    const parts = sealed.split(".");
    parts[3] = parts[3]!.slice(0, -2) + (parts[3]!.endsWith("A") ? "BB" : "AA");
    expect(() => box.open(parts.join("."))).toThrow();
  });
});
