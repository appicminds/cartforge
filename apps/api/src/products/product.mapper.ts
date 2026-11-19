import type {
  MediaAsset,
  MediaDerivative,
  Product,
  ProductMedia,
  ProductVariant,
} from "@cartforge/database";
import type {
  ActorSummary,
  ProductDetail,
  ProductListItem,
  ProductMediaItem,
} from "@cartforge/types";
import { mediaUrls } from "../media/media.mapper";

type MediaRow = ProductMedia & { asset: MediaAsset & { derivatives: MediaDerivative[] } };

/** BigInt (DB) → number (JSON). Amounts are capped at 10^12, well inside 2^53. */
const money = (v: bigint | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

type ListRow = Product & {
  variants: Pick<ProductVariant, "sku" | "price_minor">[];
  media: MediaRow[];
  _count: { variants: number };
};

export function toListItem(p: ListRow, currency: string): ProductListItem {
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
    price_minor: simple ? money(p.variants[0]?.price_minor) : null,
    currency,
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

export function toDetail(
  p: Product & { variants: ProductVariant[]; media: MediaRow[] },
  currency: string,
  actors: Map<string, ActorSummary>,
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
    variants: p.variants.map((v) => ({
      id: v.id,
      title: v.title,
      sku: v.sku,
      barcode: v.barcode,
      position: v.position,
      price_minor: money(v.price_minor),
      compare_at_minor: money(v.compare_at_minor),
      cost_minor: money(v.cost_minor),
      currency: v.currency ?? currency,
    })),
    created_at: p.created_at.toISOString(),
    updated_at: p.updated_at.toISOString(),
    created_by: (p.created_by && actors.get(p.created_by)) || null,
    updated_by: (p.updated_by && actors.get(p.updated_by)) || null,
  };
}
