"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { ArrowLeft, Copy, Eye } from "lucide-react";
import { CATALOG_ERROR_CODES, PERMISSIONS, type ProductDetail } from "@cartforge/types";
import { AdjustStockDialog } from "@/components/inventory/adjust-stock-dialog";
import { MovementsDialog } from "@/components/inventory/movements-dialog";
import { MediaGallery, type GalleryValue } from "./media-gallery";
import { VariantsCard } from "./variants-card";
import { ActivityCard } from "./activity-card";
import { ChipPicker } from "@/components/chip-picker";
import { TagInput } from "@/components/tag-input";
import { useCategories, useCollections, useDuplicateProduct } from "@/lib/catalog";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Field,
  Input,
  Label,
  Dialog,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from "@cartforge/ui";
import {
  DESCRIPTION_MAX,
  HANDLE_MAX,
  HANDLE_PATTERN,
  PRODUCT_STATUSES,
  SEO_DESCRIPTION_RECOMMENDED,
  SEO_TITLE_RECOMMENDED,
  PRODUCT_TYPES,
  TITLE_MAX,
  VENDOR_MAX,
  currencyExponent,
  formatMoney,
  minorToDecimalString,
  parseMoneyToMinor,
  requiredText,
  slugify,
  type ProductCreateInput,
  type ProductUpdateInput,
} from "@cartforge/validation";
import { ApiError } from "@/lib/api-client";
import { applyServerErrors } from "@/lib/forms";
import { formatDateTime } from "@/lib/format";
import { STATUS_LABEL, STATUS_TONE, lastListUrl, usePreviewProduct } from "@/lib/products";
import { useSession } from "@/lib/session";
import { useStoreSettings } from "@/lib/store";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-guard";
import { ProductSaleBanner } from "./product-sale-banner";

// Editor bundle loads only on product screens (FE-009).
const RichTextEditor = dynamic(() => import("./rich-text-editor"), {
  ssr: false,
  loading: () => <Skeleton className="h-52 w-full" />,
});

const moneyField = (currency: string) =>
  z.string().refine((v) => !Number.isNaN(parseMoneyToMinor(v, currency)), {
    message:
      currencyExponent(currency) === 0
        ? "Enter a whole amount, e.g. 1500"
        : `Enter an amount like 19.99 (up to ${currencyExponent(currency)} decimals)`,
  });

const makeSchema = (currency: string) =>
  z
    .object({
      title: requiredText(TITLE_MAX),
      description_html: z.string().max(DESCRIPTION_MAX, "Description is too long"),
      product_type: z.enum(PRODUCT_TYPES),
      vendor: z.string().trim().max(VENDOR_MAX, `Must be ${VENDOR_MAX} characters or fewer`),
      status: z.enum(PRODUCT_STATUSES),
      handle: z
        .string()
        .trim()
        .toLowerCase()
        .max(HANDLE_MAX, `Must be ${HANDLE_MAX} characters or fewer`)
        .refine(
          (v) => v === "" || HANDLE_PATTERN.test(v),
          "Use lowercase letters, numbers and single hyphens",
        ),
      price: moneyField(currency),
      compare_at: moneyField(currency),
      cost: moneyField(currency),
      taxable: z.boolean(),
      gallery: z.custom<GalleryValue>(),
      category_ids: z.array(z.string()),
      collection_ids: z.array(z.string()),
      tags: z.array(z.string()),
      seo_title: z.string().trim().max(255, "Must be 255 characters or fewer"),
      seo_description: z.string().trim().max(500, "Must be 500 characters or fewer"),
      sku: z.string().trim().max(100, "Must be 100 characters or fewer"),
      barcode: z.string().trim().max(100, "Must be 100 characters or fewer"),
      inventory_tracking: z.boolean(),
      continue_selling: z.boolean(),
      threshold: z
        .string()
        .trim()
        .refine((v) => v === "" || /^\d{1,7}$/.test(v), "Enter a whole number, or leave blank"),
      quantity: z
        .string()
        .trim()
        .refine((v) => v === "" || /^\d{1,7}$/.test(v), "Enter a whole number"),
    })
    .superRefine((v, ctx) => {
      const price = parseMoneyToMinor(v.price, currency);
      const compare = parseMoneyToMinor(v.compare_at, currency);
      if (
        price !== null &&
        compare !== null &&
        !Number.isNaN(price) &&
        !Number.isNaN(compare) &&
        compare <= price
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["compare_at"],
          message: "Compare-at price must be higher than the price",
        });
      }
    });
