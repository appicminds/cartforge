"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Boxes, History, ImageIcon, PackagePlus, Search, X } from "lucide-react";
import { PERMISSIONS, type InventoryRow } from "@cartforge/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Pagination,
  Skeleton,
  TBody,
  THead,
  Table,
  Tabs,
  Td,
  Th,
  Tr,
} from "@cartforge/ui";
import { AdjustStockDialog, type AdjustTarget } from "@/components/inventory/adjust-stock-dialog";
import { MovementsDialog } from "@/components/inventory/movements-dialog";
import {
  STOCK_LABEL,
  STOCK_TONE,
  useInventoryList,
  type InventoryListParams,
} from "@/lib/inventory";
import { useSession } from "@/lib/session";
import { useDebounced } from "@/lib/use-debounced";

type StockTab = InventoryListParams["stock"];
const PAGE_SIZES = [25, 50, 100];

const label = (r: InventoryRow) =>
  r.product_type === "variable" ? `${r.product_title} — ${r.variant_title}` : r.product_title;

function InventoryInner() {
  const { can } = useSession();
  const canAdjust = can(PERMISSIONS.INVENTORY_ADJUST);
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const params: InventoryListParams = useMemo(() => {
    const stock = sp.get("stock");
    const size = Number(sp.get("page_size"));
    return {
      q: sp.get("q") ?? undefined,
      stock: stock === "low" || stock === "out" ? stock : "all",
      page: Math.max(1, Number(sp.get("page")) || 1),
      page_size: PAGE_SIZES.includes(size) ? size : 25,
    };
  }, [sp]);
  const update = (patch: Partial<InventoryListParams>, resetPage = true) => {
    const next = { ...params, ...(resetPage && { page: 1 }), ...patch };
    const qs = new URLSearchParams();
    if (next.q) qs.set("q", next.q);
    if (next.stock !== "all") qs.set("stock", next.stock);
    if (next.page !== 1) qs.set("page", String(next.page));
    if (next.page_size !== 25) qs.set("page_size", String(next.page_size));
    const s = qs.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  const [search, setSearch] = useState(params.q ?? "");
  const debounced = useDebounced(search.trim(), 300);
  useEffect(() => {
    if ((params.q ?? "") !== debounced) update({ q: debounced || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced input
  }, [debounced]);

  const list = useInventoryList(params);
  const [adjust, setAdjust] = useState<AdjustTarget | null>(null);
  const [history, setHistory] = useState<{ variant_id: string; label: string } | null>(null);
  const data = list.data;
  const filtered = Boolean(params.q || params.stock !== "all");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Inventory"
        description="Stock levels at your main location. Every change is recorded with a reason."
      />
      <Card>
        <div className="flex flex-col gap-2 border-b border-border p-2 sm:flex-row sm:items-center">
          <Tabs<StockTab>
            label="Stock views"
            controls="inventory-panel"
            value={params.stock}
            onChange={(stock) => update({ stock })}
            items={[
              { value: "all", label: "All" },
              { value: "low", label: "Low stock" },
              { value: "out", label: "Out of stock" },
            ]}
          />
          <div className="relative flex-1 sm:ml-auto sm:max-w-80" role="search">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
            />
            <Input
              type="search"
              aria-label="Search inventory"
              placeholder="Search by product, variant or SKU"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
        <div id="inventory-panel" role="tabpanel" aria-label="Inventory">
          {list.isError ? (
            <div className="p-4">
              <Alert
                tone="danger"
                title="Couldn't load inventory"
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
              icon={filtered ? <Search /> : <Boxes />}
              title={filtered ? "Nothing matches" : "No products yet"}
              description={
                filtered
                  ? "Try another search or view."
                  : "Products you add appear here with their stock."
              }
              action={
                filtered ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearch("");
                      update({ q: undefined, stock: "all" });
                    }}
                  >
                    <X aria-hidden /> Clear
                  </Button>
                ) : (
                  <Button asChild>
                    <Link href="/admin/products/new">Add product</Link>
                  </Button>
                )
              }
            />
          ) : (
            <>
              <Table
                aria-busy={list.isFetching || undefined}
                className={list.isPlaceholderData ? "opacity-60" : undefined}
              >
                <caption className="sr-only">Inventory</caption>
                <THead>
                  <tr>
                    <Th className="w-14">
                      <span className="sr-only">Image</span>
                    </Th>
                    <Th>Product</Th>
                    <Th>SKU</Th>
                    <Th className="text-right">On hand</Th>
                    <Th className="text-right">Available</Th>
                    <Th>Status</Th>
                    <Th className="text-right">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </THead>
                <TBody>
                  {!data
                    ? Array.from({ length: 6 }, (_, i) => (
                        <tr key={i}>
                          {[9, 48, 20, 10, 10, 16, 24].map((w, j) => (
                            <Td key={j}>
                              <Skeleton className="h-4" style={{ width: w * 4 }} />
                            </Td>
                          ))}
                        </tr>
                      ))
                    : data.data.map((r) => (
                        <Tr key={r.variant_id}>
                          <Td>
                            {r.thumbnail_url ? (
                              <img
                                src={r.thumbnail_url}
                                alt=""
                                loading="lazy"
                                className="size-9 rounded-lg border border-border object-cover"
                              />
                            ) : (
                              <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-surface-sunken text-fg-subtle">
                                <ImageIcon aria-hidden className="size-4" />
                              </div>
                            )}
                          </Td>
                          <Td className="max-w-80">
                            <Link
                              href={`/admin/products/${r.product_id}`}
                              className="block truncate font-medium hover:underline"
                            >
                              {r.product_title}
                            </Link>
                            {r.product_type === "variable" && (
                              <span className="block truncate text-xs text-fg-muted">
                                {r.variant_title}
                              </span>
                            )}
                          </Td>
                          <Td className="text-fg-muted">{r.sku ?? "—"}</Td>
                          <Td className="text-right tabular-nums">
                            {r.inventory_tracking ? r.on_hand : "—"}
                          </Td>
                          <Td className="text-right font-medium tabular-nums">
                            {r.inventory_tracking ? r.available : "—"}
                          </Td>
                          <Td>
                            <Badge tone={STOCK_TONE[r.state]}>{STOCK_LABEL[r.state]}</Badge>
                          </Td>
                          <Td>
                            <div className="flex justify-end gap-1">
                              {canAdjust && r.inventory_tracking && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() =>
                                    setAdjust({
                                      variant_id: r.variant_id,
                                      label: label(r),
                                      on_hand: r.on_hand,
                                    })
                                  }
                                  aria-label={`Adjust stock for ${label(r)}`}
                                >
                                  <PackagePlus aria-hidden /> Adjust
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setHistory({ variant_id: r.variant_id, label: label(r) })
                                }
                                aria-label={`Stock history for ${label(r)}`}
                              >
                                <History aria-hidden />
                              </Button>
                            </div>
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
      <AdjustStockDialog target={adjust} onClose={() => setAdjust(null)} />
      <MovementsDialog target={history} onClose={() => setHistory(null)} />
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense>
      <InventoryInner />
    </Suspense>
  );
}
