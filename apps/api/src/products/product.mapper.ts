import type {
  Category,
  Collection,
  InventoryLevel,
  ProductTag,
  MediaAsset,
  MediaDerivative,
  Product,
  ProductMedia,
  ProductOption,
  ProductOptionValue,
  ProductVariant,
  ProductVariantOptionValue,
} from "@cartforge/database";
import type {
  ActorSummary,
  ProductDetail,
  ProductListItem,
  ProductMediaItem,
  ProductVariantSummary,
} from "@cartforge/types";
import { snapshot } from "../inventory/inventory.service";
import { mediaUrls } from "../media/media.mapper";

type MediaRow = ProductMedia & { asset: MediaAsset & { derivatives: MediaDerivative[] } };
export type VariantRow = ProductVariant & {
  option_values: (ProductVariantOptionValue & {
    option_value: ProductOptionValue & { option: ProductOption };
  })[];
  inventory: InventoryLevel[];
};
type OptionRow = ProductOption & { values: ProductOptionValue[] };

/** BigInt (DB) → number (JSON). Amounts are capped at 10^12, well inside 2^53. */
export const money = (v: bigint | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

type ListRow = Product & {
  variants: Pick<ProductVariant, "sku" | "price_minor">[];
  media: MediaRow[];
  _count: { variants: number };
};

export interface ListAggregates {
  price_min: number | null;
  price_max: number | null;
  available: number | null;
}

export function toListItem(p: ListRow, currency: string, agg?: ListAggregates): ProductListItem {
  const primary = p.media[0];
  const simple = p.product_type === "simple";
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    status: p.status,
    product_type: p.product_type,
    vendor: p.vendor,
    variant_count: p._count.variants,
    sku: simple ? (p.variants[0]?.sku ?? null) : null,
    thumbnail_url: primary ? (mediaUrls(primary.asset).thumb_url ?? primary.asset.url) : null,
    price_minor: agg?.price_min ?? (simple ? money(p.variants[0]?.price_minor) : null),
    price_max_minor: agg?.price_max ?? null,
    currency,
    inventory_available: agg?.available ?? null,
    created_at: p.created_at.toISOString(),
    updated_at: p.updated_at.toISOString(),
  };
}

export function toMediaItem(m: MediaRow): ProductMediaItem {
  return {
    media_asset_id: m.media_asset_id,
    ...mediaUrls(m.asset),
    position: m.position,
    is_primary: m.is_primary,
    alt_text: m.alt_text ?? m.asset.alt_text,
    width: m.asset.width,
    height: m.asset.height,
  };
}

export function toVariant(
  v: VariantRow,
  currency: string,
  locationId: string,
): ProductVariantSummary {
  const level = v.inventory.find((l) => l.location_id === locationId);
  return {
    id: v.id,
    title: v.title,
    sku: v.sku,
    barcode: v.barcode,
    position: v.position,
    price_minor: money(v.price_minor),
    compare_at_minor: money(v.compare_at_minor),
    cost_minor: money(v.cost_minor),
    currency: v.currency ?? currency,
    option_values: [...v.option_values]
      .sort((a, b) => a.option_value.option.position - b.option_value.option.position)
      .map((ov) => ({ option: ov.option_value.option.name, value: ov.option_value.value })),
    inventory_tracking: v.inventory_tracking,
    continue_selling: v.continue_selling,
    media_asset_id: v.media_asset_id,
    inventory: snapshot(v.inventory_tracking, level, locationId),
  };
}

export type OrganizationRows = {
  categories: { category: Category }[];
  collections: { collection: Collection }[];
  tags: { tag: ProductTag }[];
};

export function toDetail(
  p: Product & {
    variants: VariantRow[];
    media: MediaRow[];
    options: OptionRow[];
  } & OrganizationRows,
  currency: string,
  locationId: string,
  actors: Map<string, ActorSummary>,
  categoryPaths: Map<string, string>,
): ProductDetail {
  const def = p.variants[0];
  const simple = p.product_type === "simple";
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    description_html: p.description_html,
    product_type: p.product_type,
    vendor: p.vendor,
    status: p.status,
    published_at: p.published_at?.toISOString() ?? null,
    taxable: p.taxable,
    currency,
    price_minor: simple ? money(def?.price_minor) : null,
    compare_at_minor: simple ? money(def?.compare_at_minor) : null,
    cost_minor: simple ? money(def?.cost_minor) : null,
    media: p.media.map(toMediaItem),
    seo_title: p.seo_title,
    seo_description: p.seo_description,
    categories: p.categories
      .map((c) => ({
        id: c.category.id,
        name: c.category.name,
        handle: c.category.handle,
        path: categoryPaths.get(c.category.id) ?? c.category.name,
      }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    collections: p.collections
      .map((c) => ({ id: c.collection.id, title: c.collection.title, handle: c.collection.handle }))
      .sort((a, b) => a.title.localeCompare(b.title)),
    tags: p.tags.map((t) => t.tag.name).sort((a, b) => a.localeCompare(b)),
    options: [...p.options]
      .sort((a, b) => a.position - b.position)
      .map((o) => ({
        id: o.id,
        name: o.name,
        position: o.position,
        values: [...o.values]
          .sort((a, b) => a.position - b.position)
          .map((v) => ({ id: v.id, value: v.value, position: v.position })),
      })),
    variants: p.variants.map((v) => toVariant(v, currency, locationId)),
    created_at: p.created_at.toISOString(),
    updated_at: p.updated_at.toISOString(),
    created_by: (p.created_by && actors.get(p.created_by)) || null,
    updated_by: (p.updated_by && actors.get(p.updated_by)) || null,
  };
}
