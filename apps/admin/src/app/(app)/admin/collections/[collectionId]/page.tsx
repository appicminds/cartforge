"use client";

import { ThemeTemplateCard } from "@/components/online-store/template-card";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ImageIcon, Layers, Plus, Search, X } from "lucide-react";
import { CATALOG_ERROR_CODES, PERMISSIONS, type CollectionDetail } from "@cartforge/types";
import { COLLECTION_SORTS, formatMoney } from "@cartforge/validation";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from "@cartforge/ui";
import { CoverImageField, toCoverImage } from "@/components/cover-image-field";
import { ApiError } from "@/lib/api-client";
import { useBreadcrumbTitle } from "@/lib/breadcrumbs";
import {
  COLLECTION_SORT_LABEL,
  useCollection,
  useDeleteCollection,
  useSaveCollection,
  useSetCollectionProducts,
} from "@/lib/catalog";
import { useProductList } from "@/lib/products";
import { useSession } from "@/lib/session";
import { useStoreSettings } from "@/lib/store";
import { useDebounced } from "@/lib/use-debounced";

export default function CollectionPage() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const collection = useCollection(collectionId);
  useBreadcrumbTitle(collection.data?.title);

  if (collection.isPending) return <Skeleton className="h-96" />;
  if (collection.isError) {
    return collection.error instanceof ApiError && collection.error.status === 404 ? (
      <Card>
        <EmptyState
          icon={<Layers />}
          title="Collection not found"
          action={
            <Button asChild variant="secondary">
              <Link href="/admin/collections">Back to collections</Link>
            </Button>
          }
        />
      </Card>
    ) : (
      <Alert tone="danger" title="Couldn't load this collection">
        {collection.error.message}
      </Alert>
    );
  }
  return <CollectionEditor key={collection.data.id} c={collection.data} />;
}

