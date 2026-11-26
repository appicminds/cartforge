"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Copy,
  Eye,
  ImageIcon,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  PERMISSIONS,
  type BulkResult,
  type CategorySummary,
  type CollectionSummary,
  type ProductListItem,
} from "@cartforge/types";
import {
  PRODUCT_SORT_FIELDS,
  formatMoney,
  type ProductBulkInput as ProductBulk,
} from "@cartforge/validation";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Input,
  Menu,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  SortableTh,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tabs,
  Tr,
  useToast,
  type MenuItem,
} from "@cartforge/ui";
import { TagInput } from "@/components/tag-input";
import { ApiError } from "@/lib/api-client";
import { useBulkProducts, useCategories, useCollections, useDuplicateProduct } from "@/lib/catalog";
import { formatDate } from "@/lib/format";
import {
  STATUS_LABEL,
  STATUS_TONE,
  rememberListUrl,
  useDeleteProduct,
  useProductList,
  type ProductListParams,
} from "@/lib/products";
import { useDebounced } from "@/lib/use-debounced";
import { useSession } from "@/lib/session";

const PAGE_SIZES = [10, 25, 50, 100];
type StatusTab = "all" | "active" | "draft" | "archived";
const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
];

/** Interactive descendants handle their own clicks; the row shouldn't navigate. */
function isInteractive(target: EventTarget | null, row: HTMLElement): boolean {
  const el = (target as Element | null)?.closest(
    "a,button,input,select,textarea,label,[role=menu],dialog",
  );
  return Boolean(el && row.contains(el));
}
type SortField = ProductListParams["sort"];

/** List state lives in the URL so it survives navigation, reloads and sharing (PRD §8.3). */
function useListParams() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const params: ProductListParams = useMemo(() => {
    const sort = sp.get("sort");
    const size = Number(sp.get("page_size"));
    return {
      q: sp.get("q") ?? undefined,
      status: sp.get("status") ?? undefined,
      product_type: sp.get("product_type") ?? undefined,
      category_id: sp.get("category_id") ?? undefined,
      collection_id: sp.get("collection_id") ?? undefined,
      sort: (PRODUCT_SORT_FIELDS as readonly string[]).includes(sort ?? "")
        ? (sort as SortField)
        : "updated_at",
      order: sp.get("order") === "asc" ? "asc" : "desc",
      page: Math.max(1, Number(sp.get("page")) || 1),
      page_size: PAGE_SIZES.includes(size) ? size : 25,
    };
  }, [sp]);

  const update = (patch: Partial<ProductListParams>, resetPage = true) => {
    const next = { ...params, ...(resetPage && { page: 1 }), ...patch };
    const qs = new URLSearchParams();
    if (next.q) qs.set("q", next.q);
    if (next.status) qs.set("status", next.status);
    if (next.product_type) qs.set("product_type", next.product_type);
    if (next.category_id) qs.set("category_id", next.category_id);
    if (next.collection_id) qs.set("collection_id", next.collection_id);
    if (next.sort !== "updated_at") qs.set("sort", next.sort);
    if (next.order !== "desc") qs.set("order", next.order);
    if (next.page !== 1) qs.set("page", String(next.page));
    if (next.page_size !== 25) qs.set("page_size", String(next.page_size));
    const s = qs.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  useEffect(() => {
    const s = sp.toString();
    rememberListUrl(s ? `${pathname}?${s}` : pathname);
  }, [sp, pathname]);

  return { params, update };
}

