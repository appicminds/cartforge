import { describe, expect, it } from "vitest";
import { EnvValidationError, loadApiEnv } from "./env.js";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  ADMIN_ORIGIN: "http://localhost:3000",
  SESSION_SECRET: "x".repeat(40),
  APP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
};

describe("loadApiEnv", () => {
  it("applies defaults", () => {
    const env = loadApiEnv(valid);
    expect(env.API_PORT).toBe(4000);
    expect(env.COOKIE_SECURE).toBe(false);
  });

  it("forces secure cookies in production by default", () => {
    expect(loadApiEnv({ ...valid, NODE_ENV: "production" }).COOKIE_SECURE).toBe(true);
  });

  it("fails fast without leaking secret values", () => {
    try {
      loadApiEnv({ ...valid, SESSION_SECRET: "short-secret-value" });
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EnvValidationError);
      expect((e as Error).message).toContain("SESSION_SECRET");
      expect((e as Error).message).not.toContain("short-secret-value");
    }
  });

  it("accepts a comma-separated list of admin origins", () => {
    const env = loadApiEnv({
      ...valid,
      ADMIN_ORIGIN: "https://a.example.com/, https://b.example.com",
    });
    expect(env.ADMIN_ORIGIN).toEqual(["https://a.example.com", "https://b.example.com"]);
    expect(() => loadApiEnv({ ...valid, ADMIN_ORIGIN: "not a url" })).toThrow(EnvValidationError);
  });

  it("falls back to KV_URL for Redis", () => {
    const { REDIS_URL: _omit, ...rest } = valid;
    expect(
      loadApiEnv({ ...rest, KV_URL: "rediss://default:x@host.upstash.io:6379" }).REDIS_URL,
    ).toBe("rediss://default:x@host.upstash.io:6379");
  });

  it("validates storage driver settings", () => {
    expect(loadApiEnv(valid).STORAGE_DRIVER).toBe("local");
    expect(() => loadApiEnv({ ...valid, STORAGE_DRIVER: "s3" })).toThrow(/S3_BUCKET/);
    expect(() => loadApiEnv({ ...valid, STORAGE_DRIVER: "vercel-blob" })).toThrow(
      /BLOB_READ_WRITE_TOKEN/,
    );
    expect(
      loadApiEnv({ ...valid, STORAGE_DRIVER: "vercel-blob", BLOB_READ_WRITE_TOKEN: "x" })
        .STORAGE_DRIVER,
    ).toBe("vercel-blob");
  });

  it("rejects a wrong-length encryption key", () => {
    expect(() => loadApiEnv({ ...valid, APP_ENCRYPTION_KEY: "abc" })).toThrow(EnvValidationError);
  });
});
