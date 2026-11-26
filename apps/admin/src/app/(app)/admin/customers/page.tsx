"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Contact, Search } from "lucide-react";
import { formatMoney } from "@cartforge/validation";
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from "@cartforge/ui";
import { useCustomerList, type CustomerListParams } from "@/lib/customers";
import { formatDate } from "@/lib/format";
import { useDebounced } from "@/lib/use-debounced";

/** Admin: everyone who ordered or signed up (Next 7). */
export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 300);
  const [sort, setSort] = useState<CustomerListParams["sort"]>("created_at");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  useEffect(() => setPage(1), [q, sort]);
  const list = useCustomerList({ q: q || undefined, sort, page, page_size: pageSize });
  const data = list.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Customers"
        description="Everyone who has ordered from your store or created an account."
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-80" role="search">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
            />
            <Input
              type="search"
              aria-label="Search customers"
              placeholder="Name, email, phone or tag"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <label className="flex items-center gap-2 text-sm sm:ml-auto">
            <span className="text-fg-muted">Sort by</span>
            <Select
              aria-label="Sort customers"
              className="w-44"
              value={sort}
              onChange={(e) => setSort(e.target.value as CustomerListParams["sort"])}
            >
              <option value="created_at">Newest</option>
              <option value="last_order_at">Last order</option>
              <option value="total_spent">Amount spent</option>
            </Select>
          </label>
        </div>
        {list.isError ? (
          <div className="p-4">
            <Alert tone="danger" title="Couldn't load customers">
              {list.error.message}
            </Alert>
          </div>
        ) : data && data.data.length === 0 ? (
          <EmptyState
            icon={q ? <Search /> : <Contact />}
            title={q ? "No customers match" : "No customers yet"}
            description={
              q
                ? "Try another name, email, phone or tag."
                : "Customers appear here with their first order."
            }
          />
        ) : (
          <>
            <Table aria-busy={list.isFetching || undefined}>
              <caption className="sr-only">Customers</caption>
              <THead>
                <tr>
                  <Th>Customer</Th>
                  <Th>Phone</Th>
                  <Th className="text-right">Orders</Th>
                  <Th className="text-right">Spent</Th>
                  <Th>Last order</Th>
                </tr>
              </THead>
              <TBody>
                {!data
                  ? Array.from({ length: 6 }, (_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 5 }, (_, j) => (
                          <Td key={j}>
                            <Skeleton className="h-4 w-20" />
                          </Td>
                        ))}
                      </tr>
                    ))
                  : data.data.map((c) => (
                      <Tr key={c.id}>
                        <Td className="max-w-72">
                          <Link
                            href={`/admin/customers/${c.id}`}
                            className="block truncate font-medium hover:underline"
                          >
                            {c.name ?? c.email}
                          </Link>
                          <span className="flex flex-wrap items-center gap-1 text-xs text-fg-muted">
                            <span className="truncate">{c.email}</span>
                            {c.has_account && <Badge>Account</Badge>}
                            {c.tags.map((t) => (
                              <Badge key={t} tone="info">
                                {t}
                              </Badge>
                            ))}
                          </span>
                        </Td>
                        <Td className="whitespace-nowrap text-fg-muted">{c.phone ?? "—"}</Td>
                        <Td className="text-right tabular-nums">{c.orders_count}</Td>
                        <Td className="text-right tabular-nums">
                          {formatMoney(c.total_spent_minor, c.currency)}
                        </Td>
                        <Td className="whitespace-nowrap text-fg-muted">
                          {c.last_order_at ? formatDate(c.last_order_at) : "—"}
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
                pageSizes={[25, 50, 100]}
                onPageChange={setPage}
                onPageSizeChange={(n) => {
                  setPageSize(n);
                  setPage(1);
                }}
              />
            )}
          </>
        )}
      </Card>
    </div>
  );
}
