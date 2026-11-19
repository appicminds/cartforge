"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { CATALOG_ERROR_CODES, PERMISSIONS, type ProductDetail } from "@cartforge/types";
import { MediaGallery, type GalleryValue } from "./media-gallery";
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
  Select,
  Skeleton,
} from "@cartforge/ui";
import {
  DESCRIPTION_MAX,
  HANDLE_MAX,
  HANDLE_PATTERN,
  PRODUCT_STATUSES,
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
import { STATUS_LABEL, STATUS_TONE, lastListUrl } from "@/lib/products";
import { useSession } from "@/lib/session";
import { useStoreSettings } from "@/lib/store";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-guard";

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
] as const;

/** Server field paths → form field names. */
const SERVER_FIELD: Record<string, (typeof FIELDS)[number]> = {
  price_minor: "price",
  compare_at_minor: "compare_at",
  cost_minor: "cost",
  media: "gallery",
  primary_media_id: "gallery",
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
          price_minor: toMinor(v.price),
          compare_at_minor: toMinor(v.compare_at),
          cost_minor: toMinor(v.cost),
        }),
        ...(media.length && { media, primary_media_id }),
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
    if (dirtyFields.product_type) body.product_type = v.product_type;
    if (dirtyFields.vendor) body.vendor = v.vendor || null;
    if (dirtyFields.status) body.status = v.status;
    if (dirtyFields.taxable) body.taxable = v.taxable;
    if (simple) {
      if (dirtyFields.price) body.price_minor = toMinor(v.price);
      if (dirtyFields.compare_at) body.compare_at_minor = toMinor(v.compare_at);
      if (dirtyFields.cost) body.cost_minor = toMinor(v.cost);
    }
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
        {product && canDelete && onDelete && (
          <Button variant="secondary" onClick={onDelete} className="text-danger">
            Delete
          </Button>
        )}
      </div>

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
              title="Images"
              description="JPEG, PNG or WebP. The primary image is shown in listings."
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
                <p className="text-sm text-fg-muted">
                  Variable products are priced per variant. Variant editing arrives with inventory
                  (next sprint).
                </p>
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

          <Card>
            <CardHeader
              title="Search engine listing"
              description="How this product's address appears on your storefront."
            />
            <CardBody>
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
              <Field
                label="Product type"
                error={errors.product_type?.message}
                hint="Variable products have options like size or color (variant editing arrives with inventory)."
              >
                {({ id, describedBy, invalid }) => (
                  <Select
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    {...form.register("product_type")}
                  >
                    <option value="simple">Simple</option>
                    <option value="variable">Variable</option>
                  </Select>
                )}
              </Field>
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
