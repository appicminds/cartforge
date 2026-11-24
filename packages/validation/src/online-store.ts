import { z } from "zod";

const HANDLE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_LINK = /^(?:\/(?!\/)[^\s<>"']*|https:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:[/?#][^\s<>"']*)?)$/i;

export const themeCreateSchema = z
  .object({
    preset: z.string().max(20),
    name: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export const themeRenameSchema = z
  .object({ name: z.string().trim().min(1, "Enter a name").max(80) })
  .strict();

export const themeDataSchema = z.object({ data: z.unknown() }).strict();

const link = z
  .object({
    type: z.enum([
      "home",
      "products",
      "collections",
      "search",
      "collection",
      "category",
      "product",
      "page",
      "url",
    ]),
    id: z.string().uuid().optional(),
    url: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((l, ctx) => {
    if (["collection", "category", "product", "page"].includes(l.type) && !l.id)
      ctx.addIssue({ code: "custom", path: ["id"], message: "Choose what to link to" });
    if (l.type === "url" && !(l.url && SAFE_LINK.test(l.url)))
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message: "Use a path like /pages/about or a link starting with https://",
      });
  });

interface ItemIn {
  id: string;
  title: string;
  link: z.output<typeof link>;
  children?: ItemIn[];
}

const item = (depth: number): z.ZodType<ItemIn> =>
  z
    .object({
      id: z.string().regex(/^[a-z0-9_-]{1,40}$/i),
      title: z.string().trim().min(1, "Enter a title").max(80),
      link,
      children:
        depth > 1
          ? z
              .array(item(depth - 1))
              .max(30)
              .default([])
          : z.array(z.never()).max(0).default([]),
    })
    .strict() as unknown as z.ZodType<ItemIn>;

/** A menu: up to 3 levels (top items, their children, and grandchildren). */
export const menuSchema = z
  .object({
    title: z.string().trim().min(1, "Enter a title").max(80),
    handle: z
      .string()
      .trim()
      .max(60)
      .regex(HANDLE, "Lowercase letters, numbers and hyphens")
      .optional(),
    items: z.array(item(3)).max(50).default([]),
  })
  .strict();
export type MenuInput = z.input<typeof menuSchema>;
export type MenuData = z.output<typeof menuSchema>;

export const pageSchema = z
  .object({
    title: z.string().trim().min(1, "Enter a title").max(200),
    handle: z
      .string()
      .trim()
      .max(255)
      .regex(HANDLE, "Lowercase letters, numbers and hyphens")
      .optional(),
    body_html: z.string().max(100_000).default(""),
    seo_title: z.string().trim().max(200).nullable().default(null),
    seo_description: z.string().trim().max(320).nullable().default(null),
    published: z.boolean().default(true),
  })
  .strict();
export type PageInput = z.input<typeof pageSchema>;
export type PageData = z.output<typeof pageSchema>;

/** Pick an alternate theme template for a product, collection or page (null = default). */
export const templateAssignSchema = z
  .object({
    template: z
      .string()
      .max(30)
      .regex(HANDLE, "Lowercase letters, numbers and hyphens")
      .nullable(),
  })
  .strict();
