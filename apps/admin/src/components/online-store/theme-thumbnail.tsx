"use client";

import { useState } from "react";
import { PresetSwatch } from "./preset-swatch";

/** Presets with a picture in /public/theme-previews (see scripts/theme-thumbnails.mjs). */
const PICTURES = new Set(["foundry", "noor", "bazaar", "minimal"]);

/**
 * A picture of a theme's home page: the one the editor took after the latest
 * changes, else the preset's own (made with sample products), else its color swatch. Decorative: the theme name is always
 * shown beside it.
 */
export function ThemeThumbnail({
  preset,
  url,
  className = "",
}: {
  preset: string;
  /** The theme's own picture, taken by the editor after changes. */
  url?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const src =
    url && failed !== url
      ? url
      : PICTURES.has(preset) && failed !== "preset"
        ? `/theme-previews/${preset}.webp`
        : null;
  if (!src) return <PresetSwatch preset={preset} className={className} />;
  return (
    <img
      key={src}
      src={src}
      alt=""
      width={800}
      height={650}
      loading="lazy"
      onError={() => setFailed(src === url ? url : "preset")}
      className={`rounded-lg border border-border bg-surface-sunken object-cover object-top ${className}`}
    />
  );
}
