import { z } from "zod";
import { emailSchema } from "@cartforge/checkout-engine";
import { paginationQuerySchema } from "./common.js";

/** Subdomain labels that would collide with platform services. */
export const RESERVED_HANDLES = new Set([
  "www",
  "admin",
  "api",
  "app",
  "apps",
  "assets",
  "auth",
  "billing",
  "blog",
  "cdn",
  "dashboard",
  "dev",
  "docs",
  "help",
  "login",
  "mail",
  "my",
  "platform",
  "root",
  "shop",
  "shops",
  "signup",
  "static",
  "status",
  "store",
  "stores",
  "support",
  "test",
  "cartforge",
]);

export const storeHandleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])$/,
    "Use 3–63 lowercase letters, numbers or hyphens (not at the start or end)",
  )
  .refine((h) => !h.includes("--"), "Don't use two hyphens in a row")
  .refine((h) => !RESERVED_HANDLES.has(h), "This address is reserved");

/** "Northwind Goods!" → "northwind-goods" (may still need a uniqueness suffix). */
export function handleFromName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
  const h = base.length >= 3 ? base : `${base || "store"}-shop`.replace(/^-/, "");
  return RESERVED_HANDLES.has(h) ? `${h}-shop` : h;
}

const currency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Choose a currency");

export const storeCreateSchema = z
  .object({
    store_name: z.string().trim().min(2, "Enter your store name").max(80),
    /** Optional; generated from the name when omitted. */
    handle: storeHandleSchema.optional(),
    currency: currency.default("USD"),
  })
  .strict();
export type StoreCreate = z.output<typeof storeCreateSchema>;

export const signupSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name").max(120),
    email: emailSchema,
    password: z
      .string()
      .min(12, "Use at least 12 characters")
      .max(200)
      .refine(
        (p) => /[a-zA-Z]/.test(p) && /[^a-zA-Z]/.test(p),
        "Mix letters with numbers or symbols",
      ),
    store_name: z.string().trim().min(2, "Enter your store name").max(80),
    handle: storeHandleSchema.optional(),
    currency: currency.default("USD"),
  })
  .strict();
export type SignupInput = z.input<typeof signupSchema>;
export type Signup = z.output<typeof signupSchema>;

export const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) =>
    v
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/\.$/, ""),
  )
  .pipe(
    z
      .string()
      .max(253)
      .regex(
        /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
        "Enter a domain like shop.example.com",
      ),
  );

export const domainAddSchema = z.object({ hostname: hostnameSchema }).strict();

export const platformStoreListSchema = paginationQuerySchema.extend({
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || undefined),
  status: z.enum(["active", "suspended"]).optional(),
});
export type PlatformStoreListQuery = z.output<typeof platformStoreListSchema>;

export const platformStoreUpdateSchema = z
  .object({
    status: z.enum(["active", "suspended"]),
    reason: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((v) => v.status !== "suspended" || !!v.reason, {
    message: "Give a reason for the suspension",
    path: ["reason"],
  });
export type PlatformStoreUpdate = z.output<typeof platformStoreUpdateSchema>;