type FormSchema = ReturnType<typeof makeSchema>;
export type ProductFormValues = z.input<FormSchema>;
const FIELDS = [
  "title",
  "description_html",
  "product_type",
  "vendor",
  "status",
  "handle",
  "price",
  "compare_at",
  "cost",
  "gallery",
  "sku",
  "barcode",
  "threshold",
  "quantity",
  "category_ids",
  "collection_ids",
  "tags",
  "seo_title",
  "seo_description",
] as const;

/** Server field paths → form field names. */
const SERVER_FIELD: Record<string, (typeof FIELDS)[number]> = {
  price_minor: "price",
  compare_at_minor: "compare_at",
  cost_minor: "cost",
  media: "gallery",
  primary_media_id: "gallery",
  low_stock_threshold: "threshold",
  inventory_quantity: "quantity",
};
function mapServerError(err: unknown): unknown {
  if (!(err instanceof ApiError) || !err.fields.length) return err;
  const fields = err.fields.map((f) => {
    const root = f.path.split(".")[0] ?? f.path;
    return SERVER_FIELD[f.path] || SERVER_FIELD[root]
      ? { ...f, path: SERVER_FIELD[f.path] ?? SERVER_FIELD[root]! }
      : f;
  });
  return new ApiError(err.status, err.code, err.message, err.requestId, fields);
}

export function toFormValues(p: ProductDetail | undefined, currency: string): ProductFormValues {
  return {
    title: p?.title ?? "",
    description_html: p?.description_html ?? "",
    product_type: p?.product_type ?? "simple",
    vendor: p?.vendor ?? "",
    status: p?.status ?? "draft",
    handle: p?.handle ?? "",
    price: minorToDecimalString(p?.price_minor, currency),
    compare_at: minorToDecimalString(p?.compare_at_minor, currency),
    cost: minorToDecimalString(p?.cost_minor, currency),
    taxable: p?.taxable ?? true,
    sku: (p?.product_type === "simple" && p.variants[0]?.sku) || "",
    barcode: (p?.product_type === "simple" && p.variants[0]?.barcode) || "",
    inventory_tracking: p?.variants[0]?.inventory_tracking ?? true,
    continue_selling: p?.variants[0]?.continue_selling ?? false,
    threshold: p?.variants[0]?.inventory.low_stock_threshold?.toString() ?? "",
    quantity: "",
    category_ids: p?.categories.map((c) => c.id) ?? [],
    collection_ids: p?.collections.map((c) => c.id) ?? [],
    tags: p?.tags ?? [],
    seo_title: p?.seo_title ?? "",
    seo_description: p?.seo_description ?? "",
    // Primary first: the UI treats the first image as primary.
    gallery: {
      items: [...(p?.media ?? [])]
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
        .map((m) => ({
          media_asset_id: m.media_asset_id,
          alt_text: m.alt_text,
          url: m.url,
          thumb_url: m.thumb_url,
          medium_url: m.medium_url,
          width: m.width,
          height: m.height,
          media_type: m.media_type,
          duration_ms: m.duration_ms,
        })),
      primary: null,
    },
  };
}

type SubmitResult = { ok: true; product: ProductDetail } | { ok: false; error: unknown };

export interface ProductFormProps {
  product?: ProductDetail;
  onCreate?: (body: ProductCreateInput) => Promise<SubmitResult>;
  onUpdate?: (body: ProductUpdateInput) => Promise<SubmitResult>;
  onDelete?: () => void;
}

