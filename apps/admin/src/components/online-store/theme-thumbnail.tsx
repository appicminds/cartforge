"use client";

import { useState } from "react";
import { PresetSwatch } from "./preset-swatch";

/** Presets with a picture in /public/theme-previews (see scripts/theme-thumbnails.mjs). */
const PICTURES = new Set(["foundry", "noor", "bazaar", "minimal"]);

/**
 * A picture of a theme's home page (made from the preset with sample products),
 * or its color swatch when there's no picture. Decorative: the theme name is always
 * shown beside it.
 */
export function ThemeThumbnail({ preset, className = "" }: { preset: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!PICTURES.has(preset) || failed)
    return <PresetSwatch preset={preset} className={className} />;
  return (
    <img
      src={`/theme-previews/${preset}.webp`}
      alt=""
      width={800}
      height={650}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`rounded-lg border border-border bg-surface-sunken object-cover object-top ${className}`}
    />
  );
}
