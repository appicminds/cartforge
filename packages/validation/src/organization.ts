import { z } from "zod";
import { paginationQuerySchema, requiredText, uuidSchema } from "./common.js";
import { handleSchema } from "./product.js";

export const MAX_CATEGORY_DEPTH = 3;
export const MAX_TAGS = 50;
export const SEO_TITLE_RECOMMENDED = 70;
export const SEO_DESCRIPTION_RECOMMENDED = 160;

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v || null));

export const seoFields = {
  seo_title: nullableText(255),
  seo_description: nullableText(500),
};

/** "  Summer   SALE " → "summer sale" */
export function normalizeTag(tag: string): string {
  return tag.trim().replace(/\s+/g, " ").toLowerCase();
}

export const tagsSchema = z
  .array(z.string().trim().min(1, "Tags can't be empty").max(80, "Tags can be up to 80 characters"))
  .max(MAX_TAGS, `Up to ${MAX_TAGS} tags`)
  .transform((tags) => {
    const seen = new Set<string>();
    return tags
      .map((t) => t.replace(/\s+/g, " "))
      .filter((t) => (seen.has(normalizeTag(t)) ? false : (seen.add(normalizeTag(t)), true)));
  });

const uniqueIds = (max: number, what: string) =>
  z
    .array(uuidSchema)
    .max(max, `Up to ${max} ${what}`)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: `Each ${what.replace(/s$/, "")} can only be listed once`,
    });

export const categoryIdsSchema = uniqueIds(50, "categories");
export const collectionIdsSchema = uniqueIds(100, "collections");

// ───────────── Categories ─────────────

const categoryFields = {
  name: requiredText(120),
  handle: handleSchema.optional(),
  parent_id: uuidSchema.nullable().optional(),
  description_html: z.string().max(20_000).optional(),
  status: z.enum(["active", "archived"]).optional(),
  ...seoFields,
};

export const categoryCreateSchema = z.object(categoryFields).strict();
export type CategoryCreate = z.output<typeof categoryCreateSchema>;

export const categoryUpdateSchema = z
  .object({ ...categoryFields, name: categoryFields.name.optional() })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Provide at least one field to update",
  });
export type CategoryUpdate = z.output<typeof categoryUpdateSchema>;

export const categoryReorderSchema = z
  .object({ parent_id: uuidSchema.nullable(), ids: z.array(uuidSchema).min(1).max(500) })
  .strict();
export type CategoryReorder = z.output<typeof categoryReorderSchema>;

/** Deleting a category with products needs an explicit choice (PRD §8.6). */
export const categoryDeleteSchema = z
  .object({
    reassign_to: uuidSchema.optional(),
    unassign: z.boolean().optional(),
  })
  .strict()
  .refine((v) => !(v.reassign_to && v.unassign), {
    message: "Choose either reassign_to or unassign",
  });
export type CategoryDelete = z.output<typeof categoryDeleteSchema>;

// ───────────── Collections ─────────────

export const COLLECTION_SORTS = [
  "manual",
  "title_asc",
  "title_desc",
  "price_asc",
  "price_desc",
  "created_desc",
  "created_asc",
] as const;

const collectionFields = {
  title: requiredText(200),
  handle: handleSchema.optional(),
  description_html: z.string().max(20_000).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  sort_order: z.enum(COLLECTION_SORTS).optional(),
  ...seoFields,
};

export const collectionCreateSchema = z.object(collectionFields).strict();
export type CollectionCreate = z.output<typeof collectionCreateSchema>;

export const collectionUpdateSchema = z
  .object({
    ...collectionFields,
    title: collectionFields.title.optional(),
    confirm_handle_change: z.boolean().optional(),
  })
  .strict()
  .refine(
    (v) => Object.entries(v).some(([k, x]) => k !== "confirm_handle_change" && x !== undefined),
    {
      message: "Provide at least one field to update",
    },
  );
export type CollectionUpdate = z.output<typeof collectionUpdateSchema>;

/** Replaces membership; order = display order for manual sorting. */
export const collectionProductsSchema = z
  .object({ product_ids: uniqueIds(1000, "products") })
  .strict();
export type CollectionProducts = z.output<typeof collectionProductsSchema>;

export const collectionListQuerySchema = paginationQuerySchema.extend({
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || undefined),
  status: z.enum(["draft", "active", "archived"]).optional(),
});
export type CollectionListQuery = z.output<typeof collectionListQuerySchema>;

// ───────────── Bulk + duplicate ─────────────

export const BULK_ACTIONS = [
  "publish",
  "draft",
  "archive",
  "delete",
  "add_categories",
  "remove_categories",
  "add_collections",
  "remove_collections",
  "add_tags",
  "remove_tags",
] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

export const productBulkSchema = z
  .object({
    action: z.enum(BULK_ACTIONS),
    product_ids: uniqueIds(100, "products").refine((v) => v.length > 0, {
      message: "Select at least one product",
    }),
    category_ids: categoryIdsSchema.optional(),
    collection_ids: collectionIdsSchema.optional(),
    tags: tagsSchema.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const need = (key: "category_ids" | "collection_ids" | "tags", when: string[]) => {
      if (when.includes(v.action) && !v[key]?.length)
        ctx.addIssue({ code: "custom", path: [key], message: "Choose at least one" });
    };
    need("category_ids", ["add_categories", "remove_categories"]);
    need("collection_ids", ["add_collections", "remove_collections"]);
    need("tags", ["add_tags", "remove_tags"]);
  });
export type ProductBulk = z.output<typeof productBulkSchema>;

export const productDuplicateSchema = z
  .object({
    title: requiredText(200).optional(),
    include_media: z.boolean().default(true),
  })
  .strict();
export type ProductDuplicate = z.output<typeof productDuplicateSchema>;

// ───────────── Storefront (public) ─────────────

export const storefrontListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(50).default(24),
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
  collection: handleSchema.optional(),
  category: handleSchema.optional(),
  sort: z.enum(["featured", "title_asc", "price_asc", "price_desc", "newest"]).default("featured"),
  /** Market id ("primary" = the store's own currency); unknown ids fall back to primary. */
  market: z.string().trim().max(40).optional(),
});
export type StorefrontListQuery = z.output<typeof storefrontListQuerySchema>;

/** Request-body (input) types for clients; the *Create/*Update types above are post-validation. */
export type CategoryCreateInput = z.input<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.input<typeof categoryUpdateSchema>;
export type CollectionCreateInput = z.input<typeof collectionCreateSchema>;
export type CollectionUpdateInput = z.input<typeof collectionUpdateSchema>;
export type ProductBulkInput = z.input<typeof productBulkSchema>;
