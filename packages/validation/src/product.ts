import { z } from "zod";
import { paginationQuerySchema, requiredText } from "./common.js";

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

const productFields = {
  title: requiredText(TITLE_MAX),
  description_html: z.string().max(DESCRIPTION_MAX, "Description is too long"),
  product_type: productTypeSchema,
  vendor: optionalText(VENDOR_MAX),
  status: productStatusSchema,
  handle: handleSchema,
};

export const productCreateSchema = z.object({
  title: productFields.title,
  description_html: productFields.description_html.default(""),
  product_type: productFields.product_type.default("simple"),
  vendor: productFields.vendor.optional(),
  status: productFields.status.default("draft"),
  /** Omitted → generated from title (unique within the store). */
  handle: handleSchema.optional(),
});
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
    /** Required to change the handle of a product that is (or was) published. */
    confirm_handle_change: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== "confirm_handle_change"), {
    message: "Provide at least one field to update",
  });
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