function ProductsPageInner() {
  const { can } = useSession();
  const router = useRouter();
  const toast = useToast();
  const { params, update } = useListParams();
  const list = useProductList(params);
  const del = useDeleteProduct();
  const [pendingDelete, setPendingDelete] = useState<ProductListItem | null>(null);

  const [search, setSearch] = useState(params.q ?? "");
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses search (unless typing in a field already).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const debounced = useDebounced(search.trim(), 300);
  useEffect(() => {
    if ((params.q ?? "") !== debounced) update({ q: debounced || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced input
  }, [debounced]);
  // Keep the input in sync when the URL changes from elsewhere (back/forward, clear filters).
  useEffect(() => setSearch(params.q ?? ""), [params.q]);

  const hasFilters = Boolean(
    params.q || params.status || params.product_type || params.category_id || params.collection_id,
  );
  const canPublish = can(PERMISSIONS.PRODUCTS_PUBLISH);
  const categories = useCategories();
  const collections = useCollections();
  const bulk = useBulkProducts();
  const duplicate = useDuplicateProduct();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPick, setBulkPick] = useState<
    | null
    | "add_tags"
    | "remove_tags"
    | "add_collections"
    | "remove_collections"
    | "add_categories"
    | "remove_categories"
  >(null);
  const [bulkFailures, setBulkFailures] = useState<BulkResult | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  // Selection is per page/filters: clear it whenever the visible list changes.
  const listKey = JSON.stringify(params);
  useEffect(() => setSelected(new Set()), [listKey]);

  const runSingle = async (id: string, action: "publish" | "archive") => {
    try {
      const res = await bulk.mutateAsync({ action, product_ids: [id] });
      if (res.failed.length) setBulkFailures(res);
      else toast.success(action === "publish" ? "Product published" : "Product archived");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update the product.");
    }
  };

  const runBulk = async (body: Omit<ProductBulk, "product_ids">) => {
    try {
      const res = await bulk.mutateAsync({ ...body, product_ids: [...selected] } as ProductBulk);
      if (res.failed.length) setBulkFailures(res);
      if (res.succeeded.length)
        toast.success(
          `${BULK_DONE[res.action] ?? "Updated"} ${res.succeeded.length} product${res.succeeded.length === 1 ? "" : "s"}`,
        );
      setSelected(new Set(res.failed.map((f) => f.id)));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Bulk action failed.");
    }
  };
  const canWrite = can(PERMISSIONS.PRODUCTS_WRITE);
  const canDelete = can(PERMISSIONS.PRODUCTS_DELETE);

  const sortBy = (field: SortField) =>
    update({
      sort: field,
      order:
        params.sort === field
          ? params.order === "asc"
            ? "desc"
            : "asc"
          : field === "title"
            ? "asc"
            : "desc",
    });

  const clearFilters = () => {
    setSearch("");
    update({
      q: undefined,
      status: undefined,
      product_type: undefined,
      category_id: undefined,
      collection_id: undefined,
    });
  };

  const rowMenu = (p: ProductListItem): MenuItem[] => {
    const items: MenuItem[] = [
      {
        label: canWrite ? "Edit" : "View",
        icon: <Pencil />,
        onSelect: () => router.push(`/admin/products/${p.id}`),
      },
    ];
    if (canWrite)
      items.push({
        label: "Duplicate",
        icon: <Copy />,
        onSelect: async () => {
          try {
            const copy = await duplicate.mutateAsync({ id: p.id, include_media: true });
            toast.success("Product duplicated");
            router.push(`/admin/products/${copy.id}`);
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : "Couldn't duplicate.");
          }
        },
      });
    if (canPublish && p.status !== "active")
      items.push({
        label: "Publish",
        icon: <Eye />,
        onSelect: () => void runSingle(p.id, "publish"),
      });
    if (canPublish && p.status !== "archived")
      items.push({
        label: "Archive",
        icon: <Archive />,
        onSelect: () => void runSingle(p.id, "archive"),
      });
    if (canDelete)
      items.push({
        label: "Delete",
        icon: <Trash2 />,
        destructive: true,
        onSelect: () => setPendingDelete(p),
      });
    return items;
  };

  const data = list.data;
  const firstUse = data && data.meta.total === 0 && !hasFilters;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Products"
        description="Manage your catalog, pricing, inventory, and product visibility."
        primaryAction={
          canWrite && (
            <Button asChild>
              <Link href="/admin/products/new">
                <Plus aria-hidden />
                Add product
              </Link>
            </Button>
          )
        }
      />

      {!canWrite && (
        <Alert tone="info" title="View only">
          Your role can view products but not create or change them.
        </Alert>
      )}

      {firstUse ? (
        <Card>
          <EmptyState
            icon={<Package />}
            title="Add your first product"
            description="Products you add here appear in your catalog. Start with a draft — you can publish it when it's ready."
            action={
              canWrite && (
                <Button asChild>
                  <Link href="/admin/products/new">
                    <Plus aria-hidden />
                    Add product
                  </Link>
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <Card>
          <div className="flex flex-col gap-2 border-b border-border px-2 pb-2 pt-2 sm:flex-row sm:items-center">
            <Tabs
              label="Product status views"
              controls="products-panel"
              items={STATUS_TABS}
              value={(params.status as StatusTab | undefined) ?? "all"}
              onChange={(v) => update({ status: v === "all" ? undefined : v })}
            />
            <div className="flex flex-1 items-center gap-2 sm:justify-end" role="search">
              <div className="relative min-w-0 flex-1 sm:max-w-80">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
                />
                <Input
                  ref={searchRef}
                  type="search"
                  aria-label="Search products"
                  aria-keyshortcuts="/"
                  placeholder="Search by name, SKU, or barcode"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select
                aria-label="Filter by category"
                value={params.category_id ?? ""}
                onChange={(e) => update({ category_id: e.target.value || undefined })}
                className="hidden w-40 shrink-0 lg:block"
              >
                <option value="">All categories</option>
                {(categories.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {"\u00a0\u00a0".repeat(c.depth)}
                    {c.name}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Filter by collection"
                value={params.collection_id ?? ""}
                onChange={(e) => update({ collection_id: e.target.value || undefined })}
                className="hidden w-40 shrink-0 lg:block"
              >
                <option value="">All collections</option>
                {(collections.data?.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Filter by product type"
                value={params.product_type ?? ""}
                onChange={(e) => update({ product_type: e.target.value || undefined })}
                className="w-32 shrink-0"
              >
                <option value="">All types</option>
                <option value="simple">Simple</option>
                <option value="variable">Variable</option>
              </Select>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="shrink-0">
                  <X aria-hidden />
                  Clear
                </Button>
              )}
            </div>
          </div>
          <div id="products-panel" role="tabpanel" aria-label="Products">
            {list.isError ? (
              <div className="p-4">
                <Alert
                  tone="danger"
                  title="Couldn't load products"
                  action={
                    <Button size="sm" variant="secondary" onClick={() => list.refetch()}>
                      Retry
                    </Button>
                  }
                >
                  {list.error.message}
                </Alert>
              </div>
            ) : data && data.data.length === 0 ? (
              <EmptyState
                icon={<Search />}
                title="No products match your search"
                description="Try a different search term or remove some filters."
                action={
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <>
                <Table
                  aria-busy={list.isFetching || undefined}
                  className={list.isPlaceholderData ? "opacity-60" : undefined}
                >
                  <caption className="sr-only">Products</caption>
                  <THead>
                    <tr>
                      {canWrite && (
                        <Th className="w-10">
                          <input
                            type="checkbox"
                            aria-label="Select all products on this page"
                            className="size-4 accent-primary"
                            checked={
                              Boolean(data?.data.length) && selected.size === data?.data.length
                            }
                            ref={(el) => {
                              if (el)
                                el.indeterminate =
                                  selected.size > 0 && selected.size < (data?.data.length ?? 0);
                            }}
                            onChange={(e) =>
                              setSelected(
                                e.target.checked ? new Set(data?.data.map((p) => p.id)) : new Set(),
                              )
                            }
                          />
                        </Th>
                      )}
                      <Th className="w-14">
                        <span className="sr-only">Image</span>
                      </Th>
                      <SortableTh
                        active={params.sort === "title"}
                        direction={params.order}
                        onSort={() => sortBy("title")}
                      >
                        Product
                      </SortableTh>
                      <SortableTh
                        active={params.sort === "status"}
                        direction={params.order}
                        onSort={() => sortBy("status")}
                      >
                        Status
                      </SortableTh>
                      <Th>SKU / Variants</Th>
                      <Th>Inventory</Th>
                      <Th className="text-right">Price</Th>
                      <SortableTh
                        active={params.sort === "updated_at"}
                        direction={params.order}
                        onSort={() => sortBy("updated_at")}
                      >
                        Updated
                      </SortableTh>
                      <Th className="w-12">
                        <span className="sr-only">Actions</span>
                      </Th>
                    </tr>
                  </THead>
                  <TBody>
                    {!data
                      ? Array.from({ length: 6 }, (_, i) => (
                          <tr key={i}>
                            {canWrite && <Td />}
                            <Td>
                              <Skeleton className="size-9 rounded-lg" />
                            </Td>
                            <Td>
                              <Skeleton className="h-4 w-48" />
                            </Td>
                            <Td>
                              <Skeleton className="h-5 w-16 rounded-full" />
                            </Td>
                            <Td>
                              <Skeleton className="h-4 w-24" />
                            </Td>
                            <Td>
                              <Skeleton className="h-4 w-14" />
                            </Td>
                            <Td>
                              <Skeleton className="ml-auto h-4 w-14" />
                            </Td>
                            <Td>
                              <Skeleton className="h-4 w-24" />
                            </Td>
                            <Td />
                          </tr>
                        ))
                      : data.data.map((p) => (
                          <Tr
                            key={p.id}
                            className="cursor-pointer"
                            onClick={(e) => {
                              if (isInteractive(e.target, e.currentTarget)) return;
                              router.push(`/admin/products/${p.id}`);
                            }}
                          >
                            {canWrite && (
                              <Td>
                                <input
                                  type="checkbox"
                                  aria-label={`Select ${p.title}`}
                                  className="size-4 accent-primary"
                                  checked={selected.has(p.id)}
                                  onChange={(e) =>
                                    setSelected((s) => {
                                      const next = new Set(s);
                                      if (e.target.checked) next.add(p.id);
                                      else next.delete(p.id);
                                      return next;
                                    })
                                  }
                                />
                              </Td>
                            )}
                            <Td>
                              {p.thumbnail_url ? (
                                <img
                                  src={p.thumbnail_url}
                                  alt=""
                                  loading="lazy"
                                  className="size-9 rounded-lg border border-border bg-surface-sunken object-cover"
                                />
                              ) : (
                                <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-surface-sunken text-fg-subtle">
                                  <ImageIcon aria-hidden className="size-4" />
                                </div>
                              )}
                            </Td>
                            <Td className="max-w-80">
                              <Link
                                href={`/admin/products/${p.id}`}
                                className="block truncate font-medium text-fg hover:underline"
                              >
                                {p.title}
                              </Link>
                              {p.vendor && (
                                <span className="block truncate text-xs text-fg-subtle">
                                  {p.vendor}
                                </span>
                              )}
                            </Td>
                            <Td>
                              <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                            </Td>
                            <Td className="text-fg-muted">
                              {p.product_type === "variable"
                                ? `${p.variant_count} variant${p.variant_count === 1 ? "" : "s"}`
                                : (p.sku ?? "—")}
                            </Td>
                            <Td className="whitespace-nowrap">
                              {p.inventory_available === null ? (
                                <span className="text-fg-subtle">Not tracked</span>
                              ) : (
                                <span
                                  className={
                                    p.inventory_available <= 0 ? "text-danger" : "text-fg-muted"
                                  }
                                >
                                  {p.inventory_available} in stock
                                  {p.product_type === "variable" &&
                                    ` · ${p.variant_count} variants`}
                                </span>
                              )}
                            </Td>
                            <Td className="whitespace-nowrap text-right tabular-nums">
                              {p.price_minor !== null ? (
                                p.price_max_minor !== null &&
                                p.price_max_minor !== p.price_minor ? (
                                  `${formatMoney(p.price_minor, p.currency)} – ${formatMoney(p.price_max_minor, p.currency)}`
                                ) : (
                                  formatMoney(p.price_minor, p.currency)
                                )
                              ) : (
                                <span className="text-fg-subtle">
                                  {p.product_type === "variable" ? "Varies" : "—"}
                                </span>
                              )}
                            </Td>
                            <Td className="whitespace-nowrap text-fg-muted">
                              {formatDate(p.updated_at)}
                            </Td>
                            <Td>
                              <Menu
                                label={`Actions for ${p.title}`}
                                trigger={<MoreHorizontal />}
                                items={rowMenu(p)}
                              />
                            </Td>
                          </Tr>
                        ))}
                  </TBody>
                </Table>
                {data && (
                  <Pagination
                    className="border-t border-border p-4"
                    page={data.meta.page}
                    pageSize={data.meta.page_size}
                    total={data.meta.total}
                    totalPages={data.meta.total_pages}
                    pageSizes={PAGE_SIZES}
                    onPageChange={(page) => update({ page }, false)}
                    onPageSizeChange={(page_size) => update({ page_size })}
                  />
                )}
              </>
            )}
          </div>
        </Card>
      )}

      {selected.size > 0 && (
        <div
          role="region"
          aria-label="Bulk actions"
          className="fixed inset-x-0 bottom-4 z-(--cf-z-sticky) mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-xl bg-savebar-bg px-3 py-2 text-sm text-savebar-fg shadow-lg"
        >
          <span className="px-1 font-medium">{selected.size} selected</span>
          {canPublish && (
            <>
              <Button
                size="sm"
                variant="secondary"
                loading={bulk.isPending}
                onClick={() => void runBulk({ action: "publish" })}
              >
                Publish
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={bulk.isPending}
                onClick={() => void runBulk({ action: "draft" })}
              >
                Set as draft
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={bulk.isPending}
                onClick={() => void runBulk({ action: "archive" })}
              >
                Archive
              </Button>
            </>
          )}
          <Menu
            label="More bulk actions"
            triggerClassName="text-savebar-fg hover:bg-white/10 hover:text-white"
            trigger={<MoreHorizontal />}
            items={[
              { label: "Add tags", onSelect: () => setBulkPick("add_tags") },
              { label: "Remove tags", onSelect: () => setBulkPick("remove_tags") },
              { label: "Add to collections", onSelect: () => setBulkPick("add_collections") },
              {
                label: "Remove from collections",
                onSelect: () => setBulkPick("remove_collections"),
              },
              { label: "Add to categories", onSelect: () => setBulkPick("add_categories") },
              { label: "Remove from categories", onSelect: () => setBulkPick("remove_categories") },
              ...(canDelete
                ? [
                    {
                      label: "Delete products",
                      icon: <Trash2 />,
                      destructive: true,
                      onSelect: () => setConfirmBulkDelete(true),
                    },
                  ]
                : []),
            ]}
          />
          <Button
            size="sm"
            variant="ghost"
            className="text-savebar-fg hover:bg-white/10 hover:text-white"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      <BulkPickDialog
        kind={bulkPick}
        categories={categories.data ?? []}
        collections={collections.data?.data ?? []}
        pending={bulk.isPending}
        onClose={() => setBulkPick(null)}
        onApply={async (payload) => {
          await runBulk(payload);
          setBulkPick(null);
        }}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        title={`Delete ${selected.size} products?`}
        description="They'll be removed from your catalog. Past orders keep their copies."
        confirmLabel="Delete products"
        destructive
        pending={bulk.isPending}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={async () => {
          await runBulk({ action: "delete" });
          setConfirmBulkDelete(false);
        }}
      />

      <Dialog
        open={Boolean(bulkFailures)}
        onClose={() => setBulkFailures(null)}
        title={`${bulkFailures?.failed.length ?? 0} product${bulkFailures?.failed.length === 1 ? "" : "s"} couldn't be updated`}
        description="The others were updated. Fix these and try again."
        footer={<Button onClick={() => setBulkFailures(null)}>OK</Button>}
      >
        <ul
          className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto text-sm"
          aria-label="Failed products"
        >
          {bulkFailures?.failed.map((f) => (
            <li key={f.id} className="rounded-lg border border-border p-2">
              <Link href={`/admin/products/${f.id}`} className="font-medium hover:underline">
                {f.title || f.id}
              </Link>
              <ul className="mt-1 list-disc pl-5 text-fg-muted">
                {f.errors.map((e, i) => (
                  <li key={i}>{e.message}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete product?"
        description={
          pendingDelete && (
            <>
              <strong className="text-fg">{pendingDelete.title}</strong> will be removed from your
              catalog. Past orders keep their copy of the product details.
            </>
          )
        }
        confirmLabel="Delete product"
        destructive
        pending={del.isPending}
        onClose={() => setPendingDelete(null)}
        onConfirm={() =>
          pendingDelete &&
          del.mutate(pendingDelete.id, {
            onSuccess: () => {
              toast.success("Product deleted");
              setPendingDelete(null);
            },
            onError: (err) => toast.error(err.message),
          })
        }
      />
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense>
      <ProductsPageInner />
    </Suspense>
  );
}

const BULK_DONE: Record<string, string> = {
  publish: "Published",
  draft: "Set as draft:",
  archive: "Archived",
  delete: "Deleted",
};

type PickKind =
  | "add_tags"
  | "remove_tags"
  | "add_collections"
  | "remove_collections"
  | "add_categories"
  | "remove_categories";

function BulkPickDialog({
  kind,
  categories,
  collections,
  pending,
  onClose,
  onApply,
}: {
  kind: PickKind | null;
  categories: CategorySummary[];
  collections: CollectionSummary[];
  pending: boolean;
  onClose: () => void;
  onApply: (payload: Omit<ProductBulk, "product_ids">) => Promise<void>;
}) {
  const [tags, setTags] = useState<string[]>([]);
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    setTags([]);
    setIds(new Set());
  }, [kind]);
  if (!kind) return <Dialog open={false} onClose={onClose} title="" />;
  const isTags = kind.endsWith("tags");
  const options = kind.endsWith("collections")
    ? collections.map((c) => ({ id: c.id, label: c.title, depth: 0 }))
    : categories.map((c) => ({ id: c.id, label: c.name, depth: c.depth }));
  const title = {
    add_tags: "Add tags",
    remove_tags: "Remove tags",
    add_collections: "Add to collections",
    remove_collections: "Remove from collections",
    add_categories: "Add to categories",
    remove_categories: "Remove from categories",
  }[kind];
  return (
    <Dialog
      open
      onClose={() => !pending && onClose()}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            loading={pending}
            disabled={isTags ? !tags.length : !ids.size}
            onClick={() =>
              void onApply(
                isTags
                  ? { action: kind, tags }
                  : kind.endsWith("collections")
                    ? { action: kind, collection_ids: [...ids] }
                    : { action: kind, category_ids: [...ids] },
              )
            }
          >
            Apply
          </Button>
        </>
      }
    >
      {isTags ? (
        <TagInput label="Tags" values={tags} onChange={setTags} />
      ) : options.length === 0 ? (
        <p className="text-sm text-fg-muted">Nothing to choose from yet.</p>
      ) : (
        <ul className="max-h-[45vh] overflow-y-auto" aria-label={title}>
          {options.map((o) => (
            <li key={o.id}>
              <label
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-sunken"
                style={{ paddingLeft: `${0.5 + o.depth * 1.25}rem` }}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={ids.has(o.id)}
                  onChange={(e) =>
                    setIds((s) => {
                      const next = new Set(s);
                      if (e.target.checked) next.add(o.id);
                      else next.delete(o.id);
                      return next;
                    })
                  }
                />
                {o.label}
              </label>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
