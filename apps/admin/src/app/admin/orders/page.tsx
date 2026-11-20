"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Receipt, Search, X } from "lucide-react";
import type { PaymentStatus } from "@cartforge/types";
import { formatMoney } from "@cartforge/validation";
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
import {
  FULFILLMENT_LABEL,
  PAYMENT_LABEL,
  PAYMENT_TONE,
  useOrderList,
  type OrderListParams,
} from "@/lib/commerce";
import { formatDateTime } from "@/lib/format";
import { useDebounced } from "@/lib/use-debounced";

type Tab = "all" | "pending" | "paid";
const PAGE_SIZES = [25, 50, 100];

function OrdersInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab: Tab =
    sp.get("payment") === "pending" ? "pending" : sp.get("payment") === "paid" ? "paid" : "all";
  const params: OrderListParams = useMemo(() => {
    const size = Number(sp.get("page_size"));
    return {
      q: sp.get("q") ?? undefined,
      payment_status: tab === "all" ? undefined : (tab as PaymentStatus),
      page: Math.max(1, Number(sp.get("page")) || 1),
      page_size: PAGE_SIZES.includes(size) ? size : 25,
    };
  }, [sp, tab]);
  const update = (patch: { q?: string; tab?: Tab; page?: number; page_size?: number }) => {
    const qs = new URLSearchParams();
    const q = "q" in patch ? patch.q : params.q;
    const t = patch.tab ?? tab;
    const page = patch.page ?? (patch.q !== undefined || patch.tab ? 1 : params.page);
    const size = patch.page_size ?? params.page_size;
    if (q) qs.set("q", q);
    if (t !== "all") qs.set("payment", t);
    if (page > 1) qs.set("page", String(page));
    if (size !== 25) qs.set("page_size", String(size));
    const s = qs.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };
  const [search, setSearch] = useState(params.q ?? "");
  const debounced = useDebounced(search.trim(), 300);
  useEffect(() => {
    if ((params.q ?? "") !== debounced) update({ q: debounced || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced input
  }, [debounced]);

  const list = useOrderList(params);
  const data = list.data;
  const filtered = Boolean(params.q || tab !== "all");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Orders" description="Orders placed on your storefront, newest first." />
      <Card>
        <div className="flex flex-col gap-2 border-b border-border p-2 sm:flex-row sm:items-center">
          <Tabs<Tab>
            label="Order views"
            controls="orders-panel"
            value={tab}
            onChange={(t) => update({ tab: t })}
            items={[
              { value: "all", label: "All" },
              { value: "pending", label: "Awaiting payment" },
              { value: "paid", label: "Paid" },
            ]}
          />
          <div className="relative flex-1 sm:ml-auto sm:max-w-80" role="search">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
            />
            <Input
              type="search"
              aria-label="Search orders"
              placeholder="Order number, email or product"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
        <div id="orders-panel" role="tabpanel" aria-label="Orders">
          {list.isError ? (
            <div className="p-4">
              <Alert
                tone="danger"
                title="Couldn't load orders"
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
              icon={filtered ? <Search /> : <Receipt />}
              title={filtered ? "No orders match" : "No orders yet"}
              description={
                filtered
                  ? "Try another search or view."
                  : "Orders from your storefront appear here as soon as they're placed."
              }
              action={
                filtered ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearch("");
                      update({ q: undefined, tab: "all" });
                    }}
                  >
                    <X aria-hidden /> Clear
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <Table
                aria-busy={list.isFetching || undefined}
                className={list.isPlaceholderData ? "opacity-60" : undefined}
              >
                <caption className="sr-only">Orders</caption>
                <THead>
                  <tr>
                    <Th>Order</Th>
                    <Th>Date</Th>
                    <Th>Customer</Th>
                    <Th>Payment</Th>
                    <Th>Fulfillment</Th>
                    <Th className="text-right">Items</Th>
                    <Th className="text-right">Total</Th>
                  </tr>
                </THead>
                <TBody>
                  {!data
                    ? Array.from({ length: 6 }, (_, i) => (
                        <tr key={i}>
                          {[14, 28, 40, 20, 20, 8, 16].map((w, j) => (
                            <Td key={j}>
                              <Skeleton className="h-4" style={{ width: w * 4 }} />
                            </Td>
                          ))}
                        </tr>
                      ))
                    : data.data.map((o) => (
                        <Tr key={o.id}>
                          <Td>
                            <Link
                              href={`/admin/orders/${o.id}`}
                              className="font-medium hover:underline"
                            >
                              #{o.number}
                            </Link>
                          </Td>
                          <Td className="whitespace-nowrap text-fg-muted">
                            {formatDateTime(o.placed_at)}
                          </Td>
                          <Td className="max-w-64">
                            <span className="block truncate">{o.customer_name ?? "—"}</span>
                            {o.email && (
                              <span className="block truncate text-xs text-fg-muted">
                                {o.email}
                              </span>
                            )}
                          </Td>
                          <Td>
                            <Badge tone={PAYMENT_TONE[o.payment_status]}>
                              {PAYMENT_LABEL[o.payment_status]}
                            </Badge>
                          </Td>
                          <Td>
                            <Badge
                              tone={o.fulfillment_status === "fulfilled" ? "success" : "neutral"}
                            >
                              {FULFILLMENT_LABEL[o.fulfillment_status]}
                            </Badge>
                          </Td>
                          <Td className="text-right tabular-nums">{o.item_count}</Td>
                          <Td className="text-right font-medium tabular-nums">
                            {formatMoney(o.total_minor, o.currency)}
                          </Td>
                        </Tr>
                      ))}
                </TBody>
              </Table>
              {data && (
                <Pagination
                  className="border-t border-border p-3"
                  page={data.meta.page}
                  pageSize={data.meta.page_size}
                  total={data.meta.total}
                  totalPages={data.meta.total_pages}
                  pageSizes={PAGE_SIZES}
                  onPageChange={(page) => update({ page })}
                  onPageSizeChange={(page_size) => update({ page_size, page: 1 })}
                />
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersInner />
    </Suspense>
  );
}