function CollectionEditor({ c }: { c: CollectionDetail }) {
  const { can, store } = useSession();
  const canWrite = can(PERMISSIONS.COLLECTIONS_WRITE);
  const toast = useToast();
  const router = useRouter();
  const save = useSaveCollection();
  const setProducts = useSetCollectionProducts(c.id);
  const del = useDeleteCollection();
  const currency = useStoreSettings().data?.currency ?? "USD";
  const initial = () => ({
    title: c.title,
    handle: c.handle,
    description: c.description_html.replace(/<[^>]+>/g, "").trim(),
    status: c.status,
    sort_order: c.sort_order,
    seo_title: c.seo_title ?? "",
    seo_description: c.seo_description ?? "",
    image: toCoverImage(c.image),
  });
  const [f, setF] = useState(initial);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmHandle, setConfirmHandle] = useState(false);
  useEffect(() => setF(initial()), [c.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(f) !== JSON.stringify(initial());
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (confirm = false) => {
    if (!f.title.trim()) return setError({ message: "Title is required", field: "title" });
    setError(null);
    try {
      await save.mutateAsync({
        id: c.id,
        body: {
          title: f.title.trim(),
          ...(f.handle !== c.handle && {
            handle: f.handle.trim().toLowerCase(),
            confirm_handle_change: confirm,
          }),
          description_html: f.description.trim()
            ? `<p>${f.description.trim().replace(/[<>&]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[m]!)}</p>`
            : "",
          status: f.status,
          sort_order: f.sort_order,
          seo_title: f.seo_title.trim() || null,
          seo_description: f.seo_description.trim() || null,
          image_asset_id: f.image?.id ?? null,
        },
      });
      toast.success("Collection saved");
      setConfirmHandle(false);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.code === CATALOG_ERROR_CODES.HANDLE_CHANGE_REQUIRES_CONFIRMATION
      )
        return setConfirmHandle(true);
      const e = err instanceof ApiError ? err : null;
      setError({
        message: e?.fields[0]?.message ?? e?.message ?? "Couldn't save.",
        field: e?.fields[0]?.path,
      });
    }
  };

  const ids = c.products.map((p) => p.id);
  const reorder = async (next: string[], message: string) => {
    try {
      await setProducts.mutateAsync(next);
      toast.success(message);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update products.");
    }
  };
  const move = (i: number, dir: -1 | 1) => {
    const next = [...ids];
    [next[i], next[i + dir]] = [next[i + dir]!, next[i]!];
    void reorder(next, "Order saved");
  };

  return (
    <div className="flex flex-col gap-6 pb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button asChild variant="secondary" size="icon">
            <Link href="/admin/collections" aria-label="Back to collections">
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{c.title}</h1>
            <p className="text-sm text-fg-muted">
              {c.product_count} product{c.product_count === 1 ? "" : "s"} · /collections/{c.handle}
            </p>
          </div>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            {dirty && (
              <Button variant="secondary" onClick={() => setF(initial())}>
                Discard
              </Button>
            )}
            <Button onClick={() => void submit()} loading={save.isPending} disabled={!dirty}>
              Save
            </Button>
            <Button
              variant="secondary"
              className="text-danger"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          </div>
        )}
      </div>
      {error && <Alert tone="danger" title={error.message} />}

      <fieldset disabled={!canWrite} className="grid min-w-0 gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader title="Details" />
            <CardBody className="flex flex-col gap-4">
              <Field
                label="Title"
                required
                error={error?.field === "title" ? error.message : undefined}
              >
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    invalid={invalid}
                    value={f.title}
                    maxLength={200}
                    onChange={set("title")}
                  />
                )}
              </Field>
              <Field label="Description">
                {({ id }) => (
                  <Textarea id={id} value={f.description} onChange={set("description")} />
                )}
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Products"
              description={
                c.sort_order === "manual"
                  ? "Shown in this order on your storefront."
                  : `Sorted ${COLLECTION_SORT_LABEL[c.sort_order]?.toLowerCase()} on your storefront.`
              }
              actions={
                canWrite && (
                  <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
                    <Plus aria-hidden /> Add products
                  </Button>
                )
              }
            />
            <CardBody className="p-0">
              {c.products.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-fg-muted">No products yet.</p>
              ) : (
                <ol aria-label="Collection products" className="divide-y divide-border">
                  {c.products.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-3 px-4 py-2">
                      <span className="w-6 text-right text-xs tabular-nums text-fg-subtle">
                        {i + 1}
                      </span>
                      {p.thumbnail_url ? (
                        <img
                          src={p.thumbnail_url}
                          alt=""
                          className="size-9 rounded-lg border border-border object-cover"
                        />
                      ) : (
                        <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-surface-sunken text-fg-subtle">
                          <ImageIcon aria-hidden className="size-4" />
                        </div>
                      )}
                      <Link
                        href={`/admin/products/${p.id}`}
                        className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                      >
                        {p.title}
                      </Link>
                      {p.status !== "active" && (
                        <Badge tone={p.status === "archived" ? "warning" : "neutral"}>
                          {p.status === "draft" ? "Draft" : "Archived"}
                        </Badge>
                      )}
                      <span className="w-20 text-right text-sm tabular-nums text-fg-muted">
                        {p.price_minor === null ? "—" : formatMoney(p.price_minor, currency)}
                      </span>
                      {canWrite && (
                        <div className="flex">
                          {c.sort_order === "manual" && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Move ${p.title} up`}
                                disabled={i === 0 || setProducts.isPending}
                                onClick={() => move(i, -1)}
                              >
                                <ArrowUp aria-hidden />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Move ${p.title} down`}
                                disabled={i === c.products.length - 1 || setProducts.isPending}
                                onClick={() => move(i, 1)}
                              >
                                <ArrowDown aria-hidden />
                              </Button>
                            </>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Remove ${p.title}`}
                            disabled={setProducts.isPending}
                            onClick={() =>
                              void reorder(
                                ids.filter((x) => x !== p.id),
                                "Removed from collection",
                              )
                            }
                          >
                            <X aria-hidden />
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Search engine listing" />
            <CardBody className="flex flex-col gap-4">
              <Field
                label="URL handle"
                error={error?.field === "handle" ? error.message : undefined}
                hint={
                  c.status === "active"
                    ? "Changing a live collection's handle keeps old links working with a redirect."
                    : undefined
                }
              >
                {({ id, describedBy, invalid }) => (
                  <div className="flex items-stretch">
                    <span className="flex items-center rounded-l-lg border border-r-0 border-border-strong bg-surface-sunken px-3 text-sm text-fg-subtle">
                      /collections/
                    </span>
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      invalid={invalid}
                      className="rounded-l-none"
                      value={f.handle}
                      onChange={set("handle")}
                    />
                  </div>
                )}
              </Field>
              <Field label="Page title">
                {({ id }) => (
                  <Input
                    id={id}
                    value={f.seo_title}
                    placeholder={f.title}
                    onChange={set("seo_title")}
                  />
                )}
              </Field>
              <Field label="Meta description">
                {({ id }) => (
                  <Textarea
                    id={id}
                    value={f.seo_description}
                    onChange={set("seo_description")}
                    className="min-h-14"
                  />
                )}
              </Field>
            </CardBody>
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader title="Image" />
            <CardBody>
              <CoverImageField
                value={f.image}
                onChange={(image) => setF((s) => ({ ...s, image }))}
                auto={c.auto_image}
                storeId={store?.store_id}
                disabled={!canWrite}
                emptyHint="No image yet"
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Visibility" />
            <CardBody className="flex flex-col gap-4">
              <Field label="Status" hint="Only active collections appear on the storefront.">
                {({ id, describedBy }) => (
                  <Select
                    id={id}
                    aria-describedby={describedBy}
                    value={f.status}
                    onChange={set("status")}
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </Select>
                )}
              </Field>
              <Field label="Sort products">
                {({ id }) => (
                  <Select id={id} value={f.sort_order} onChange={set("sort_order")}>
                    {COLLECTION_SORTS.map((s) => (
                      <option key={s} value={s}>
                        {COLLECTION_SORT_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </CardBody>
          </Card>
          <ThemeTemplateCard kind="collection" id={c.id} />
        </div>
      </fieldset>

      <AddProductsDialog
        open={adding}
        existing={ids}
        onClose={() => setAdding(false)}
        onAdd={async (add) => {
          await reorder(
            [...ids, ...add],
            `Added ${add.length} product${add.length === 1 ? "" : "s"}`,
          );
          setAdding(false);
        }}
      />
      <ConfirmDialog
        open={confirmHandle}
        title="Change the collection's address?"
        description="Links to the old address will redirect to the new one."
        confirmLabel="Change handle"
        pending={save.isPending}
        onClose={() => setConfirmHandle(false)}
        onConfirm={() => void submit(true)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${c.title}?`}
        description="Products in it are not deleted."
        confirmLabel="Delete collection"
        destructive
        pending={del.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await del.mutateAsync(c.id);
          toast.success("Collection deleted");
          router.replace("/admin/collections");
        }}
      />
    </div>
  );
}

