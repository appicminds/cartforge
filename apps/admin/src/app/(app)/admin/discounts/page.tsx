"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, Search, Tag } from "lucide-react";
import { PERMISSIONS, type DiscountStatus } from "@cartforge/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Skeleton,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from "@cartforge/ui";
import { DiscountTabs } from "@/components/discounts/discount-tabs";
import { useDiscounts } from "@/lib/discounts";
import { formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useDebounced } from "@/lib/use-debounced";

const STATUS: Record<
  DiscountStatus,
  { label: string; tone: "success" | "info" | "neutral" | "warning" }
> = {
  active: { label: "Active", tone: "success" },
  scheduled: { label: "Scheduled", tone: "info" },
  expired: { label: "Expired", tone: "neutral" },
  disabled: { label: "Off", tone: "neutral" },
  used_up: { label: "Used up", tone: "warning" },
};

/** Admin: discount codes and automatic discounts (Next 8). */
export default function DiscountsPage() {
  const { can } = useSession();
  const canEdit = can(PERMISSIONS.DISCOUNTS_WRITE);
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 300);
  const [status, setStatus] = useState("");
  const list = useDiscounts({ q: q || undefined, status: status || undefined });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Discounts"
        description="Codes customers enter at checkout, and discounts that apply automatically."
        primaryAction={
          canEdit ? (
            <Button asChild>
              <Link href="/admin/discounts/new">
                <Plus aria-hidden /> Create discount
              </Link>
            </Button>
          ) : undefined
        }
      />
      <DiscountTabs />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-border p-4">
          <div className="relative min-w-56 flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
            />
            <Input
              type="search"
              aria-label="Search discounts"
              placeholder="Search by title or code"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            aria-label="Status"
            className="w-40"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </div>
        {list.isError ? (
          <div className="p-4">
            <Alert tone="danger" title="Couldn't load discounts">
              {list.error.message}
            </Alert>
          </div>
        ) : !list.data ? (
          <div className="p-4">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : list.data.length === 0 ? (
          <EmptyState
            icon={<Tag />}
            title={q || status ? "No discounts match" : "No discounts yet"}
            description="Create a code like EID20, or an automatic deal like buy 2 get 1 free."
          />
        ) : (
          <Table>
            <caption className="sr-only">Discounts</caption>
            <THead>
              <Tr>
                <Th>Discount</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th className="text-right">Used</Th>
                <Th>Dates</Th>
              </Tr>
            </THead>
            <TBody>
              {list.data.map((d) => (
                <Tr key={d.id}>
                  <Td className="max-w-80">
                    <Link
                      href={`/admin/discounts/${d.id}`}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {d.code ?? d.title}
                    </Link>
                    <p className="text-xs text-fg-muted">
                      {d.code ? `${d.title} · ` : ""}
                      {d.summary}
                    </p>
                  </Td>
                  <Td className="whitespace-nowrap text-fg-muted">
                    {d.method === "code" ? "Code" : "Automatic"}
                  </Td>
                  <Td>
                    <Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
                  </Td>
                  <Td className="text-right tabular-nums">
                    {d.used_count}
                    {d.usage_limit !== null && ` / ${d.usage_limit}`}
                  </Td>
                  <Td className="whitespace-nowrap text-fg-muted">
                    {formatDate(d.starts_at)}
                    {d.ends_at ? ` – ${formatDate(d.ends_at)}` : " onwards"}
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
