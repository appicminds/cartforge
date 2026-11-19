import type { MediaAsset, MediaDerivative } from "@cartforge/database";
import type { MediaAssetSummary, MediaUrls } from "@cartforge/types";

export type AssetWithDerivatives = MediaAsset & { derivatives: MediaDerivative[] };

export function mediaUrls(a: AssetWithDerivatives): MediaUrls {
  const d = (name: string) => a.derivatives.find((x) => x.name === name)?.url ?? null;
  return { url: a.url, thumb_url: d("thumb"), medium_url: d("medium"), large_url: d("large") };
}

export function toMediaSummary(
  a: AssetWithDerivatives & { _count?: { references: number } },
  extra: { deduplicated?: boolean } = {},
): MediaAssetSummary {
  return {
    id: a.id,
    ...mediaUrls(a),
    original_filename: a.original_filename,
    mime_type: a.mime_type,
    size_bytes: a.size_bytes,
    width: a.width,
    height: a.height,
    alt_text: a.alt_text,
    reference_count: a._count?.references ?? 0,
    created_at: a.created_at.toISOString(),
    ...extra,
  };
}
