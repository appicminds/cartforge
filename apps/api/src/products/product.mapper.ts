import type { Product, ProductVariant } from "@cartforge/database";
import type { ActorSummary, ProductDetail, ProductListItem } from "@cartforge/types";

type ListRow = Product & {
  variants: Pick<ProductVariant, "sku">[];
  _count: { variants: number };
};

export function toListItem(p: ListRow): ProductListItem {
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    status: p.status,
    product_type: p.product_type,
    vendor: p.vendor,
    variant_count: p._count.variants,
    sku: p.product_type === "simple" ? (p.variants[0]?.sku ?? null) : null,
    thumbnail_url: null,
    created_at: p.created_at.toISOString(),
    updated_at: p.updated_at.toISOString(),
  };
}

export function toDetail(
  p: Product & { variants: ProductVariant[] },
  actors: Map<string, ActorSummary>,
): ProductDetail {
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    description_html: p.description_html,
    product_type: p.product_type,
    vendor: p.vendor,
    status: p.status,
    published_at: p.published_at?.toISOString() ?? null,
    variants: p.variants.map((v) => ({
      id: v.id,
      title: v.title,
      sku: v.sku,
      barcode: v.barcode,
      position: v.position,
    })),
    created_at: p.created_at.toISOString(),
    updated_at: p.updated_at.toISOString(),
    created_by: (p.created_by && actors.get(p.created_by)) || null,
    updated_by: (p.updated_by && actors.get(p.updated_by)) || null,
  };
}