function AddProductsDialog({
  open,
  existing,
  onClose,
  onAdd,
}: {
  open: boolean;
  existing: string[];
  onClose: () => void;
  onAdd: (ids: string[]) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const debounced = useDebounced(q.trim(), 250);
  const list = useProductList({
    q: debounced || undefined,
    sort: "title",
    order: "asc",
    page: 1,
    page_size: 50,
  });
  useEffect(() => {
    if (open) {
      setQ("");
      setPicked([]);
    }
  }, [open]);
  const rows = (list.data?.data ?? []).filter((p) => !existing.includes(p.id));
  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title="Add products"
      className="w-[min(36rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={!picked.length}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onAdd(picked);
              } finally {
                setBusy(false);
              }
            }}
          >
            Add {picked.length || ""}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
          />
          <Input
            aria-label="Search products"
            className="pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>
        <ul className="max-h-[45vh] overflow-y-auto" aria-label="Products to add">
          {rows.map((p) => (
            <li key={p.id}>
              <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-sunken">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={picked.includes(p.id)}
                  onChange={(e) =>
                    setPicked((s) =>
                      e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id),
                    )
                  }
                />
                <span className="min-w-0 flex-1 truncate">{p.title}</span>
                <span className="text-xs text-fg-subtle">{p.status}</span>
              </label>
            </li>
          ))}
          {!list.isPending && rows.length === 0 && (
            <li className="py-4 text-center text-sm text-fg-muted">No products found.</li>
          )}
        </ul>
      </div>
    </Dialog>
  );
}
