import { z } from "zod";
import { paginationQuerySchema, requiredText, uuidSchema } from "./common.js";
import { moneyMinorSchema } from "./money.js";
import { MAX_STOCK, thresholdSchema } from "./variants.js";

export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export const PRODUCT_TYPES = ["simple", "variable"] as const;
export const PRODUCT_SORT_FIELDS = ["title", "created_at", "updated_at", "status"] as const;

export const TITLE_MAX = 200;
export const HANDLE_MAX = 255;
export const VENDOR_MAX = 120;
export const DESCRIPTION_MAX = 100_000;

export const productStatusSchema = z.enum(PRODUCT_STATUSES);
export const productTypeSchema = z.enum(PRODUCT_TYPES);

/**
 * URL handle from free text: lower-case ASCII words joined by single hyphens.
 * "Café Crème — 2-Pack!" → "cafe-creme-2-pack". Returns "" when nothing usable remains.
 */
export function slugify(input: string, max = HANDLE_MAX): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, max).replace(/-+$/g, "");
}

export const HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Handle is required")
  .max(HANDLE_MAX, `Must be ${HANDLE_MAX} characters or fewer`)
  .regex(
    HANDLE_PATTERN,
    "Use lowercase letters, numbers and single hyphens (e.g. classic-t-shirt)",
  );

/**
 * Optional text: omitted stays undefined (field untouched on update);
 * null, empty or whitespace-only becomes null (field cleared).
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v || null));

export const MAX_PRODUCT_MEDIA = 50;

/** Ordered image list; the first item is primary unless primary_media_id says otherwise. */
export const productMediaInputSchema = z
  .array(
    z.object({
      media_asset_id: uuidSchema,
      alt_text: z
        .string()
        .trim()
        .max(500)
        .nullish()
        .transform((v) => (v === undefined ? undefined : v || null)),
    }),
  )
  .max(MAX_PRODUCT_MEDIA, `A product can have up to ${MAX_PRODUCT_MEDIA} images`)
  .refine((items) => new Set(items.map((i) => i.media_asset_id)).size === items.length, {
    message: "Each image can only be added once",
  });

const nullableMoney = moneyMinorSchema.nullable();

/** Pricing fields (simple products; variable products price per variant from Sprint 3). */
const pricingFields = {
  price_minor: nullableMoney.optional(),
  compare_at_minor: nullableMoney.optional(),
  cost_minor: nullableMoney.optional(),
  taxable: z.boolean().optional(),
};

const uuidList = (max: number) =>
  z
    .array(uuidSchema)
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Each item can only be listed once",
    });

/** Categories, collections, tags and SEO (PRD §8.4 G–H). Lists replace current values. */
const organizationFields = {
  category_ids: uuidList(50).optional(),
  collection_ids: uuidList(100).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(50, "Up to 50 tags").optional(),
  seo_title: z
    .string()
    .trim()
    .max(255)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v || null)),
  seo_description: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v || null)),
};

/** Default-variant inventory fields for simple products (PRD §8.4 D). */
const inventoryFields = {
  sku: z
    .string()
    .trim()
    .max(100)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v || null)),
  barcode: z
    .string()
    .trim()
    .max(100)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v || null)),
  inventory_tracking: z.boolean().optional(),
  continue_selling: z.boolean().optional(),
  low_stock_threshold: thresholdSchema.nullable().optional(),
};

const compareAtRule = <T extends { price_minor?: number | null; compare_at_minor?: number | null }>(
  v: T,
) => v.compare_at_minor == null || v.price_minor == null || v.compare_at_minor > v.price_minor;
const compareAtIssue = {
  message: "Compare-at price must be higher than the price",
  path: ["compare_at_minor"],
};

const productFields = {
  title: requiredText(TITLE_MAX),
  description_html: z.string().max(DESCRIPTION_MAX, "Description is too long"),
  product_type: productTypeSchema,
  vendor: optionalText(VENDOR_MAX),
  status: productStatusSchema,
  handle: handleSchema,
};

export const productCreateSchema = z
  .object({
    title: productFields.title,
    description_html: productFields.description_html.default(""),
    product_type: productFields.product_type.default("simple"),
    vendor: productFields.vendor.optional(),
    status: productFields.status.default("draft"),
    /** Omitted → generated from title (unique within the store). */
    handle: handleSchema.optional(),
    ...pricingFields,
    ...inventoryFields,
    ...organizationFields,
    /** Starting stock at the default location; recorded as an "initial" movement. */
    inventory_quantity: z.number().int().min(0).max(MAX_STOCK).optional(),
    media: productMediaInputSchema.optional(),
    primary_media_id: uuidSchema.nullish(),
  })
  .refine(compareAtRule, compareAtIssue);
export type ProductCreateInput = z.input<typeof productCreateSchema>;
export type ProductCreate = z.output<typeof productCreateSchema>;

export const productUpdateSchema = z
  .object({
    title: productFields.title.optional(),
    description_html: productFields.description_html.optional(),
    product_type: productFields.product_type.optional(),
    vendor: productFields.vendor.optional(),
    status: productFields.status.optional(),
    handle: handleSchema.optional(),
    ...pricingFields,
    ...inventoryFields,
    ...organizationFields,
    /** Replaces the product's image list (order = display order). */
    media: productMediaInputSchema.optional(),
    primary_media_id: uuidSchema.nullish(),
    /** Required to change the handle of a product that is (or was) published. */
    confirm_handle_change: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== "confirm_handle_change"), {
    message: "Provide at least one field to update",
  })
  // Checked here when both arrive together; the server re-checks against stored values.
  .refine(compareAtRule, compareAtIssue);
export type ProductUpdateInput = z.input<typeof productUpdateSchema>;
export type ProductUpdate = z.output<typeof productUpdateSchema>;

const csvEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined;
      const parts = [
        ...new Set(
          v
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean),
        ),
      ];
      for (const p of parts) {
        if (!(values as readonly string[]).includes(p)) {
          ctx.addIssue({ code: "custom", message: `Unknown value "${p}"` });
          return z.NEVER;
        }
      }
      return parts.length ? (parts as T[number][]) : undefined;
    });

export const productListQuerySchema = paginationQuerySchema.extend({
  category_id: uuidSchema.optional(),
  collection_id: uuidSchema.optional(),
  tag: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => v || undefined),
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || undefined),
  status: csvEnum(PRODUCT_STATUSES),
  product_type: csvEnum(PRODUCT_TYPES),
  sort: z.enum(PRODUCT_SORT_FIELDS).default("updated_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
});
export type ProductListQuery = z.output<typeof productListQuerySchema>;
