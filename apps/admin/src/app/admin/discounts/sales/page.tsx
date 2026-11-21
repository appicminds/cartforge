"use client";

import Link from "next/link";
import { BadgePercent, Plus } from "lucide-react";
import { PERMISSIONS } from "@cartforge/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from "@cartforge/ui";
import { DiscountTabs } from "@/components/discounts/discount-tabs";
import { SALE_STATUS } from "@/components/discounts/sale-editor";
import { formatDateTime } from "@/lib/format";
import { useSales } from "@/lib/sales";
import { useSession } from "@/lib/session";
import { useBreadcrumbTitle } from "@/lib/breadcrumbs";

/** Admin: Discounts → Sales (bulk price changes). */
export default function SalesPage() {
  const { can } = useSession();
  const canEdit = can(PERMISSIONS.DISCOUNTS_WRITE);
  const list = useSales();
  useBreadcrumbTitle("Sales");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Discounts"
        description="Sales change product prices for a while, e.g. 20% off everything. Old prices show struck through and come back when the sale ends."
        primaryAction={
          canEdit ? (
            <Button asChild>
              <Link href="/admin/discounts/sales/new">
                <Plus aria-hidden /> Run a sale
              </Link>
            </Button>
          ) : undefined
        }
      />
      <DiscountTabs />
      <Card>
        {list.isError ? (
          <div className="p-4">
            <Alert tone="danger" title="Couldn't load sales">
              {list.error.message}
            </Alert>
          </div>
        ) : !list.data ? (
          <div className="p-4">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : list.data.length === 0 ? (
          <EmptyState
            icon={<BadgePercent />}
            title="No sales yet"
            description="Run a sale to take a percentage or amount off many products at once, now or on a date."
          />
        ) : (
          <Table>
            <caption className="sr-only">Sales</caption>
            <THead>
              <Tr>
                <Th>Sale</Th>
                <Th>Status</Th>
                <Th className="text-right">Products</Th>
                <Th>Dates</Th>
              </Tr>
            </THead>
            <TBody>
              {list.data.map((s) => (
                <Tr key={s.id}>
                  <Td className="max-w-80">
                    <Link
                      href={`/admin/discounts/sales/${s.id}`}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {s.title}
                    </Link>
                    <p className="text-xs text-fg-muted">{s.summary}</p>
                  </Td>
                  <Td>
                    <Badge tone={SALE_STATUS[s.status].tone}>{SALE_STATUS[s.status].label}</Badge>
                  </Td>
                  <Td className="text-right tabular-nums">
                    {s.status === "scheduled" ? "—" : s.product_count}
                  </Td>
                  <Td className="whitespace-nowrap text-fg-muted">
                    {formatDateTime(s.started_at ?? s.starts_at)}
                    {s.ended_at
                      ? ` – ${formatDateTime(s.ended_at)}`
                      : s.ends_at
                        ? ` – ${formatDateTime(s.ends_at)}`
                        : " · until ended"}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
