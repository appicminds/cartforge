import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * CSRF token bound to the session: HMAC(secret, sessionToken). A token from one
 * session is useless with another, and an attacker cannot fixate it.
 */
export function deriveCsrfToken(secret: string, sessionToken: string): string {
  return createHmac("sha256", secret).update(`csrf:${sessionToken}`).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
