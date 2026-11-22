"use client";

import dynamic from "next/dynamic";
import { useId, useMemo, useState } from "react";
import { ImagePlus, Upload, X } from "lucide-react";
import { FONTS, isValueField, type ColorScheme, type Field } from "@cartforge/theme-engine";
import type { ThemeImage } from "@cartforge/types";
import { Button, Dialog, Input, Select, Spinner, Textarea } from "@cartforge/ui";
import { ChipPicker } from "@/components/chip-picker";
import { useCategories, useCollections } from "@/lib/catalog";
import { ACCEPTED_TYPES, uploadMedia, useMediaLibrary } from "@/lib/media";
import { useMenus, usePages } from "@/lib/online-store";
import { useProductList } from "@/lib/products";
import { useSession } from "@/lib/session";

const RichTextEditor = dynamic(() => import("@/components/products/rich-text-editor"), {
  ssr: false,
  loading: () => <div className="h-28 animate-pulse rounded-md bg-surface-sunken" />,
});

export interface FieldCtx {
  schemes: ColorScheme[];
  images: Record<string, ThemeImage>;
  /** Remember an image picked from the library (for thumbnails). */
  addImage: (id: string, img: ThemeImage) => void;
}

const labelCls = "mb-1.5 block text-sm font-medium";

function Labelled({
  id,
  field,
  error,
  children,
}: {
  id: string;
  field: { label: string; info?: string };
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {field.label}
      </label>
      {children}
      {field.info && <p className="mt-1 text-xs text-fg-muted">{field.info}</p>}
      {error && (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Media library picker with upload. */
function ImageField({
  id,
  value,
  onChange,
  ctx,
}: {
  id: string;
  value: string | null;
  onChange: (v: string | null) => void;
  ctx: FieldCtx;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [uploading, setUploading] = useState(false);
  const storeId = useSession().store?.store_id;
  const lib = useMediaLibrary({ q: q || undefined, page: 1, page_size: 48, type: "image" }, open);
  const img = value ? ctx.images[value] : undefined;
  const pick = (a: {
    id: string;
    url: string;
    medium_url: string | null;
    large_url: string | null;
    width: number | null;
    height: number | null;
    alt_text: string | null;
  }) => {
    ctx.addImage(a.id, {
      url: a.url,
      medium_url: a.medium_url,
      large_url: a.large_url,
      width: a.width,
      height: a.height,
      alt: a.alt_text,
    });
    onChange(a.id);
    setOpen(false);
  };
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-sunken">
        {img ? (
          <img src={img.medium_url ?? img.url} alt="" className="h-full w-full object-cover" />
        ) : value ? (
          <span className="px-1 text-center text-[10px] text-fg-muted">Image not found</span>
        ) : (
          <ImagePlus aria-hidden className="size-5 text-fg-subtle" />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button id={id} size="sm" variant="secondary" onClick={() => setOpen(true)}>
          {value ? "Change" : "Select image"}
        </Button>
        {value && (
          <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
            Remove
          </Button>
        )}
      </div>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Choose an image"
        className="max-w-2xl"
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label="Search images"
              placeholder="Search by file name"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="min-w-48 flex-1"
            />
            <Button asChild variant="secondary">
              <label className="cursor-pointer">
                {uploading ? <Spinner /> : <Upload aria-hidden />} Upload
                <input
                  type="file"
                  accept={ACCEPTED_TYPES.join(",")}
                  className="sr-only"
                  disabled={uploading || !storeId}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file || !storeId) return;
                    setUploading(true);
                    try {
                      pick(await uploadMedia(file, storeId, () => {}).promise);
                    } catch {
                      /* the library shows nothing new; the user can retry */
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
              </label>
            </Button>
          </div>
          {lib.isLoading ? (
            <div className="h-40 animate-pulse rounded-md bg-surface-sunken" />
          ) : (lib.data?.data.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-fg-muted">No images yet. Upload one.</p>
          ) : (
            <ul className="grid max-h-[55vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {lib.data!.data.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => pick(a)}
                    className={`block w-full overflow-hidden rounded-md border-2 ${a.id === value ? "border-primary" : "border-transparent hover:border-border-strong"}`}
                  >
                    <img
                      src={a.thumb_url ?? a.url}
                      alt={a.alt_text ?? a.original_filename ?? ""}
                      className="aspect-square w-full object-cover"
                    />
                    <span className="sr-only">{a.original_filename}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>
    </div>
  );
}

function ColorInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  const shown = /^#[0-9a-f]{6}$/i.test(text) && text.toLowerCase() !== value ? value : text;
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label="Pick a color"
        value={value}
        onChange={(e) => (setText(e.target.value), onChange(e.target.value))}
        className="h-9 w-11 cursor-pointer rounded border border-border bg-transparent p-0.5"
      />
      <Input
        id={id}
        value={shown}
        maxLength={7}
        className="w-28 font-mono"
        onChange={(e) => {
          setText(e.target.value);
          if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toLowerCase());
        }}
      />
    </div>
  );
}

/** Suggestions for link fields: store pages plus collections, categories and pages. */
function LinkInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const list = `${id}-options`;
  const collections = useCollections({ page_size: 100 });
  const categories = useCategories();
  const pages = usePages();
  const options = useMemo(
    () => [
      { v: "/", l: "Home" },
      { v: "/products", l: "All products" },
      { v: "/collections", l: "All collections" },
      { v: "/search", l: "Search" },
      ...(collections.data?.data ?? []).map((c) => ({
        v: `/collections/${c.handle}`,
        l: `Collection: ${c.title}`,
      })),
      ...(categories.data ?? []).map((c) => ({
        v: `/categories/${c.handle}`,
        l: `Category: ${c.path}`,
      })),
      ...(pages.data ?? []).map((p) => ({ v: `/pages/${p.handle}`, l: `Page: ${p.title}` })),
    ],
    [collections.data, categories.data, pages.data],
  );
  return (
    <>
      <Input
        id={id}
        value={value}
        list={list}
        placeholder={placeholder ?? "/collections/… or https://…"}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={list}>
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </datalist>
    </>
  );
}

function SingleRef({
  id,
  kind,
  value,
  onChange,
}: {
  id: string;
  kind: "collection" | "category" | "product";
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const collections = useCollections({ page_size: 100 });
  const categories = useCategories();
  const products = useProductList({ page: 1, page_size: 100, sort: "title", order: "asc" });
  const options =
    kind === "collection"
      ? (collections.data?.data ?? []).map((c) => ({ v: c.handle, l: c.title }))
      : kind === "category"
        ? (categories.data ?? []).map((c) => ({ v: c.handle, l: c.path }))
        : (products.data?.data ?? []).map((p) => ({ v: p.handle, l: p.title }));
  return (
    <Select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{kind === "collection" ? "Automatic" : "None"}</option>
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.l}
        </option>
      ))}
    </Select>
  );
}

function MultiRef({
  kind,
  label,
  value,
  onChange,
}: {
  kind: "products" | "collections";
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const collections = useCollections({ page_size: 100 });
  const products = useProductList({ page: 1, page_size: 100, sort: "title", order: "asc" });
  const options =
    kind === "collections"
      ? (collections.data?.data ?? []).map((c) => ({ id: c.handle, label: c.title }))
      : (products.data?.data ?? []).map((p) => ({ id: p.handle, label: p.title }));
  return (
    <ChipPicker
      label={label}
      emptyText={kind === "collections" ? "Automatic" : "None chosen"}
      addLabel={value.length ? "Edit" : "Choose"}
      options={options}
      value={value}
      onChange={onChange}
    />
  );
}

function MenuSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const menus = useMenus();
  const list = menus.data ?? [];
  return (
    <div className="flex flex-col gap-1">
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">No menu</option>
        {!list.some((m) => m.handle === value) && value && <option value={value}>{value}</option>}
        {list.map((m) => (
          <option key={m.id} value={m.handle}>
            {m.title}
          </option>
        ))}
      </Select>
      <a
        href="/admin/online-store/navigation"
        target="_blank"
        rel="noreferrer"
        className="text-xs text-primary hover:underline"
      >
        Edit menus
      </a>
    </div>
  );
}

/** One setting, by field type. */
export function SettingField({
  field,
  value,
  onChange,
  ctx,
  error,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
  ctx: FieldCtx;
  error?: string;
}) {
  const id = useId();
  if (!isValueField(field))
    return field.type === "header" ? (
      <h4 className="mt-2 border-t border-border pt-4 text-xs font-semibold uppercase tracking-wide text-fg-muted">
        {field.label}
      </h4>
    ) : (
      <p className="text-xs text-fg-muted">{field.label}</p>
    );
  const str = typeof value === "string" ? value : "";
  switch (field.type) {
    case "text":
      return (
        <Labelled id={id} field={field} error={error}>
          <Input
            id={id}
            value={str}
            maxLength={field.max ?? 200}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        </Labelled>
      );
    case "textarea":
      return (
        <Labelled id={id} field={field} error={error}>
          <Textarea
            id={id}
            value={str}
            rows={3}
            maxLength={field.max ?? 2000}
            onChange={(e) => onChange(e.target.value)}
          />
        </Labelled>
      );
    case "richtext":
      return (
        <div>
          <span id={id} className={labelCls}>
            {field.label}
          </span>
          <RichTextEditor value={str} onChange={onChange} labelledBy={id} />
          {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        </div>
      );
    case "image":
      return (
        <Labelled id={id} field={field} error={error}>
          <ImageField
            id={id}
            value={typeof value === "string" ? value : null}
            onChange={onChange}
            ctx={ctx}
          />
        </Labelled>
      );
    case "select":
      return (
        <Labelled id={id} field={field} error={error}>
          <Select id={id} value={str || field.default} onChange={(e) => onChange(e.target.value)}>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Labelled>
      );
    case "radio":
      return (
        <fieldset>
          <legend className={labelCls}>{field.label}</legend>
          <div className="flex flex-wrap gap-3">
            {field.options.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={id}
                  checked={str === o.value}
                  onChange={() => onChange(o.value)}
                  className="size-4 accent-primary"
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
      );
    case "checkbox":
      return (
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--cf-color-primary)]"
          />
          <span>
            <span className="block text-sm">{field.label}</span>
            {field.info && <span className="block text-xs text-fg-muted">{field.info}</span>}
          </span>
        </label>
      );
    case "range": {
      const n = typeof value === "number" ? value : field.default;
      return (
        <Labelled id={id} field={field} error={error}>
          <div className="flex items-center gap-3">
            <input
              id={id}
              type="range"
              min={field.min}
              max={field.max}
              step={field.step ?? 1}
              value={n}
              onChange={(e) => onChange(Number(e.target.value))}
              className="flex-1 accent-[var(--cf-color-primary)]"
            />
            <span className="w-16 text-right text-sm tabular-nums">
              {n}
              {field.unit ?? ""}
            </span>
          </div>
        </Labelled>
      );
    }
    case "color":
      return (
        <Labelled id={id} field={field} error={error}>
          <ColorInput id={id} value={str || field.default} onChange={onChange} />
        </Labelled>
      );
    case "color_scheme":
      return (
        <Labelled id={id} field={field} error={error}>
          <div role="radiogroup" aria-labelledby={id} className="grid grid-cols-2 gap-2">
            <span id={id} hidden>
              {field.label}
            </span>
            {ctx.schemes.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={str === s.id}
                onClick={() => onChange(s.id)}
                className={`flex items-center gap-2 rounded-md border p-2 text-left text-xs ${str === s.id ? "border-primary ring-1 ring-primary" : "border-border hover:border-border-strong"}`}
              >
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded border border-border text-[11px] font-semibold"
                  style={{ background: s.background, color: s.text }}
                >
                  Aa
                </span>
                <span className="truncate">{s.name}</span>
              </button>
            ))}
          </div>
        </Labelled>
      );
    case "font":
      return (
        <Labelled id={id} field={field} error={error}>
          <Select id={id} value={str || field.default} onChange={(e) => onChange(e.target.value)}>
            {(["sans", "serif", "display", "script", "urdu", "mono"] as const).map((cat) => (
              <optgroup
                key={cat}
                label={
                  {
                    sans: "Sans serif",
                    serif: "Serif",
                    display: "Display",
                    script: "Script",
                    urdu: "Urdu / Arabic",
                    mono: "Monospace",
                  }[cat]
                }
              >
                {FONTS.filter((f) => f.category === cat).map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Labelled>
      );
    case "link":
      return (
        <Labelled id={id} field={field} error={error}>
          <LinkInput id={id} value={str} onChange={onChange} placeholder={field.placeholder} />
        </Labelled>
      );
    case "collection":
    case "category":
    case "product":
      return (
        <Labelled id={id} field={field} error={error}>
          <SingleRef
            id={id}
            kind={field.type}
            value={typeof value === "string" ? value : null}
            onChange={onChange}
          />
        </Labelled>
      );
    case "products":
    case "collections":
      return (
        <div>
          <MultiRef
            kind={field.type}
            label={field.label}
            value={Array.isArray(value) ? (value as string[]) : []}
            onChange={onChange}
          />
          {field.info && <p className="mt-1 text-xs text-fg-muted">{field.info}</p>}
          {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        </div>
      );
    case "menu":
      return (
        <Labelled id={id} field={field} error={error}>
          <MenuSelect id={id} value={str} onChange={onChange} />
        </Labelled>
      );
    case "video":
      return (
        <Labelled id={id} field={field} error={error}>
          <div className="flex gap-2">
            <Input
              id={id}
              value={str}
              placeholder="https://www.youtube.com/watch?v=…"
              onChange={(e) => onChange(e.target.value || null)}
            />
            {str && (
              <Button size="icon" variant="ghost" aria-label="Clear" onClick={() => onChange(null)}>
                <X aria-hidden />
              </Button>
            )}
          </div>
        </Labelled>
      );
  }
}

/** A list of settings. `errorFor(id)` gives the error for one setting, if any. */
export function SettingsForm({
  fields,
  values,
  onChange,
  ctx,
  errorFor,
}: {
  fields: Field[];
  values: Record<string, unknown>;
  onChange: (id: string, v: unknown) => void;
  ctx: FieldCtx;
  errorFor?: (id: string) => string | undefined;
}) {
  if (!fields.length) return <p className="text-sm text-fg-muted">This block has no settings.</p>;
  return (
    <div className="flex flex-col gap-5">
      {fields.map((f, i) => (
        <SettingField
          key={f.id ?? `${f.type}-${i}`}
          field={f}
          value={f.id ? values[f.id] : undefined}
          onChange={(v) => f.id && onChange(f.id, v)}
          ctx={ctx}
          error={f.id ? errorFor?.(f.id) : undefined}
        />
      ))}
    </div>
  );
}
