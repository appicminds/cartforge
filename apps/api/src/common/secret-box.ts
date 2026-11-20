import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for small secrets at rest (APP_ENCRYPTION_KEY, 32 bytes base64).
 * Format: "v1.<iv>.<tag>.<ciphertext>" (base64url), so the scheme can change later.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, "base64");
    if (this.key.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be 32 bytes");
  }

  seal(plain: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", this.key, iv);
    const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
    return ["v1", iv, c.getAuthTag(), body]
      .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
      .join(".");
  }

  open(sealed: string): string {
    const [v, iv, tag, body] = sealed.split(".");
    if (v !== "v1" || !iv || !tag || body === undefined) throw new Error("Unknown secret format");
    const d = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
  }
}
