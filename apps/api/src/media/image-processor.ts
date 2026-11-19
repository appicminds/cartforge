import { createHash } from "node:crypto";
import sharp from "sharp";
import { MEDIA_MAX_DIMENSION, type MediaMimeType } from "@cartforge/validation";

export class InvalidImageError extends Error {}

/** Identify the real file type from its bytes — never trust the filename or client MIME. */
export function sniffImageType(buf: Buffer): MediaMimeType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export const DERIVATIVES = [
  { name: "thumb", size: 160 },
  { name: "medium", size: 640 },
  { name: "large", size: 1280 },
] as const;
export type DerivativeName = (typeof DERIVATIVES)[number]["name"];

export interface ProcessedImage {
  checksum: string;
  mime: MediaMimeType;
  ext: "jpg" | "png" | "webp";
  original: { body: Buffer; width: number; height: number };
  derivatives: { name: DerivativeName; body: Buffer; width: number; height: number }[];
}

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

export function checksumOf(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Validates and normalizes an uploaded image:
 * - real type check (magic bytes) and a full decode (rejects corrupt/disguised files),
 * - dimension and pixel limits (decompression-bomb guard),
 * - auto-orients and re-encodes the original, which strips EXIF/GPS and any
 *   trailing payloads,
 * - produces WebP derivatives for responsive display.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const mime = sniffImageType(input);
  if (!mime) throw new InvalidImageError("Only JPEG, PNG and WebP images are supported.");

  const limit = MEDIA_MAX_DIMENSION * MEDIA_MAX_DIMENSION;
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: limit }).metadata();
  } catch {
    throw new InvalidImageError("This file couldn't be read as an image.");
  }
  if (!meta.width || !meta.height)
    throw new InvalidImageError("This file couldn't be read as an image.");
  if (meta.width > MEDIA_MAX_DIMENSION || meta.height > MEDIA_MAX_DIMENSION) {
    throw new InvalidImageError(
      `Images can be at most ${MEDIA_MAX_DIMENSION}×${MEDIA_MAX_DIMENSION} pixels.`,
    );
  }

  const base = () => sharp(input, { limitInputPixels: limit }).rotate();
  let original: { data: Buffer; info: sharp.OutputInfo };
  try {
    const pipeline =
      mime === "image/jpeg"
        ? base().jpeg({ quality: 90, mozjpeg: true })
        : mime === "image/png"
          ? base().png({ compressionLevel: 9 })
          : base().webp({ quality: 90 });
    original = await pipeline.toBuffer({ resolveWithObject: true });
  } catch {
    throw new InvalidImageError("This image is damaged or uses an unsupported encoding.");
  }

  const derivatives = await Promise.all(
    DERIVATIVES.map(async (d) => {
      const { data, info } = await base()
        .resize({ width: d.size, height: d.size, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer({ resolveWithObject: true });
      return { name: d.name, body: data, width: info.width, height: info.height };
    }),
  );

  return {
    checksum: checksumOf(input),
    mime,
    ext: EXT[mime],
    original: { body: original.data, width: original.info.width, height: original.info.height },
    derivatives,
  };
}
