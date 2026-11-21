import { z } from "zod";

const target = z
  .object({
    all: z.boolean().default(false),
    product_ids: z.array(z.string().uuid()).max(500).default([]),
    collection_ids: z.array(z.string().uuid()).max(100).default([]),
  })
  .strict();

/** Add or edit a discount (Discounts in the admin). Amounts are in the store currency. */
export const discountSchema = z
  .object({
    title: z.string().trim().min(1, "Enter a title").max(120),
    method: z.enum(["code", "automatic"]),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .max(40)
      .regex(/^[A-Z0-9_-]*$/, "Letters, numbers, - and _ only")
      .nullable()
      .default(null),
    kind: z.enum(["order", "products", "bxgy", "shipping"]),
    value_type: z.enum(["percent", "fixed"]).default("percent"),
    /** percent: basis points (1000 = 10%); fixed: store-currency minor units. */
    value: z.number().int().min(0).max(1e12).default(0),
    target: target.default({ all: true, product_ids: [], collection_ids: [] }),
    buy: z
      .object({
        quantity: z.number().int().min(1).max(100),
        target,
        get_quantity: z.number().int().min(1).max(100),
        max_uses: z.number().int().min(1).max(100).nullable().default(null),
      })
      .strict()
      .nullable()
      .default(null),
    min_subtotal_minor: z.number().int().min(0).max(1e12).nullable().default(null),
    min_quantity: z.number().int().min(1).max(10_000).nullable().default(null),
    starts_at: z.coerce.date().optional(),
    ends_at: z.coerce.date().nullable().default(null),
    usage_limit: z.number().int().min(1).max(1e9).nullable().default(null),
    once_per_customer: z.boolean().default(false),
    combines: z.boolean().default(false),
    market_ids: z.array(z.string().uuid()).max(50).default([]),
    enabled: z.boolean().default(true),
  })
  .strict()
  .superRefine((d, ctx) => {
    const add = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (d.method === "code" && (!d.code || d.code.length < 3))
      add("code", "Enter a code of at least 3 characters");
    if (d.kind !== "shipping") {
      if (d.value <= 0) add("value", "Enter a discount above 0");
      if (d.value_type === "percent" && d.value > 10_000) add("value", "At most 100%");
    }
    const empty = (t: z.output<typeof target>) =>
      !t.all && !t.product_ids.length && !t.collection_ids.length;
    if ((d.kind === "products" || d.kind === "bxgy") && empty(d.target))
      add("target", "Choose products or collections, or all products");
    if (d.kind === "bxgy") {
      if (!d.buy) add("buy", "Set what customers buy");
      else if (empty(d.buy.target)) add("buy", "Choose what customers buy");
    }
    if (d.starts_at && d.ends_at && d.ends_at <= d.starts_at)
      add("ends_at", "Must be after the start");
  });
export type DiscountInput = z.input<typeof discountSchema>;
export type DiscountData = z.output<typeof discountSchema>;

export const discountListQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  status: z.enum(["active", "scheduled", "expired", "disabled", "used_up"]).optional(),
});
