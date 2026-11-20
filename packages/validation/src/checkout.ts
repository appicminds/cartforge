import { z } from "zod";
import { addressSchema, emailSchema, PHONE_RE } from "@cartforge/checkout-engine";
import { paginationQuerySchema, uuidSchema } from "./common.js";

export const MAX_LINE_QUANTITY = 99;

export const cartLineAddSchema = z
  .object({
    variant_id: uuidSchema,
    quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY).default(1),
  })
  .strict();
export type CartLineAdd = z.output<typeof cartLineAddSchema>;

export const cartLineUpdateSchema = z
  .object({ quantity: z.number().int().min(0).max(MAX_LINE_QUANTITY) })
  .strict();

/** Each checkout step sends what it collects; completion re-validates everything. */
export const checkoutUpdateSchema = z
  .object({
    email: emailSchema.optional(),
    phone: z
      .string()
      .trim()
      .max(30)
      .refine((v) => v === "" || PHONE_RE.test(v), "Enter a valid phone number")
      .transform((v) => v || null)
      .nullish(),
    shipping_address: addressSchema.optional(),
    billing_same_as_shipping: z.boolean().optional(),
    billing_address: addressSchema.nullish(),
    shipping_method_id: uuidSchema.nullish(),
    payment_method: z.string().max(40).nullish(),
    custom_fields: z
      .record(z.string().max(40), z.union([z.string().max(2000), z.boolean()]))
      .optional(),
    terms_accepted: z.boolean().optional(),
  })
  .strict();
export type CheckoutUpdate = z.output<typeof checkoutUpdateSchema>;
export type CheckoutUpdateInput = z.input<typeof checkoutUpdateSchema>;

export const checkoutCompleteSchema = z
  .object({
    /** The total the shopper saw; a different server total stops the order (CHECKOUT_CHANGED). */
    expected_total_minor: z.number().int().min(0).optional(),
  })
  .strict();

export const orderListQuerySchema = paginationQuerySchema.extend({
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || undefined),
  status: z
    .enum(["pending", "processing", "on_hold", "completed", "canceled", "refunded"])
    .optional(),
  payment_status: z
    .enum(["pending", "authorized", "paid", "partially_refunded", "refunded", "voided", "failed"])
    .optional(),
});
export type OrderListQuery = z.output<typeof orderListQuerySchema>;

export {
  checkoutSettingsSchema,
  shippingMethodSchema,
  type CheckoutSettings,
  type CheckoutSettingsInput,
  type ShippingMethodInput,
} from "@cartforge/checkout-engine";
