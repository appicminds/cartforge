import { z } from "zod";
import { paginationQuerySchema } from "./common.js";

/** Image types accepted in the initial release (PRD §10: no SVG). */
export const MEDIA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type MediaMimeType = (typeof MEDIA_MIME_TYPES)[number];
export const MEDIA_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
export const MEDIA_MAX_DIMENSION = 8000;

/** Product videos (MP4/WebM, plus MOV straight from iPhones). Played as-is: no transcoding. */
export const MEDIA_VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;
export type MediaVideoMimeType = (typeof MEDIA_VIDEO_MIME_TYPES)[number];
export const MEDIA_VIDEO_ACCEPT = ".mp4,.m4v,.webm,.mov,video/mp4,video/webm,video/quicktime";
export const MEDIA_VIDEO_EXT: Record<MediaVideoMimeType, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};
export const MEDIA_VIDEO_MAX_SECONDS = 10 * 60;

const sha256 = z.string().regex(/^[0-9a-f]{64}$/, "Must be a lowercase hex SHA-256");

/** Step 1: ask where to upload a video (or get the existing copy back). */
export const videoUploadStartSchema = z
  .object({
    filename: z.string().trim().min(1).max(255),
    mime_type: z.enum(MEDIA_VIDEO_MIME_TYPES),
    size_bytes: z.number().int().positive(),
    checksum_sha256: sha256,
  })
  .strict();
export type VideoUploadStart = z.output<typeof videoUploadStartSchema>;

/** Step 2 (multipart text fields, so numbers arrive as strings): register the uploaded video. */
export const videoCompleteSchema = z
  .object({
    filename: z.string().trim().min(1).max(255),
    mime_type: z.enum(MEDIA_VIDEO_MIME_TYPES),
    checksum_sha256: sha256,
    width: z.coerce.number().int().min(1).max(MEDIA_MAX_DIMENSION),
    height: z.coerce.number().int().min(1).max(MEDIA_MAX_DIMENSION),
    duration_ms: z.coerce
      .number()
      .int()
      .min(0)
      .max(
        MEDIA_VIDEO_MAX_SECONDS * 1000,
        `Videos can be up to ${MEDIA_VIDEO_MAX_SECONDS / 60} minutes long`,
      ),
    alt_text: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => v || null),
  })
  .strict();
export type VideoComplete = z.output<typeof videoCompleteSchema>;

export const mediaUpdateSchema = z
  .object({ alt_text: z.string().trim().max(500).nullable() })
  .strict()
  .transform((v) => ({ alt_text: v.alt_text || null }));
export type MediaUpdate = z.output<typeof mediaUpdateSchema>;

export const mediaListQuerySchema = paginationQuerySchema.extend({
  /** Only images or only videos; both when omitted. */
  type: z.enum(["image", "video"]).optional(),
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || undefined),
});
export type MediaListQuery = z.output<typeof mediaListQuerySchema>;