/** Resolves the currency (product's, or the store's for new products) before rendering. */
export function ProductForm(props: ProductFormProps) {
  const store = useStoreSettings();
  const currency = props.product?.currency ?? store.data?.currency;
  if (!currency) {
    return store.isError ? (
      <Alert tone="danger" title="Couldn't load store settings">
        {store.error.message}
      </Alert>
    ) : (
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  return <ProductFormInner {...props} currency={currency} />;
}

function ProductFormInner({
  product,
  onCreate,
  onUpdate,
  onDelete,
  currency,
}: ProductFormProps & { currency: string }) {
  const isNew = !product;
  const { can } = useSession();
  const canWrite = can(PERMISSIONS.PRODUCTS_WRITE);
  const canPublish = can(PERMISSIONS.PRODUCTS_PUBLISH);
  const canDelete = can(PERMISSIONS.PRODUCTS_DELETE);
  const descLabelId = useId();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmHandle, setConfirmHandle] = useState<ProductUpdateInput | null>(null);
  const [uploading, setUploading] = useState(false);
  const { store } = useSession();
  const [schema] = useState(() => makeSchema(currency));

  const form = useForm<ProductFormValues, unknown, z.output<FormSchema>>({
    resolver: zodResolver(schema),
    defaultValues: toFormValues(product, currency),
    mode: "onTouched",
  });
  const productType = form.watch("product_type");
  const [priceText, costText] = form.watch(["price", "cost"]);
  const money = (v: string) => parseMoneyToMinor(v, currency);
  const toMinor = (v: string) => {
    const m = money(v);
    return m === null || Number.isNaN(m) ? null : m;
  };
  const { errors, isDirty, isSubmitting, dirtyFields } = form.formState;
  const title = form.watch("title");

  useUnsavedChangesGuard(isDirty && !isSubmitting);
  const canAdjust = can(PERMISSIONS.INVENTORY_ADJUST);
  const categories = useCategories();
  const collections = useCollections();
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [seoTitle, seoDescription, handleValue, descriptionHtml] = form.watch([
    "seo_title",
    "seo_description",
    "handle",
    "description_html",
  ]);
  const plainDescription = descriptionHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Variant/option/stock changes update the product outside this form. Refresh the
  // form from the server when there are no unsaved edits to lose.
  const updatedAt = product?.updated_at;
  const stockKey = product?.variants.map((v) => `${v.id}:${v.inventory.on_hand}`).join(",");
  useEffect(() => {
    if (product && !form.formState.isDirty) form.reset(toFormValues(product, currency));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to server-side changes only
  }, [updatedAt, stockKey, product?.product_type]);

  const handleResult = (res: SubmitResult) => {
    if (res.ok) {
      form.reset(toFormValues(res.product, currency));
      return;
    }
    if (
      res.error instanceof ApiError &&
      res.error.code === CATALOG_ERROR_CODES.HANDLE_CHANGE_REQUIRES_CONFIRMATION
    ) {
      return "confirm";
    }
    setFormError(applyServerErrors(mapServerError(res.error), form.setError, FIELDS));
  };

  const submit = form.handleSubmit(async (v) => {
    setFormError(null);
    if (uploading) {
      setFormError("Wait for image uploads to finish, then save.");
      return;
    }
    const simple = v.product_type === "simple";
    const media = v.gallery.items.map((i) => ({
      media_asset_id: i.media_asset_id,
      alt_text: i.alt_text,
    }));
    const primary_media_id = v.gallery.primary ?? v.gallery.items[0]?.media_asset_id ?? null;
    if (isNew) {
      if (!onCreate) return;
      const res = await onCreate({
        title: v.title,
        description_html: v.description_html,
        product_type: v.product_type,
        vendor: v.vendor || null,
        status: v.status,
        handle: v.handle || undefined,
        taxable: v.taxable,
        ...(simple && {
          sku: v.sku || null,
          barcode: v.barcode || null,
          inventory_tracking: v.inventory_tracking,
          continue_selling: v.continue_selling,
          low_stock_threshold: v.threshold ? Number(v.threshold) : null,
          ...(canAdjust &&
            v.inventory_tracking &&
            v.quantity && { inventory_quantity: Number(v.quantity) }),
        }),
        ...(simple && {
          price_minor: toMinor(v.price),
          compare_at_minor: toMinor(v.compare_at),
          cost_minor: toMinor(v.cost),
        }),
        ...(media.length && { media, primary_media_id }),
        ...(v.category_ids.length && { category_ids: v.category_ids }),
        ...(v.collection_ids.length && { collection_ids: v.collection_ids }),
        ...(v.tags.length && { tags: v.tags }),
        ...(v.seo_title && { seo_title: v.seo_title }),
        ...(v.seo_description && { seo_description: v.seo_description }),
      });
      // On success the page navigates away; keep the form as-is until then.
      if (!res.ok) handleResult(res);
      return;
    }
    if (!onUpdate) return;
    // Send only what changed (PATCH semantics).
    const body: ProductUpdateInput = {};
    if (dirtyFields.title) body.title = v.title;
    if (dirtyFields.description_html) body.description_html = v.description_html;
    if (dirtyFields.vendor) body.vendor = v.vendor || null;
    if (dirtyFields.status) body.status = v.status;
    if (dirtyFields.taxable) body.taxable = v.taxable;
    if (simple) {
      if (dirtyFields.price) body.price_minor = toMinor(v.price);
      if (dirtyFields.compare_at) body.compare_at_minor = toMinor(v.compare_at);
      if (dirtyFields.cost) body.cost_minor = toMinor(v.cost);
      if (dirtyFields.sku) body.sku = v.sku || null;
      if (dirtyFields.barcode) body.barcode = v.barcode || null;
      if (dirtyFields.inventory_tracking) body.inventory_tracking = v.inventory_tracking;
      if (dirtyFields.continue_selling) body.continue_selling = v.continue_selling;
      if (dirtyFields.threshold)
        body.low_stock_threshold = v.threshold ? Number(v.threshold) : null;
    }
    if (dirtyFields.category_ids) body.category_ids = v.category_ids;
    if (dirtyFields.collection_ids) body.collection_ids = v.collection_ids;
    if (dirtyFields.tags) body.tags = v.tags;
    if (dirtyFields.seo_title) body.seo_title = v.seo_title || null;
    if (dirtyFields.seo_description) body.seo_description = v.seo_description || null;
    if (dirtyFields.gallery) {
      body.media = media;
      body.primary_media_id = primary_media_id;
    }
    if (dirtyFields.handle) {
      if (!v.handle) {
        form.setError("handle", { message: "Handle is required" });
        return;
      }
      body.handle = v.handle;
    }
    if (!Object.keys(body).length) return form.reset(form.getValues());
    if (handleResult(await onUpdate(body)) === "confirm") setConfirmHandle(body);
  });

  const confirmHandleChange = async () => {
    if (!confirmHandle || !onUpdate) return;
    const res = await onUpdate({ ...confirmHandle, confirm_handle_change: true });
    setConfirmHandle(null);
    handleResult(res);
  };

  const heading = isNew ? "Add product" : product.title;
  const showSaveBar = canWrite && (isNew || isDirty);

  // Ctrl/⌘+S saves when there is something to save.
  useEffect(() => {
    if (!showSaveBar) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!isSubmitting) void submit();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showSaveBar, isSubmitting, submit]);

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6 pb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Button asChild variant="secondary" size="icon" className="mt-0.5 shrink-0">
            <Link href={lastListUrl()} aria-label="Back to products">
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold tracking-tight">{heading}</h1>
              {product && (
                <Badge tone={STATUS_TONE[product.status]}>{STATUS_LABEL[product.status]}</Badge>
              )}
            </div>
            {product && (
              <p className="mt-1 text-sm text-fg-muted">
                Last updated {formatDateTime(product.updated_at)}
                {product.updated_by && <> by {product.updated_by.name}</>}
              </p>
            )}
          </div>
        </div>
        {product && (
          <div className="flex flex-wrap gap-2">
            <PreviewButton productId={product.id} unsaved={isDirty} />
            {canWrite && (
              <Button
                variant="secondary"
                onClick={() => setDuplicateOpen(true)}
                disabled={isDirty}
                title={isDirty ? "Save your changes first" : undefined}
              >
                <Copy aria-hidden /> Duplicate
              </Button>
            )}
            {canDelete && onDelete && (
              <Button variant="secondary" onClick={onDelete} className="text-danger">
                Delete
              </Button>
            )}
          </div>
        )}
      </div>

      {product && <ProductSaleBanner productId={product.id} />}
      {formError && <Alert tone="danger" title={formError} />}
      {!canWrite && (
        <Alert tone="info" title="View only">
          Your role can view this product but not change it.
        </Alert>
      )}

      <fieldset disabled={!canWrite || isSubmitting} className="grid min-w-0 gap-6 lg:grid-cols-3">
        <legend className="sr-only">Product details</legend>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader title="Basic information" />
            <CardBody className="flex flex-col gap-5">
              <Field
                label="Title"
                error={errors.title?.message}
                required
                hint={`Up to ${TITLE_MAX} characters.`}
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    placeholder="e.g. Classic cotton T-shirt"
                    autoFocus={isNew}
                    {...form.register("title")}
                  />
                )}
              </Field>

              <div className="flex flex-col gap-1.5">
                <Label id={descLabelId}>Description</Label>
                <Controller
                  control={form.control}
                  name="description_html"
                  render={({ field, fieldState }) => (
                    <>
                      <RichTextEditor
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        labelledBy={descLabelId}
                        invalid={Boolean(fieldState.error)}
                        disabled={!canWrite || isSubmitting}
                      />
                      {fieldState.error && (
                        <p className="text-sm text-danger">{fieldState.error.message}</p>
                      )}
                    </>
                  )}
                />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Media"
              description="Images (JPEG, PNG, WebP) and videos (MP4, WebM, MOV). The primary item is shown in listings."
            />
            <CardBody>
              <Controller
                control={form.control}
                name="gallery"
                render={({ field, fieldState }) => (
                  <>
                    <MediaGallery
                      value={field.value}
                      onChange={field.onChange}
                      storeId={store!.store_id}
                      disabled={!canWrite || isSubmitting}
                      onBusyChange={setUploading}
                    />
                    {fieldState.error && (
                      <p className="mt-2 text-xs text-danger">{fieldState.error.message}</p>
                    )}
                  </>
                )}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Pricing" />
            <CardBody>
              {productType === "variable" ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-fg-muted">
                    This product is priced per variant. Edit prices in the Variants table below.
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      {...form.register("taxable")}
                    />
                    Charge tax on this product
                  </label>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <MoneyField
                      label="Price"
                      currency={currency}
                      error={errors.price?.message}
                      registration={form.register("price")}
                    />
                    <MoneyField
                      label="Compare-at price"
                      currency={currency}
                      error={errors.compare_at?.message}
                      hint="Shown crossed out to mark a sale. Must be higher than the price."
                      registration={form.register("compare_at")}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      {...form.register("taxable")}
                    />
                    Charge tax on this product
                  </label>
                  <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-3">
                    <MoneyField
                      label="Cost per item"
                      currency={currency}
                      error={errors.cost?.message}
                      hint="Internal — customers never see this."
                      registration={form.register("cost")}
                    />
                    <ProfitStat
                      price={toMinor(priceText)}
                      cost={toMinor(costText)}
                      currency={currency}
                    />
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          {productType === "simple" && (
            <Card>
              <CardHeader title="Inventory" />
              <CardBody className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="SKU (stock keeping unit)" error={errors.sku?.message}>
                    {({ id, describedBy, invalid }) => (
                      <Input
                        id={id}
                        aria-describedby={describedBy}
                        invalid={invalid}
                        {...form.register("sku")}
                      />
                    )}
                  </Field>
                  <Field label="Barcode (ISBN, UPC, GTIN…)" error={errors.barcode?.message}>
                    {({ id, describedBy, invalid }) => (
                      <Input
                        id={id}
                        aria-describedby={describedBy}
                        invalid={invalid}
                        {...form.register("barcode")}
                      />
                    )}
                  </Field>
                </div>
                <div className="flex flex-col gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      {...form.register("inventory_tracking")}
                    />
                    Track quantity
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      {...form.register("continue_selling")}
                    />
                    Continue selling when out of stock
                  </label>
                </div>
                {form.watch("inventory_tracking") && (
                  <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
                    {isNew ? (
                      canAdjust ? (
                        <Field
                          label="Quantity"
                          error={errors.quantity?.message}
                          hint="Starting stock at your main location."
                        >
                          {({ id, describedBy, invalid }) => (
                            <Input
                              id={id}
                              inputMode="numeric"
                              placeholder="0"
                              aria-describedby={describedBy}
                              invalid={invalid}
                              {...form.register("quantity")}
                            />
                          )}
                        </Field>
                      ) : (
                        <p className="text-sm text-fg-muted">
                          Someone with inventory access can add stock after saving.
                        </p>
                      )
                    ) : (
                      <div className="flex flex-col gap-1 text-sm">
                        <span className="text-fg">Quantity</span>
                        <div className="flex items-center gap-3">
                          <span
                            className="text-lg font-semibold tabular-nums"
                            data-testid="stock-on-hand"
                          >
                            {product.variants[0]?.inventory.on_hand ?? 0}
                          </span>
                          <span className="text-xs text-fg-muted">
                            on hand · {product.variants[0]?.inventory.available ?? 0} available
                          </span>
                        </div>
                        <div className="flex gap-2">
                          {canAdjust && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setAdjustOpen(true)}
                              disabled={isDirty}
                              title={isDirty ? "Save your changes first" : undefined}
                            >
                              Adjust stock
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}>
                            History
                          </Button>
                        </div>
                      </div>
                    )}
                    <Field
                      label="Low-stock alert at"
                      error={errors.threshold?.message}
                      hint="Leave blank for no alert."
                    >
                      {({ id, describedBy, invalid }) => (
                        <Input
                          id={id}
                          inputMode="numeric"
                          aria-describedby={describedBy}
                          invalid={invalid}
                          {...form.register("threshold")}
                        />
                      )}
                    </Field>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {product ? (
            <VariantsCard product={product} formDirty={isDirty} />
          ) : (
            <Card>
              <CardHeader title="Variants" />
              <CardBody>
                <p className="text-sm text-fg-muted">
                  Save the product first, then add options like size or color.
                </p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Search engine listing"
              description="How this product appears in search results and when shared."
            />
            <CardBody className="flex flex-col gap-4">
              <SearchPreview
                title={seoTitle || title || "Product title"}
                handle={handleValue || (isNew ? slugify(title) : product.handle) || "product"}
                description={seoDescription || plainDescription}
              />
              <Field
                label="Page title"
                error={errors.seo_title?.message}
                hint={
                  <Counter
                    n={seoTitle.length}
                    recommended={SEO_TITLE_RECOMMENDED}
                    fallback="Defaults to the product title."
                  />
                }
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    placeholder={title}
                    {...form.register("seo_title")}
                  />
                )}
              </Field>
              <Field
                label="Meta description"
                error={errors.seo_description?.message}
                hint={
                  <Counter
                    n={seoDescription.length}
                    recommended={SEO_DESCRIPTION_RECOMMENDED}
                    fallback="Defaults to the start of the description."
                  />
                }
              >
                {({ id, describedBy, invalid }) => (
                  <Textarea
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    className="min-h-16"
                    {...form.register("seo_description")}
                  />
                )}
              </Field>
              <Field
                label="URL handle"
                error={errors.handle?.message}
                hint={
                  isNew
                    ? "Leave blank to generate it from the title. Must be unique in your store."
                    : product.published_at
                      ? "This product has been published — changing the handle breaks existing links."
                      : "Must be unique in your store."
                }
              >
                {({ id, describedBy, invalid }) => (
                  <div className="flex items-stretch">
                    <span className="flex items-center rounded-l-md border border-r-0 border-border-strong bg-surface-sunken px-3 text-sm text-fg-subtle">
                      /products/
                    </span>
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      invalid={invalid}
                      className="rounded-l-none"
                      placeholder={isNew ? slugify(title) || "generated-from-title" : undefined}
                      {...form.register("handle")}
                    />
                  </div>
                )}
              </Field>
            </CardBody>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader title="Status" />
            <CardBody>
              <Field
                label="Product status"
                error={errors.status?.message}
                hint={
                  canPublish
                    ? "Draft products are hidden from your storefront. Active products are visible."
                    : "Your role can't change visibility. Products stay in Draft until someone with publish access activates them."
                }
              >
                {({ id, describedBy, invalid }) => (
                  <Select
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    disabled={!canPublish}
                    {...form.register("status")}
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </Select>
                )}
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Organization" />
            <CardBody className="flex flex-col gap-5">
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-fg">Product type</span>
                <span className="text-fg-muted">
                  {productType === "variable"
                    ? "Variable — has options"
                    : "Simple — single variant"}
                </span>
                <span className="text-xs text-fg-subtle">
                  Set by adding or removing options under Variants.
                </span>
              </div>
              <Field label="Vendor / brand" error={errors.vendor?.message}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    placeholder="e.g. Northwind"
                    {...form.register("vendor")}
                  />
                )}
              </Field>
              <Controller
                control={form.control}
                name="category_ids"
                render={({ field }) => (
                  <ChipPicker
                    label="Categories"
                    emptyText="No categories"
                    addLabel={field.value.length ? "Edit" : "Add"}
                    options={(categories.data ?? []).map((c) => ({
                      id: c.id,
                      label: c.name,
                      depth: c.depth,
                      hint: c.status === "archived" ? "Archived" : undefined,
                    }))}
                    value={field.value}
                    onChange={field.onChange}
                    disabled={!canWrite || isSubmitting}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="collection_ids"
                render={({ field }) => (
                  <ChipPicker
                    label="Collections"
                    emptyText="Not in any collection"
                    addLabel={field.value.length ? "Edit" : "Add"}
                    options={(collections.data?.data ?? []).map((c) => ({
                      id: c.id,
                      label: c.title,
                      hint: c.status === "active" ? undefined : c.status,
                    }))}
                    value={field.value}
                    onChange={field.onChange}
                    disabled={!canWrite || isSubmitting}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <TagInput label="Tags" values={field.value} onChange={field.onChange} />
                )}
              />
            </CardBody>
          </Card>

          {product && (
            <Card>
              <CardHeader title="Details" />
              <CardBody>
                <dl className="flex flex-col gap-2 text-sm">
                  <div>
                    <dt className="text-fg-muted">Created</dt>
                    <dd>
                      {formatDateTime(product.created_at)}
                      {product.created_by && <> · {product.created_by.name}</>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-fg-muted">Variants</dt>
                    <dd>{product.variants.length}</dd>
                  </div>
                </dl>
              </CardBody>
            </Card>
          )}
          {product && (
            <ActivityCard productId={product.id} version={`${product.updated_at}:${stockKey}`} />
          )}
        </div>
      </fieldset>

      {showSaveBar && (
        // Contextual save bar: overlays the top bar while there are unsaved changes.
        <div
          role="region"
          aria-label="Save changes"
          className="fixed inset-x-0 top-0 z-(--cf-z-savebar) flex h-(--cf-topbar-height) items-center gap-3 bg-savebar-bg px-4 text-savebar-fg shadow-lg sm:px-6"
        >
          <p className="mr-auto flex items-center gap-2 text-sm font-medium">
            <span aria-hidden className="size-2 rounded-full bg-primary" />
            {isNew ? "Unsaved product" : "Unsaved changes"}
          </p>
          {isNew ? (
            <Button
              asChild
              variant="ghost"
              className="text-savebar-fg hover:bg-white/10 hover:text-white"
            >
              <Link href={lastListUrl()}>Cancel</Link>
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() => form.reset()}
              disabled={isSubmitting}
              className="text-savebar-fg hover:bg-white/10 hover:text-white"
            >
              Discard
            </Button>
          )}
          <Button type="submit" loading={isSubmitting} aria-keyshortcuts="Control+S Meta+S">
            {isNew ? "Save product" : "Save"}
          </Button>
        </div>
      )}

      {product && (
        <>
          <AdjustStockDialog
            target={
              adjustOpen && product.variants[0]
                ? {
                    variant_id: product.variants[0].id,
                    label: product.title,
                    on_hand: product.variants[0].inventory.on_hand,
                  }
                : null
            }
            onClose={() => setAdjustOpen(false)}
          />
          <MovementsDialog
            target={
              historyOpen && product.variants[0]
                ? { variant_id: product.variants[0].id, label: product.title }
                : null
            }
            onClose={() => setHistoryOpen(false)}
          />
        </>
      )}

      {product && (
        <DuplicateDialog
          product={product}
          open={duplicateOpen}
          onClose={() => setDuplicateOpen(false)}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirmHandle)}
        title="Change the URL handle?"
        description="This product has been published. Links that use the old address will stop working."
        confirmLabel="Change handle"
        destructive
        pending={isSubmitting}
        onClose={() => setConfirmHandle(null)}
        onConfirm={() => void confirmHandleChange()}
      />
    </form>
  );
}

function MoneyField({
  label,
  currency,
  error,
  hint,
  registration,
}: {
  label: string;
  currency: string;
  error?: string;
  hint?: string;
  registration: ReturnType<ReturnType<typeof useForm<ProductFormValues>>["register"]>;
}) {
  const symbol =
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? currency;
  const decimals = currencyExponent(currency);
  return (
    <Field label={label} error={error} hint={hint}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <span
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-fg-subtle"
          >
            {symbol}
          </span>
          <Input
            id={id}
            inputMode={decimals ? "decimal" : "numeric"}
            autoComplete="off"
            placeholder={decimals ? `0.${"0".repeat(decimals)}` : "0"}
            aria-describedby={describedBy}
            invalid={invalid}
            className="pl-8 tabular-nums"
            {...registration}
          />
        </div>
      )}
    </Field>
  );
}

