"use client";

import { useRef, useState } from "react";
import { ImageIcon, ImagePlus, Images, X } from "lucide-react";
import type { CatalogImage } from "@cartforge/types";
import { MEDIA_ACCEPT } from "@cartforge/validation";
import { Button, useToast } from "@cartforge/ui";
import { ApiError } from "@/lib/api-client";
import { uploadMedia } from "@/lib/media";
import { LibraryDialog } from "./products/media-gallery";

/** The chosen image: just what's needed to show it and save it. */
export interface CoverImage {
  id: string;
  url: string;
}

export const toCoverImage = (i: CatalogImage | null): CoverImage | null =>
  i ? { id: i.media_asset_id, url: i.medium_url ?? i.url } : null;

/**
 * Image for a category or collection. Without a chosen image, the storefront uses a
 * product photo from inside it (`auto`), shown here so the merchant knows what to expect.
 */
export function CoverImageField({
  value,
  onChange,
  auto,
  storeId,
  disabled,
  emptyHint,
}: {
  value: CoverImage | null;
  onChange: (v: CoverImage | null) => void;
  auto: CatalogImage | null;
  storeId: string | undefined;
  disabled?: boolean;
  /** Shown when there's neither a chosen image nor a product photo to use. */
  emptyHint: string;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [library, setLibrary] = useState(false);

  const upload = (file: File) => {
    if (!storeId) return;
    setProgress(0);
    uploadMedia(file, storeId, setProgress).promise.then(
      (asset) => {
        setProgress(null);
        onChange({ id: asset.id, url: asset.medium_url ?? asset.url });
      },
      (err: unknown) => {
        setProgress(null);
        if (err instanceof ApiError && err.code === "ABORTED") return;
        toast.error(err instanceof ApiError ? err.message : "Upload failed.");
      },
    );
  };

  const autoUrl = auto ? (auto.medium_url ?? auto.url) : null;
  const shown = value?.url ?? autoUrl;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] w-full max-w-64 overflow-hidden rounded-lg border border-border bg-surface-sunken">
        {shown ? (
          <img src={shown} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1 p-4 text-center text-xs text-fg-subtle">
            <ImageIcon aria-hidden className="size-6" />
            {emptyHint}
          </div>
        )}
        {progress !== null && (
          <div className="absolute inset-0 flex items-end bg-surface/70">
            <div
              className="h-1 bg-primary transition-[width]"
              style={{ width: `${Math.round(progress * 100)}%` }}
              role="progressbar"
              aria-label="Uploading image"
              aria-valuenow={Math.round(progress * 100)}
            />
          </div>
        )}
        {value && !disabled && (
          <Button
            size="icon"
            variant="secondary"
            className="absolute right-2 top-2 shadow-sm"
            aria-label="Remove image"
            onClick={() => onChange(null)}
          >
            <X aria-hidden />
          </Button>
        )}
      </div>
      <p className="text-xs text-fg-muted">
        {value
          ? "Shown on your storefront."
          : autoUrl
            ? "No image chosen, so a product photo from here is used. Choose one to replace it."
            : "No image chosen. A product photo will be used once a product with a photo is added."}
      </p>
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => input.current?.click()}
            disabled={progress !== null}
          >
            <ImagePlus aria-hidden /> {value ? "Replace" : "Upload"}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setLibrary(true)}>
            <Images aria-hidden /> Choose from library
          </Button>
          <input
            ref={input}
            type="file"
            accept={MEDIA_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) upload(file);
            }}
          />
        </div>
      )}
      <LibraryDialog
        open={library}
        single
        exclude={new Set(value ? [value.id] : [])}
        onClose={() => setLibrary(false)}
        onAdd={([a]) => {
          setLibrary(false);
          if (a) onChange({ id: a.id, url: a.medium_url ?? a.url });
        }}
      />
    </div>
  );
}
