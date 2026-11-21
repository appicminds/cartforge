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
  /** Next 7: one customer's orders. */
  customer_id: z.string().uuid().optional(),
  /** "true": orders with items still to ship (not canceled). */
  to_ship: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});
export type OrderListQuery = z.output<typeof orderListQuerySchema>;

export {
  checkoutSettingsSchema,
  shippingMethodFields,
  shippingMethodSchema,
  type CheckoutSettings,
  type CheckoutSettingsInput,
  type ShippingMethodInput,
} from "@cartforge/checkout-engine";

// ───────────── Order processing (Next 6) ─────────────

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

export const orderMarkPaidSchema = z.object({ reference: optionalText(200) }).strict();
export type OrderMarkPaid = z.output<typeof orderMarkPaidSchema>;

const lineQty = z.object({
  order_item_id: z.string().uuid(),
  quantity: z.number().int().min(1, "At least 1").max(1_000_000),
});

export const fulfillmentCreateSchema = z
  .object({
    /** Omitted = everything still to ship. */
    items: z.array(lineQty).min(1, "Choose at least one item").max(500).optional(),
    tracking_company: optionalText(80),
    tracking_number: optionalText(120),
    tracking_url: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => v || undefined)
      .pipe(
        z
          .string()
          .url("Enter a full link starting with https://")
          .regex(/^https?:\/\//, "Enter a full link starting with https://")
          .optional(),
      ),
    notify_customer: z.boolean().default(true),
  })
  .strict();
export type FulfillmentCreate = z.output<typeof fulfillmentCreateSchema>;
export type FulfillmentCreateInput = z.input<typeof fulfillmentCreateSchema>;

export const orderCancelSchema = z
  .object({
    reason: z.enum(["customer", "inventory", "fraud", "declined", "other"]),
    restock: z.boolean().default(true),
    /** Required when the order is paid: give the money back as part of cancelling. */
    refund: z.boolean().default(false),
    notify_customer: z.boolean().default(true),
  })
  .strict();
export type OrderCancel = z.output<typeof orderCancelSchema>;
export type OrderCancelInput = z.input<typeof orderCancelSchema>;

export const refundCreateSchema = z
  .object({
    items: z
      .array(lineQty.extend({ restock: z.boolean().default(false) }))
      .max(500)
      .default([]),
    amount_minor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    reason: optionalText(500),
    notify_customer: z.boolean().default(true),
    /**
     * Send the money back through the payment provider (Stripe…). Omitted: automatic when the
     * order was paid online with a provider that supports refunds. false: record a manual refund.
     */
    through_provider: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.amount_minor > 0 || v.items.length > 0, {
    message: "Refund an amount or at least one item",
    path: ["amount_minor"],
  });
export type RefundCreate = z.output<typeof refundCreateSchema>;
export type RefundCreateInput = z.input<typeof refundCreateSchema>;

export const orderNoteSchema = z
  .object({ message: z.string().trim().min(1, "Write a note").max(500) })
  .strict();
export type OrderNote = z.output<typeof orderNoteSchema>;

// ───────────── Payment Hub (Next 5) ─────────────

export const paymentAccountSchema = z
  .object({
    mode: z.enum(["test", "live"]),
    enabled: z.boolean(),
    /** Only the values being set or changed; an omitted or empty secret keeps the saved one. */
    credentials: z.record(z.string().max(100), z.string().trim().max(2000)).default({}),
  })
  .strict();
export type PaymentAccountInput = z.input<typeof paymentAccountSchema>;
export type PaymentAccountUpdate = z.output<typeof paymentAccountSchema>;