/** Profit and margin preview (internal; derived, never stored). */
function ProfitStat({
  price,
  cost,
  currency,
}: {
  price: number | null;
  cost: number | null;
  currency: string;
}) {
  const ready = price !== null && cost !== null;
  const profit = ready ? price - cost : null;
  const margin = ready && price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : null;
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-sm text-fg">Profit</span>
        <span
          className={`flex h-8 items-center text-sm tabular-nums ${profit !== null && profit < 0 ? "text-danger" : "text-fg-muted"}`}
        >
          {profit === null ? "—" : formatMoney(profit, currency)}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm text-fg">Margin</span>
        <span className="flex h-8 items-center text-sm tabular-nums text-fg-muted">
          {margin === null ? "—" : `${margin}%`}
        </span>
      </div>
    </>
  );
}

function Counter({
  n,
  recommended,
  fallback,
}: {
  n: number;
  recommended: number;
  fallback: string;
}) {
  if (!n) return <>{fallback}</>;
  return (
    <span className={n > recommended ? "text-warning" : undefined}>
      {n} of {recommended} characters recommended
      {n > recommended ? " — search engines may cut it off" : ""}
    </span>
  );
}

/** Approximation of a search result listing (PRD §8.4 H). */
function SearchPreview({
  title,
  handle,
  description,
}: {
  title: string;
  handle: string;
  description: string;
}) {
  const host = typeof window !== "undefined" ? window.location.host : "your-store.com";
  return (
    <div
      className="rounded-lg border border-border bg-surface-sunken/50 p-3"
      aria-label="Search result preview"
      role="group"
    >
      <p className="truncate text-xs text-fg-muted">
        {host} › products › {handle}
      </p>
      <p className="truncate text-base text-info">{title.slice(0, 70)}</p>
      <p className="line-clamp-2 text-xs text-fg-muted">
        {description || "Add a description to show a summary here."}
      </p>
    </div>
  );
}

