import { z } from "zod";
import { paginationQuerySchema, uuidSchema } from "./common.js";
import { moneyMinorSchema } from "./money.js";

export const MAX_OPTIONS = 3;
export const MAX_OPTION_VALUES = 50;
export const MAX_VARIANTS = 100;

const optionText = (max: number, what: string) =>
  z.string().trim().min(1, `${what} is required`).max(max, `Must be ${max} characters or fewer`);

export const productOptionInputSchema = z.object({
  name: optionText(60, "Option name"),
  values: z
    .array(optionText(80, "Value"))
    .min(1, "Add at least one value")
    .max(MAX_OPTION_VALUES, `Up to ${MAX_OPTION_VALUES} values per option`)
    .refine((v) => new Set(v.map((x) => x.toLowerCase())).size === v.length, {
      message: "Values must be unique",
    }),
});

export const productOptionsSchema = z
  .array(productOptionInputSchema)
  .max(MAX_OPTIONS, `Up to ${MAX_OPTIONS} options`)
  .refine((o) => new Set(o.map((x) => x.name.toLowerCase())).size === o.length, {
    message: "Option names must be unique",
  })
  .refine((o) => o.reduce((n, x) => n * x.values.length, o.length ? 1 : 0) <= MAX_VARIANTS, {
    message: `These options create more than ${MAX_VARIANTS} variants`,
  });
export type ProductOptionsInput = z.output<typeof productOptionsSchema>;

export const productOptionsApplySchema = z
  .object({
    options: productOptionsSchema,
    /** Required when the change would delete existing variants (PRD §8.4 F). */
    confirm_removals: z.boolean().optional(),
  })
  .strict();
export type ProductOptionsApply = z.output<typeof productOptionsApplySchema>;

export const productOptionsPreviewSchema = z.object({ options: productOptionsSchema }).strict();

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v || null));

export const thresholdSchema = z
  .number()
  .int("Whole numbers only")
  .min(0, "Can't be negative")
  .max(1_000_000);

/** Per-variant fields; also accepted on a simple product (applied to its default variant). */
export const variantFieldsSchema = {
  sku: nullableText(100),
  barcode: nullableText(100),
  price_minor: moneyMinorSchema.nullable().optional(),
  compare_at_minor: moneyMinorSchema.nullable().optional(),
  cost_minor: moneyMinorSchema.nullable().optional(),
  inventory_tracking: z.boolean().optional(),
  continue_selling: z.boolean().optional(),
  low_stock_threshold: thresholdSchema.nullable().optional(),
};

const compareAtOk = (v: { price_minor?: number | null; compare_at_minor?: number | null }) =>
  v.compare_at_minor == null || v.price_minor == null || v.compare_at_minor > v.price_minor;

export const variantUpdateSchema = z
  .object({ ...variantFieldsSchema, media_asset_id: uuidSchema.nullable().optional() })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Provide at least one field to update",
  })
  .refine(compareAtOk, {
    message: "Compare-at price must be higher than the price",
    path: ["compare_at_minor"],
  });
export type VariantUpdate = z.output<typeof variantUpdateSchema>;

export const variantBulkUpdateSchema = z
  .object({
    variant_ids: z.array(uuidSchema).min(1, "Select at least one variant").max(100),
    set: z
      .object({
        price_minor: moneyMinorSchema.nullable().optional(),
        compare_at_minor: moneyMinorSchema.nullable().optional(),
        cost_minor: moneyMinorSchema.nullable().optional(),
        inventory_tracking: z.boolean().optional(),
        continue_selling: z.boolean().optional(),
      })
      .strict()
      .refine((v) => Object.values(v).some((x) => x !== undefined), {
        message: "Choose something to change",
      }),
  })
  .strict();
export type VariantBulkUpdate = z.output<typeof variantBulkUpdateSchema>;

// ───────────── Inventory ─────────────

export const ADJUSTMENT_REASONS = [
  "received",
  "correction",
  "damaged",
  "shrinkage",
  "returned",
  "other",
] as const;
export const MAX_STOCK = 1_000_000;

export const inventoryAdjustSchema = z
  .object({
    variant_id: uuidSchema,
    location_id: uuidSchema.optional(),
    /** "delta": add/remove; "set": set the on-hand count (a counted stocktake). */
    mode: z.enum(["delta", "set"]).default("delta"),
    quantity: z.number().int("Whole numbers only").min(-MAX_STOCK).max(MAX_STOCK),
    reason: z.enum(ADJUSTMENT_REASONS, { message: "Choose a reason" }),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.mode === "delta" && v.quantity === 0)
      ctx.addIssue({ code: "custom", path: ["quantity"], message: "Enter a non-zero amount" });
    if (v.mode === "set" && v.quantity < 0)
      ctx.addIssue({ code: "custom", path: ["quantity"], message: "Quantity can't be negative" });
    if (v.reason === "other" && !v.note)
      ctx.addIssue({ code: "custom", path: ["note"], message: "Describe the reason" });
  });
export type InventoryAdjust = z.output<typeof inventoryAdjustSchema>;

export const inventoryListQuerySchema = paginationQuerySchema.extend({
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || undefined),
  stock: z.enum(["all", "low", "out"]).default("all"),
  sort: z.enum(["product", "available", "updated_at"]).default("product"),
  order: z.enum(["asc", "desc"]).default("asc"),
});
export type InventoryListQuery = z.output<typeof inventoryListQuerySchema>;

export const movementListQuerySchema = paginationQuerySchema.extend({ variant_id: uuidSchema });
export type MovementListQuery = z.output<typeof movementListQuerySchema>;
