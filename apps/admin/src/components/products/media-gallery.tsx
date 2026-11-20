"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  Images,
  MoreHorizontal,
  Pencil,
  RotateCw,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { MediaAssetSummary } from "@cartforge/types";
import { MEDIA_ACCEPT } from "@cartforge/validation";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Label,
  Menu,
  Skeleton,
  Textarea,
  cn,
  useToast,
  type MenuItem,
} from "@cartforge/ui";
import { ApiError } from "@/lib/api-client";
import {
  ACCEPTED_TYPES,
  formatBytes,
  uploadMedia,
  useMediaLibrary,
  type UploadHandle,
} from "@/lib/media";

export interface GalleryItem {
  media_asset_id: string;
  alt_text: string | null;
  url: string;
  thumb_url: string | null;
  medium_url: string | null;
  width: number | null;
  height: number | null;
}

export interface GalleryValue {
  items: GalleryItem[];
  /** null ⇒ the first image is primary. */
  primary: string | null;
}

interface PendingUpload {
  key: string;
  file: File;
  preview: string;
  progress: number;
  error: string | null;
  handle: UploadHandle | null;
}

export function toGalleryItem(
  a: MediaAssetSummary | (GalleryItem & { media_asset_id: string }),
): GalleryItem {
  if ("media_asset_id" in a) return a;
  return {
    media_asset_id: a.id,
    alt_text: a.alt_text,
    url: a.url,
    thumb_url: a.thumb_url,
    medium_url: a.medium_url,
    width: a.width,
    height: a.height,
  };
}

/**
 * Product media (PRD §8.4 B): drag-and-drop/file-picker uploads with progress
 * and retry, reorder (drag or keyboard), primary selection, per-product alt
 * text, and picking existing library images. Uploads create assets
 * immediately; attaching them to the product happens on Save.
 */