function DuplicateDialog({
  product,
  open,
  onClose,
}: {
  product: ProductDetail;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const duplicate = useDuplicateProduct();
  const [title, setTitle] = useState(`Copy of ${product.title}`);
  const [media, setMedia] = useState(true);
  useEffect(() => {
    if (open) {
      setTitle(`Copy of ${product.title}`.slice(0, 200));
      setMedia(true);
    }
  }, [open, product.title]);
  return (
    <Dialog
      open={open}
      onClose={() => !duplicate.isPending && onClose()}
      title="Duplicate product"
      description="The copy starts as a draft with no SKUs and no stock."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={duplicate.isPending}>
            Cancel
          </Button>
          <Button
            loading={duplicate.isPending}
            onClick={async () => {
              try {
                const copy = await duplicate.mutateAsync({
                  id: product.id,
                  title: title.trim() || undefined,
                  include_media: media,
                });
                toast.success("Product duplicated");
                onClose();
                router.push(`/admin/products/${copy.id}`);
              } catch (err) {
                toast.error(
                  err instanceof ApiError ? err.message : "Couldn't duplicate the product.",
                );
              }
            }}
          >
            Duplicate
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Title">
          {({ id }) => (
            <Input
              id={id}
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          )}
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={media}
            onChange={(e) => setMedia(e.target.checked)}
          />
          Include images
        </label>
      </div>
    </Dialog>
  );
}

function PreviewButton({ productId, unsaved }: { productId: string; unsaved: boolean }) {
  const preview = usePreviewProduct(productId);
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => preview.mutate()}
        disabled={preview.isPending}
        title={unsaved ? "Shows the last saved version" : "Open on the storefront, even as a draft"}
      >
        <Eye aria-hidden /> Preview
      </Button>
      {preview.isError && (
        <span role="alert" className="self-center text-sm text-danger">
          Couldn’t open the preview. Try again.
        </span>
      )}
    </>
  );
}
