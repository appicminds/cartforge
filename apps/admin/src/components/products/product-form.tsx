"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { CATALOG_ERROR_CODES, PERMISSIONS, type ProductDetail } from "@cartforge/types";
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
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-guard";

// Editor bundle loads only on product screens (FE-009).
const RichTextEditor = dynamic(() => import("./rich-text-editor"), {
  ssr: false,
  loading: () => <Skeleton className="h-52 w-full" />,
});

const formSchema = z.object({
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
});
export type ProductFormValues = z.input<typeof formSchema>;
const FIELDS = ["title", "description_html", "product_type", "vendor", "status", "handle"] as const;

export function toFormValues(p?: ProductDetail): ProductFormValues {
  return {
    title: p?.title ?? "",
    description_html: p?.description_html ?? "",
    product_type: p?.product_type ?? "simple",
    vendor: p?.vendor ?? "",
    status: p?.status ?? "draft",
    handle: p?.handle ?? "",
  };
}

type SubmitResult = { ok: true; product: ProductDetail } | { ok: false; error: unknown };

export interface ProductFormProps {
  product?: ProductDetail;
  onCreate?: (body: ProductCreateInput) => Promise<SubmitResult>;
  onUpdate?: (body: ProductUpdateInput) => Promise<SubmitResult>;
  onDelete?: () => void;
}

export function ProductForm({ product, onCreate, onUpdate, onDelete }: ProductFormProps) {
  const isNew = !product;
  const { can } = useSession();
  const canWrite = can(PERMISSIONS.PRODUCTS_WRITE);
  const canPublish = can(PERMISSIONS.PRODUCTS_PUBLISH);
  const canDelete = can(PERMISSIONS.PRODUCTS_DELETE);
  const descLabelId = useId();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmHandle, setConfirmHandle] = useState<ProductUpdateInput | null>(null);

  const form = useForm<ProductFormValues, unknown, z.output<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(product),
    mode: "onTouched",
  });
  const { errors, isDirty, isSubmitting, dirtyFields } = form.formState;
  const title = form.watch("title");

  useUnsavedChangesGuard(isDirty && !isSubmitting);

  const handleResult = (res: SubmitResult) => {
    if (res.ok) {
      form.reset(toFormValues(res.product));
      return;
    }
    if (
      res.error instanceof ApiError &&
      res.error.code === CATALOG_ERROR_CODES.HANDLE_CHANGE_REQUIRES_CONFIRMATION
    ) {
      return "confirm";
    }
    setFormError(applyServerErrors(res.error, form.setError, FIELDS));
  };

  const submit = form.handleSubmit(async (v) => {
    setFormError(null);
    if (isNew) {
      if (!onCreate) return;
      const res = await onCreate({
        title: v.title,
        description_html: v.description_html,
        product_type: v.product_type,
        vendor: v.vendor || null,
        status: v.status,
        handle: v.handle || undefined,
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
              <h1 className="truncate text-2xl font-semibold tracking-tight">{heading}</h1>
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
        <div className="sticky bottom-0 z-(--cf-z-sticky) -mx-4 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex items-center justify-end gap-3">
            {isDirty && <p className="mr-auto text-sm text-fg-muted">Unsaved changes</p>}
            {isNew ? (
              <Button asChild variant="secondary">
                <Link href={lastListUrl()}>Cancel</Link>
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => form.reset()} disabled={isSubmitting}>
                Discard
              </Button>
            )}
            <Button type="submit" loading={isSubmitting}>
              {isNew ? "Save product" : "Save"}
            </Button>
          </div>
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
