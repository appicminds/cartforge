import { z } from "zod";

const bool = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

export const apiEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    /**
     * Origin(s) the admin is served from, comma-separated (e.g. production and a
     * staging domain). Used for CORS and the CSRF Origin check. No trailing slash.
     */
    ADMIN_ORIGIN: z
      .string()
      .transform((v) =>
        v
          .split(",")
          .map((o) => o.trim().replace(/\/+$/, ""))
          .filter(Boolean),
      )
      .pipe(
        z
          .array(z.string().url("ADMIN_ORIGIN entries must be URLs like https://admin.example.com"))
          .min(1),
      ),
    SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
    SESSION_TTL_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 90)
      .default(168),
    APP_ENCRYPTION_KEY: z
      .string()
      .refine(
        (v) => Buffer.from(v, "base64").length === 32,
        "APP_ENCRYPTION_KEY must be 32 bytes, base64-encoded",
      ),
    COOKIE_SECURE: bool.optional(),

    // ── Media storage (PRD §8.4 B, §10) ──
    STORAGE_DRIVER: z.enum(["local", "s3", "vercel-blob"]).default("local"),
    STORAGE_LOCAL_PATH: z.string().default("./storage"),
    S3_ENDPOINT: z.string().url().optional(),
    S3_REGION: z.string().default("auto"),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY: z.string().optional(),
    S3_SECRET_KEY: z.string().optional(),
    /** Public base URL objects are served from (bucket URL or CDN), no trailing slash. */
    S3_PUBLIC_BASE_URL: z.string().url().optional(),
    S3_FORCE_PATH_STYLE: bool.optional(),
    BLOB_READ_WRITE_TOKEN: z.string().optional(),
    /** Max upload size. Vercel Functions cap request bodies at 4.5 MB, so use ≤ 4 MB there. */
    MEDIA_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(100 * 1024 * 1024)
      .default(10 * 1024 * 1024),

    // ── Storefront (Next 2) ──
    /** Public storefront URL (no trailing slash); used to build preview links. */
    STOREFRONT_URL: z
      .string()
      .url()
      .transform((v) => v.replace(/\/+$/, ""))
      .optional(),
    /**
     * Where to tell the storefront that catalog data changed (PRD §8.8 #10),
     * e.g. https://shop.example.com/api/revalidate. Unset = rely on the storefront's
     * time-based revalidation only.
     */
    STOREFRONT_REVALIDATE_URL: z.string().url().optional(),
    STOREFRONT_REVALIDATE_SECRET: z.string().min(24).optional(),
  })
  .superRefine((env, ctx) => {
    const need = (key: keyof typeof env, why: string) => {
      if (!env[key])
        ctx.addIssue({ code: "custom", path: [key], message: `${key} is required ${why}` });
    };
    if (env.STORAGE_DRIVER === "s3") {
      for (const k of [
        "S3_BUCKET",
        "S3_ACCESS_KEY",
        "S3_SECRET_KEY",
        "S3_PUBLIC_BASE_URL",
      ] as const) {
        need(k, "when STORAGE_DRIVER=s3");
      }
    }
    if (env.STOREFRONT_REVALIDATE_URL)
      need("STOREFRONT_REVALIDATE_SECRET", "when STOREFRONT_REVALIDATE_URL is set");
    if (env.STORAGE_DRIVER === "vercel-blob")
      need("BLOB_READ_WRITE_TOKEN", "when STORAGE_DRIVER=vercel-blob");
  });
export type ApiEnv = z.infer<typeof apiEnvSchema> & { COOKIE_SECURE: boolean };

export const workerEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
});
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join("\n  - ")}`);
    this.name = "EnvValidationError";
  }
}

function parse<T extends z.ZodTypeAny>(schema: T, source: NodeJS.ProcessEnv): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    // Report variable names and reasons only — never values (may be secrets).
    throw new EnvValidationError(
      result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    );
  }
  return result.data;
}

/**
 * Hosted Redis integrations (e.g. Upstash via the Vercel Marketplace) expose the
 * connection string as KV_URL; accept it when REDIS_URL isn't set.
 */
function withRedisFallback(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return source.REDIS_URL || !source.KV_URL ? source : { ...source, REDIS_URL: source.KV_URL };
}

export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  const env = parse(apiEnvSchema, withRedisFallback(source));
  return { ...env, COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === "production" };
}

export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  return parse(workerEnvSchema, withRedisFallback(source));
}