export function MediaGallery({
  value,
  onChange,
  storeId,
  disabled,
  onBusyChange,
}: {
  value: GalleryValue;
  onChange: (v: GalleryValue) => void;
  storeId: string;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [editing, setEditing] = useState<GalleryItem | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  // Uploads finish asynchronously; always merge into the latest value.
  const latest = useRef(value);
  latest.current = value;

  const primaryId = value.primary ?? value.items[0]?.media_asset_id ?? null;
  const busy = pending.some((p) => !p.error);
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);
  useEffect(() => () => pending.forEach((p) => URL.revokeObjectURL(p.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const addItems = (assets: GalleryItem[]) => {
    const current = latest.current;
    const have = new Set(current.items.map((i) => i.media_asset_id));
    const fresh = assets.filter((a) => !have.has(a.media_asset_id));
    if (fresh.length < assets.length) toast.success("That image is already on this product");
    if (!fresh.length) return;
    const next = { ...current, items: [...current.items, ...fresh] };
    // Update the ref now: another upload may finish before React re-renders, and
    // it must merge into this value rather than the stale one (lost-image race).
    latest.current = next;
    onChange(next);
  };

  const start = (key: string, file: File) => {
    const handle = uploadMedia(file, storeId, (fraction) =>
      setPending((all) => all.map((p) => (p.key === key ? { ...p, progress: fraction } : p))),
    );
    setPending((all) =>
      all.map((p) => (p.key === key ? { ...p, handle, error: null, progress: 0 } : p)),
    );
    handle.promise.then(
      (asset) => {
        addItems([toGalleryItem(asset)]);
        setPending((all) => {
          const done = all.find((p) => p.key === key);
          if (done) URL.revokeObjectURL(done.preview);
          return all.filter((p) => p.key !== key);
        });
      },
      (err: unknown) => {
        if (err instanceof ApiError && err.code === "ABORTED") return;
        const message = err instanceof ApiError ? err.message : "Upload failed.";
        setPending((all) =>
          all.map((p) => (p.key === key ? { ...p, error: message, handle: null } : p)),
        );
      },
    );
  };

  const enqueue = (files: FileList | File[]) => {
    const list = Array.from(files);
    const rejected = list.filter((f) => !ACCEPTED_TYPES.includes(f.type));
    if (rejected.length)
      toast.error(`${rejected.map((f) => f.name).join(", ")}: only JPEG, PNG or WebP images.`);
    for (const file of list.filter((f) => ACCEPTED_TYPES.includes(f.type))) {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`;
      setPending((all) => [
        ...all,
        { key, file, preview: URL.createObjectURL(file), progress: 0, error: null, handle: null },
      ]);
      start(key, file);
    }
  };

  const removePending = (key: string) =>
    setPending((all) => {
      const p = all.find((x) => x.key === key);
      p?.handle?.abort();
      if (p) URL.revokeObjectURL(p.preview);
      return all.filter((x) => x.key !== key);
    });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.items.length || from === to) return;
    const items = [...value.items];
    const [it] = items.splice(from, 1);
    items.splice(to, 0, it!);
    onChange({ ...value, items });
  };

  const remove = (id: string) =>
    onChange({
      items: value.items.filter((i) => i.media_asset_id !== id),
      primary: value.primary === id ? null : value.primary,
    });

  const onDropFiles = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!disabled && e.dataTransfer.files.length) enqueue(e.dataTransfer.files);
  };

  const menuFor = (item: GalleryItem, index: number): MenuItem[] => [
    ...(item.media_asset_id !== primaryId
      ? [
          {
            label: "Set as primary",
            icon: <Star />,
            // The first image is the primary: move it to the front.
            onSelect: () =>
              onChange({
                items: [
                  item,
                  ...value.items.filter((i) => i.media_asset_id !== item.media_asset_id),
                ],
                primary: null,
              }),
          },
        ]
      : []),
    { label: "Edit alt text", icon: <Pencil />, onSelect: () => setEditing(item) },
    {
      label: "Move earlier",
      icon: <ArrowLeft />,
      disabled: index === 0,
      onSelect: () => move(index, index - 1),
    },
    {
      label: "Move later",
      icon: <ArrowRight />,
      disabled: index === value.items.length - 1,
      onSelect: () => move(index, index + 1),
    },
    {
      label: "Remove from product",
      icon: <Trash2 />,
      destructive: true,
      onSelect: () => remove(item.media_asset_id),
    },
  ];

  const empty = value.items.length === 0 && pending.length === 0;

  return (
    <div className="flex flex-col gap-3">
      {!empty && (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4" aria-label="Product images">
          {value.items.map((item, index) => {
            const isPrimary = item.media_asset_id === primaryId;
            return (
              <li
                key={item.media_asset_id}
                draggable={!disabled}
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => {
                  if (dragIndex === null) return;
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  if (dragIndex === null) return;
                  e.preventDefault();
                  e.stopPropagation();
                  move(dragIndex, index);
                  setDragIndex(null);
                }}
                onDragEnd={() => setDragIndex(null)}
                className={cn(
                  "group relative aspect-square overflow-hidden rounded-lg border border-border bg-surface-sunken",
                  isPrimary && "col-span-2 row-span-2",
                  dragIndex === index && "opacity-40",
                  !disabled && "cursor-grab active:cursor-grabbing",
                )}
              >
                <img
                  src={(isPrimary ? item.medium_url : item.thumb_url) ?? item.url}
                  alt={item.alt_text || `Product image ${index + 1}`}
                  className="size-full object-cover"
                  draggable={false}
                />
                {isPrimary && (
                  <Badge tone="neutral" className="absolute left-2 top-2 bg-surface/90 shadow-sm">
                    <Star aria-hidden className="size-3" /> Primary
                  </Badge>
                )}
                {!item.alt_text && <span className="sr-only">No alt text</span>}
                {!disabled && (
                  <div className="absolute right-1.5 top-1.5 rounded-md bg-surface/90 opacity-100 shadow-sm transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <Menu
                      label={`Image ${index + 1} actions${isPrimary ? " (primary)" : ""}`}
                      trigger={<MoreHorizontal />}
                      items={menuFor(item, index)}
                    />
                  </div>
                )}
              </li>
            );
          })}

          {pending.map((p) => (
            <li
              key={p.key}
              className="relative aspect-square overflow-hidden rounded-lg border border-border bg-surface-sunken"
            >
              <img
                src={p.preview}
                alt=""
                className={cn("size-full object-cover", !p.error && "opacity-50")}
              />
              {p.error ? (
                <div
                  role="alert"
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-danger-subtle/95 p-2 text-center"
                >
                  <p className="line-clamp-3 text-xs text-danger">{p.error}</p>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => start(p.key, p.file)}
                      aria-label={`Retry ${p.file.name}`}
                    >
                      <RotateCw aria-hidden /> Retry
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removePending(p.key)}
                      aria-label={`Remove ${p.file.name}`}
                    >
                      <X aria-hidden />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="absolute inset-x-2 bottom-2">
                  <div
                    role="progressbar"
                    aria-label={`Uploading ${p.file.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(p.progress * 100)}
                    className="h-1.5 overflow-hidden rounded-full bg-white/70"
                  >
                    <div
                      className="h-full bg-primary transition-[width]"
                      style={{ width: `${Math.max(5, p.progress * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </li>
          ))}

          {!disabled && (
            <li className="aspect-square">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  if (dragIndex !== null) return;
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDropFiles}
                className={cn(
                  "flex size-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border-strong text-xs text-fg-muted hover:bg-surface-hover",
                  dragOver && "border-primary bg-primary-subtle",
                )}
              >
                <ImagePlus aria-hidden className="size-5" />
                Add
              </button>
            </li>
          )}
        </ul>
      )}

      {empty && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDropFiles}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong px-4 py-8 text-center",
            dragOver && "border-primary bg-primary-subtle",
            disabled && "opacity-60",
          )}
        >
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              Upload images
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => setLibraryOpen(true)}
            >
              <Images aria-hidden /> Select existing
            </Button>
          </div>
          <p className="text-xs text-fg-subtle">or drop JPEG, PNG or WebP images here</p>
        </div>
      )}

      {!empty && !disabled && (
        <div className="flex items-center justify-between text-xs text-fg-subtle">
          <span>Drag to reorder. The first image is the primary image.</span>
          <Button
            variant="link"
            size="sm"
            onClick={() => setLibraryOpen(true)}
            className="h-auto px-0"
          >
            Select existing
          </Button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={MEDIA_ACCEPT}
        multiple
        hidden
        aria-label="Upload images"
        onChange={(e) => {
          if (e.target.files) enqueue(e.target.files);
          e.target.value = "";
        }}
      />

      <AltTextDialog
        item={editing}
        onClose={() => setEditing(null)}
        onSave={(alt) => {
          if (!editing) return;
          onChange({
            ...value,
            items: value.items.map((i) =>
              i.media_asset_id === editing.media_asset_id ? { ...i, alt_text: alt } : i,
            ),
          });
          setEditing(null);
        }}
      />

      <LibraryDialog
        open={libraryOpen}
        exclude={new Set(value.items.map((i) => i.media_asset_id))}
        onClose={() => setLibraryOpen(false)}
        onAdd={(assets) => {
          addItems(assets.map(toGalleryItem));
          setLibraryOpen(false);
        }}
      />
    </div>
  );
}

function AltTextDialog({
  item,
  onClose,
  onSave,
}: {
  item: GalleryItem | null;
  onClose: () => void;
  onSave: (alt: string | null) => void;
}) {
  const [text, setText] = useState("");
  useEffect(() => setText(item?.alt_text ?? ""), [item]);
  return (
    <Dialog
      open={Boolean(item)}
      onClose={onClose}
      title="Alt text"
      description="Describe the image for people using screen readers and for search engines."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(text.trim() || null)}>Done</Button>
        </>
      }
    >
      {item && (
        <div className="flex gap-4">
          <img
            src={item.thumb_url ?? item.url}
            alt=""
            className="size-20 shrink-0 rounded-lg border border-border object-cover"
          />
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor="alt-text-input">Alt text</Label>
            <Textarea
              id="alt-text-input"
              value={text}
              maxLength={500}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-fg-subtle">{text.length}/500</p>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function LibraryDialog({
  open,
  exclude,
  onClose,
  onAdd,
}: {
  open: boolean;
  exclude: Set<string>;
  onClose: () => void;
  onAdd: (assets: MediaAssetSummary[]) => void;
}) {
  const [selected, setSelected] = useState<Map<string, MediaAssetSummary>>(new Map());
  const library = useMediaLibrary({ page: 1, page_size: 48 }, open);
  useEffect(() => {
    if (open) setSelected(new Map());
  }, [open]);

  const toggle = (a: MediaAssetSummary) =>
    setSelected((s) => {
      const next = new Map(s);
      if (next.has(a.id)) next.delete(a.id);
      else next.set(a.id, a);
      return next;
    });

  const assets = library.data?.data.filter((a) => !exclude.has(a.id)) ?? [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Select images"
      description="Reuse images already uploaded to this store."
      className="w-[min(44rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!selected.size} onClick={() => onAdd([...selected.values()])}>
            Add {selected.size || ""} {selected.size === 1 ? "image" : "images"}
          </Button>
        </>
      }
    >
      {library.isPending ? (
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      ) : library.isError ? (
        <Alert tone="danger" title="Couldn't load your images">
          {library.error.message}
        </Alert>
      ) : assets.length === 0 ? (
        <p className="py-6 text-center text-sm text-fg-muted">No other images in this store yet.</p>
      ) : (
        <ul
          className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4"
          aria-label="Store images"
        >
          {assets.map((a) => {
            const isSel = selected.has(a.id);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  aria-pressed={isSel}
                  aria-label={`${a.alt_text || a.original_filename || "Image"} (${formatBytes(a.size_bytes)})`}
                  onClick={() => toggle(a)}
                  className={cn(
                    "relative block aspect-square w-full overflow-hidden rounded-lg border-2 border-transparent bg-surface-sunken",
                    isSel && "border-primary",
                  )}
                >
                  <img src={a.thumb_url ?? a.url} alt="" className="size-full object-cover" />
                  {isSel && (
                    <span
                      aria-hidden
                      className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-fg"
                    >
                      ✓
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
