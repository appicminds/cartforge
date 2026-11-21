import { z } from "zod";
import { addressSchema } from "@cartforge/checkout-engine";
import { newPasswordSchema } from "./auth.js";
import { paginationQuerySchema } from "./common.js";

const name = z
  .string()
  .trim()
  .max(100)
  .nullish()
  .transform((v) => (v === undefined ? undefined : v || null));
const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

export const customerListQuerySchema = paginationQuerySchema.extend({
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || undefined),
  sort: z.enum(["created_at", "last_order_at", "total_spent"]).default("created_at"),
});
export type CustomerListQuery = z.output<typeof customerListQuerySchema>;

/** Staff edits (admin). */
export const customerUpdateSchema = z
  .object({
    first_name: name,
    last_name: name,
    phone: z
      .string()
      .trim()
      .max(30)
      .nullish()
      .transform((v) => (v === undefined ? undefined : v || null)),
    note: z
      .string()
      .trim()
      .max(2000)
      .nullish()
      .transform((v) => (v === undefined ? undefined : v || null)),
    tags: z
      .array(z.string().trim().min(1).max(40))
      .max(30)
      .transform((t) => [...new Set(t)])
      .optional(),
    accepts_marketing: z.boolean().optional(),
  })
  .strict();
export type CustomerUpdate = z.output<typeof customerUpdateSchema>;

// ───────────── Storefront accounts ─────────────

export const customerRegisterSchema = z
  .object({
    email,
    password: newPasswordSchema,
    first_name: name,
    last_name: name,
    accepts_marketing: z.boolean().default(false),
  })
  .strict();
export type CustomerRegister = z.output<typeof customerRegisterSchema>;

export const customerLoginSchema = z
  .object({ email, password: z.string().min(1, "Enter your password").max(1024) })
  .strict();
export type CustomerLogin = z.output<typeof customerLoginSchema>;

export const customerForgotSchema = z.object({ email }).strict();
export const customerResetSchema = z
  .object({ token: z.string().min(20).max(200), password: newPasswordSchema })
  .strict();
export type CustomerReset = z.output<typeof customerResetSchema>;

/** The shopper edits their own profile. */
export const customerProfileSchema = z
  .object({
    first_name: name,
    last_name: name,
    phone: z
      .string()
      .trim()
      .max(30)
      .nullish()
      .transform((v) => (v === undefined ? undefined : v || null)),
    accepts_marketing: z.boolean().optional(),
  })
  .strict();
export type CustomerProfile = z.output<typeof customerProfileSchema>;

export const customerAddressSchema = z
  .object({ address: addressSchema, is_default: z.boolean().default(false) })
  .strict();
export type CustomerAddressInput = z.output<typeof customerAddressSchema>;
