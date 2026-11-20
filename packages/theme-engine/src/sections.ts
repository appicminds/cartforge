import { z } from "zod";

/**
 * Registered section types (PRD §11.2 "section schemas … registered components").
 * A template can only contain these; each section's settings are validated and
 * defaulted by its own schema. The storefront maps each type to a component.
 */
const text = (max: number, fallback = "") => z.string().max(max).default(fallback);
const handle = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(255);

export const SECTION_SCHEMAS = {
  hero: z.object({
    /** Empty = the store name. */
    heading: text(120),
    subheading: text(240),
    button_label: text(40, "Shop all"),
    /** Internal path only. */
    button_link: z
      .string()
      .regex(/^\/(?!\/)[a-z0-9\-/?=&]*$/i, "Use a path on this store, like /products")
      .default("/products"),
    alignment: z.enum(["left", "center"]).default("left"),
  }),
  featured_collection: z.object({
    heading: text(120),
    /** Empty = the first active collection. */
    collection: handle.optional(),
    limit: z.number().int().min(2).max(12).default(4),
  }),
  new_arrivals: z.object({
    heading: text(120, "New arrivals"),
    limit: z.number().int().min(2).max(12).default(8),
  }),
  category_list: z.object({
    heading: text(120, "Shop by category"),
    /** Top-level categories only. */
    limit: z.number().int().min(2).max(12).default(6),
  }),
  rich_text: z.object({
    heading: text(120),
    /** Plain paragraphs; blank lines separate them. Never HTML. */
    body: text(2000),
  }),
} as const;

export type SectionType = keyof typeof SECTION_SCHEMAS;
export type SectionSettings<T extends SectionType> = z.output<(typeof SECTION_SCHEMAS)[T]>;

export type Section = {
  [T in SectionType]: { id: string; type: T; settings: SectionSettings<T> };
}[SectionType];

const sectionId = z.string().regex(/^[a-z0-9_-]{1,40}$/);

const sectionSchema = z
  .object({
    id: sectionId,
    type: z.enum(Object.keys(SECTION_SCHEMAS) as [SectionType, ...SectionType[]]),
    settings: z.record(z.string(), z.unknown()).default({}),
  })
  .transform((s, ctx) => {
    const parsed = SECTION_SCHEMAS[s.type].safeParse(s.settings);
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        ctx.addIssue({ ...issue, path: ["settings", ...issue.path] } as never);
      return z.NEVER;
    }
    return { id: s.id, type: s.type, settings: parsed.data } as Section;
  });

export const templateSchema = z
  .object({ sections: z.array(sectionSchema).max(25) })
  .superRefine((t, ctx) => {
    const seen = new Set<string>();
    t.sections.forEach((s, i) => {
      if (seen.has(s.id))
        ctx.addIssue({ code: "custom", path: ["sections", i, "id"], message: "Duplicate id" });
      seen.add(s.id);
    });
  });
export type Template = z.output<typeof templateSchema>;
export type TemplateInput = z.input<typeof templateSchema>;
