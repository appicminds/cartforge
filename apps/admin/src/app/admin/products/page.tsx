"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, MoreHorizontal, Package, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { PERMISSIONS, type ProductListItem } from "@cartforge/types";
import { PRODUCT_SORT_FIELDS, formatMoney } from "@cartforge/validation";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
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

  const hasFilters = Boolean(params.q || params.status || params.product_type);
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
    update({ q: undefined, status: undefined, product_type: undefined });
  };

  const rowMenu = (p: ProductListItem): MenuItem[] => {
    const items: MenuItem[] = [
      {
        label: canWrite ? "Edit" : "View",
        icon: <Pencil />,
        onSelect: () => router.push(`/admin/products/${p.id}`),
      },
    ];
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
                      <Th>Type</Th>
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
                            <Td className="capitalize text-fg-muted">{p.product_type}</Td>
                            <Td className="whitespace-nowrap text-right tabular-nums">
                              {p.price_minor !== null ? (
                                formatMoney(p.price_minor, p.currency)
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
