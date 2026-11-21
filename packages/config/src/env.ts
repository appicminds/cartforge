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

    // ── Platform / editions (P1) ──
    /**
     * "saas": you host many merchants (public sign-up, store subdomains).
     * "self_hosted": a merchant runs their own installation (PRD default).
     */
    CARTFORGE_EDITION: z.enum(["saas", "self_hosted"]).default("self_hosted"),
    /** Public "create your store" sign-up. Defaults to on for SaaS, off for self-hosted. */
    SIGNUP_ENABLED: bool.optional(),
    /** Stores get <handle>.<PLATFORM_DOMAIN> automatically, e.g. "myshops.com". */
    PLATFORM_DOMAIN: z
      .string()
      .regex(
        /^(?=.{3,200}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i,
        "PLATFORM_DOMAIN must be a hostname like shops.example.com",
      )
      .transform((v) => v.toLowerCase())
      .optional(),
    /** Hostname merchants point custom domains at (CNAME). Defaults to PLATFORM_DOMAIN. */
    PLATFORM_CNAME_TARGET: z.string().min(3).max(200).optional(),
    /** How verified custom domains get routed + HTTPS: "none" (reverse proxy asks /platform/domains/tls-check) or "vercel". */
    DOMAIN_PROVIDER: z.enum(["none", "vercel"]).default("none"),
    VERCEL_API_TOKEN: z.string().optional(),
    VERCEL_STOREFRONT_PROJECT: z.string().optional(),
    VERCEL_TEAM_ID: z.string().optional(),

    // ── Markets: live exchange rates ──
    /** "none": merchants set their own rates · "openexchangerates": daily live rates. */
    FX_PROVIDER: z.enum(["none", "openexchangerates"]).default("none"),
    /** App ID from openexchangerates.org (free plan is enough). */
    FX_API_KEY: z.string().optional(),

    // ── Email (password reset) ──
    /** "log": no email is sent (development prints the link) · "resend": send through Resend. */
    EMAIL_PROVIDER: z.enum(["log", "resend"]).default("log"),
    RESEND_API_KEY: z.string().optional(),
    /** Sender, e.g. "CartForge <no-reply@example.com>" (a domain verified with the provider). */
    EMAIL_FROM: z.string().min(3).max(200).optional(),
    /** Public admin URL used in emailed links. Defaults to the first ADMIN_ORIGIN. */
    ADMIN_URL: z
      .string()
      .url()
      .transform((v) => v.replace(/\/+$/, ""))
      .optional(),

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
    if (env.DOMAIN_PROVIDER === "vercel") {
      need("VERCEL_API_TOKEN", "when DOMAIN_PROVIDER=vercel");
      need("VERCEL_STOREFRONT_PROJECT", "when DOMAIN_PROVIDER=vercel");
    }
    if (env.STOREFRONT_REVALIDATE_URL)
      need("STOREFRONT_REVALIDATE_SECRET", "when STOREFRONT_REVALIDATE_URL is set");
    if (env.FX_PROVIDER === "openexchangerates")
      need("FX_API_KEY", "when FX_PROVIDER=openexchangerates");
    if (env.EMAIL_PROVIDER === "resend") {
      need("RESEND_API_KEY", "when EMAIL_PROVIDER=resend");
      need("EMAIL_FROM", "when EMAIL_PROVIDER=resend");
    }
    if (env.STORAGE_DRIVER === "vercel-blob")
      need("BLOB_READ_WRITE_TOKEN", "when STORAGE_DRIVER=vercel-blob");
  });
export type ApiEnv = z.infer<typeof apiEnvSchema> & {
  COOKIE_SECURE: boolean;
  SIGNUP_ENABLED: boolean;
};

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
  return {
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === "production",
    SIGNUP_ENABLED: env.SIGNUP_ENABLED ?? env.CARTFORGE_EDITION === "saas",
  };
}

export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  return parse(workerEnvSchema, withRedisFallback(source));
}
