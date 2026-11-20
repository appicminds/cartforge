import { createHmac, timingSafeEqual } from "node:crypto";

/** Draft previews are short-lived links an authorized staff member can share. */
export const PREVIEW_TTL_SECONDS = 60 * 60;

interface Claims {
  /** store id */
  s: string;
  /** product id */
  p: string;
  /** expiry, unix seconds */
  e: number;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/**
 * Stateless signed token `<claims>.<hmac>`. The key is derived from SESSION_SECRET
 * with a purpose label, so a preview token can never be confused with a session
 * or CSRF value, and rotating SESSION_SECRET revokes every outstanding link.
 */
export class PreviewTokens {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = createHmac("sha256", secret).update("cartforge:preview:v1").digest();
  }

  sign(storeId: string, productId: string, now = Date.now()): { token: string; expires: Date } {
    const e = Math.floor(now / 1000) + PREVIEW_TTL_SECONDS;
    const body = b64(JSON.stringify({ s: storeId, p: productId, e } satisfies Claims));
    return { token: `${body}.${this.mac(body)}`, expires: new Date(e * 1000) };
  }

  /** The product id when the token is genuine, unexpired and for this store; otherwise null. */
  verify(token: string, storeId: string, now = Date.now()): string | null {
    const [body, sig, extra] = token.split(".");
    if (!body || !sig || extra !== undefined) return null;
    const want = Buffer.from(this.mac(body));
    const got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    try {
      const c = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<Claims>;
      if (typeof c.s !== "string" || typeof c.p !== "string" || typeof c.e !== "number")
        return null;
      if (c.s !== storeId || c.e * 1000 <= now) return null;
      return c.p;
    } catch {
      return null;
    }
  }

  private mac(body: string): string {
    return createHmac("sha256", this.key).update(body).digest("base64url");
  }
}
