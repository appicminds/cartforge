import { SECTIONS, type TemplateKey } from "./sections";
import type { SectionInstance } from "./theme";

/**
 * Dynamic values: text settings may contain placeholders such as
 * `{{ product.title }}` that the storefront fills for the page being shown.
 * Plain substitution only — no logic, no HTML from values.
 */
export interface DynamicSource {
  key: string;
  label: string;
}

const STORE: DynamicSource[] = [{ key: "store.name", label: "Store name" }];

export const DYNAMIC_SOURCES: Record<TemplateKey | "blog" | "article", DynamicSource[]> = {
  home: STORE,
  product: [
    { key: "product.title", label: "Product title" },
    { key: "product.vendor", label: "Vendor" },
    { key: "product.price", label: "Price" },
    { key: "product.compare_at_price", label: "Compare-at price" },
    { key: "product.category", label: "Category" },
    ...STORE,
  ],
  collection: [
    { key: "collection.title", label: "Collection or category title" },
    { key: "collection.product_count", label: "Number of products" },
    ...STORE,
  ],
  list_collections: STORE,
  cart: STORE,
  search: [{ key: "search.terms", label: "Search words" }, ...STORE],
  page: [{ key: "page.title", label: "Page title" }, ...STORE],
  not_found: STORE,
  blog: [{ key: "blog.title", label: "Blog title" }, ...STORE],
  article: [
    { key: "article.title", label: "Article title" },
    { key: "article.author", label: "Author" },
    { key: "article.date", label: "Publish date" },
    { key: "blog.title", label: "Blog title" },
    ...STORE,
  ],
};

const PLACEHOLDER = /\{\{\s*([a-z_]+\.[a-z_]+)\s*\}\}/g;

const escapeHtml = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** Replaces placeholders with values (unknown ones become empty). */
export function fillDynamic(text: string, values: Record<string, string>, html = false): string {
  if (!text.includes("{{")) return text;
  return text.replace(PLACEHOLDER, (_, key: string) => {
    const v = values[key] ?? "";
    return html ? escapeHtml(v) : v;
  });
}

const TEXT_TYPES = new Set(["text", "textarea", "richtext"]);

/** A copy of the section with dynamic values filled into its text settings and blocks. */
export function fillSection(
  section: SectionInstance,
  values: Record<string, string>,
): SectionInstance {
  const def = SECTIONS[section.type];
  if (!def) return section;
  const fill = (fields: typeof def.settings, s: Record<string, unknown>) => {
    const out = { ...s };
    for (const f of fields)
      if (f.id && TEXT_TYPES.has(f.type) && typeof out[f.id] === "string")
        out[f.id] = fillDynamic(out[f.id] as string, values, f.type === "richtext");
    return out;
  };
  return {
    ...section,
    settings: fill(def.settings, section.settings),
    blocks: section.blocks.map((b) => ({
      ...b,
      settings: fill(def.blocks?.find((x) => x.type === b.type)?.settings ?? [], b.settings),
    })),
  };
}
