import type { MediaAsset, MediaDerivative } from "@cartforge/database";
import type { MediaAssetSummary, MediaUrls, StorefrontImage } from "@cartforge/types";

export type AssetWithDerivatives = MediaAsset & { derivatives: MediaDerivative[] };

/** Name of a video's full-size cover frame among its derivatives. */
export const POSTER = "poster";

export const isVideo = (a: Pick<MediaAsset, "mime_type">) => a.mime_type.startsWith("video/");

/**
 * URLs for an asset. `url` is always an image — for a video, its cover frame — so every
 * <img> in the admin and storefront works unchanged; the video file is `video_url`.
 */
export function mediaUrls(a: AssetWithDerivatives): MediaUrls {
  const d = (name: string) => a.derivatives.find((x) => x.name === name)?.url ?? null;
  const video = isVideo(a);
  return {
    url: video ? (d(POSTER) ?? d("large") ?? a.url) : a.url,
    thumb_url: d("thumb"),
    medium_url: d("medium"),
    large_url: d("large"),
    media_type: video ? "video" : "image",
    video_url: video ? a.url : null,
    duration_ms: video ? (a.duration_ms ?? null) : null,
    mime_type: a.mime_type,
  };
}

/** The storefront's view of an image or video (no internal fields). */
export function storefrontMedia(a: AssetWithDerivatives, alt: string | null): StorefrontImage {
  const u = mediaUrls(a);
  return {
    url: u.url,
    thumb_url: u.thumb_url,
    medium_url: u.medium_url,
    large_url: u.large_url,
    alt,
    width: a.width,
    height: a.height,
    video: u.video_url
      ? { url: u.video_url, mime_type: a.mime_type, duration_ms: u.duration_ms }
      : null,
  };
}

export function toMediaSummary(
  a: AssetWithDerivatives & { _count?: { references: number } },
  extra: { deduplicated?: boolean } = {},
): MediaAssetSummary {
  return {
    id: a.id,
    ...mediaUrls(a),
    original_filename: a.original_filename,
    size_bytes: a.size_bytes,
    width: a.width,
    height: a.height,
    alt_text: a.alt_text,
    reference_count: a._count?.references ?? 0,
    created_at: a.created_at.toISOString(),
    ...extra,
  };
}
