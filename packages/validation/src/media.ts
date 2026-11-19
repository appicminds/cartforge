import { z } from "zod";
import { paginationQuerySchema } from "./common.js";

/** Image types accepted in the initial release (PRD §10: no SVG). */
export const MEDIA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type MediaMimeType = (typeof MEDIA_MIME_TYPES)[number];
export const MEDIA_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
export const MEDIA_MAX_DIMENSION = 8000;

export const mediaUpdateSchema = z
  .object({ alt_text: z.string().trim().max(500).nullable() })
  .strict()
  .transform((v) => ({ alt_text: v.alt_text || null }));
export type MediaUpdate = z.output<typeof mediaUpdateSchema>;

export const mediaListQuerySchema = paginationQuerySchema.extend({
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || undefined),
});
export type MediaListQuery = z.output<typeof mediaListQuerySchema>;
