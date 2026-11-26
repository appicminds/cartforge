"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { PERMISSIONS, type SaleEndResult } from "@cartforge/types";
import { formatMoney } from "@cartforge/validation";
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
  PageHeader,
  Skeleton,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
  useToast,
} from "@cartforge/ui";
import { SALE_STATUS, SaleEditor } from "@/components/discounts/sale-editor";
import { localInput } from "@/components/discounts/discount-editor";
import { formatDateTime } from "@/lib/format";
import { useSale, useSaleAction } from "@/lib/sales";
import { useSession } from "@/lib/session";
import { useBreadcrumbTitle } from "@/lib/breadcrumbs";

const ITEM_STATUS = {
  active: { label: "On sale", tone: "success" },
  restored: { label: "Price restored", tone: "neutral" },
  kept: { label: "Kept your edit", tone: "warning" },
  removed: { label: "Product deleted", tone: "neutral" },
} as const;

export default function SalePage() {
  const { saleId } = useParams<{ saleId: string }>();
  const router = useRouter();
  const toast = useToast();
  const { can } = useSession();
  const canEdit = can(PERMISSIONS.DISCOUNTS_WRITE);
  const sale = useSale(saleId);
  const action = useSaleAction();
  const [ending, setEnding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<SaleEndResult | null>(null);
  const [endsAt, setEndsAt] = useState<string | null>(null);
  useBreadcrumbTitle(sale.data?.title ?? "Sale");

  if (sale.isError)
    return (
      <Alert tone="danger" title="Couldn't load the sale">
        {sale.error.message}
      </Alert>
    );
  if (!sale.data) return <Skeleton className="h-64 w-full" />;
  const s = sale.data;
  const money = (m: number | null) => (m === null ? "—" : formatMoney(m, s.currency));
  const back = (
    <Link
      href="/admin/discounts/sales"
      className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
    >
      <ArrowLeft aria-hidden className="size-4" /> Sales
    </Link>
  );

  const end = () =>
    action.mutate(
      { kind: "end", id: s.id },
      {
        onSuccess: (r) => {
          setEnding(false);
          const res = r as SaleEndResult;
          setResult(res);
          toast.success(
            s.status === "scheduled"
              ? "Sale cancelled"
              : `Sale ended — ${res.restored} prices restored`,
          );
        },
        onError: (er) => toast.error(er.message),
      },
    );

  const header = (
    <PageHeader
      title={
        <span className="flex flex-wrap items-center gap-3">
          {s.title}
          <Badge tone={SALE_STATUS[s.status].tone}>{SALE_STATUS[s.status].label}</Badge>
        </span>
      }
      description={s.summary}
      primaryAction={
        canEdit && (s.status === "running" || s.status === "scheduled") ? (
          <Button variant="destructive" onClick={() => setEnding(true)}>
            {s.status === "running" ? "End sale now" : "Cancel sale"}
          </Button>
        ) : canEdit ? (
          <Button variant="secondary" onClick={() => setDeleting(true)}>
            Delete
          </Button>
        ) : undefined
      }
    />
  );

  const dialogs = (
    <>
      <ConfirmDialog
        open={ending}
        title={s.status === "running" ? "End this sale now?" : "Cancel this sale?"}
        description={
          s.status === "running"
            ? `Prices go back to what they were on ${s.product_count} ${s.product_count === 1 ? "product" : "products"}. Products whose price you changed during the sale keep your new price.`
            : "It won't start, and no prices change."
        }
        confirmLabel={s.status === "running" ? "End sale" : "Cancel sale"}
        destructive
        pending={action.isPending}
        onConfirm={end}
        onClose={() => setEnding(false)}
      />
      <ConfirmDialog
        open={deleting}
        title="Delete this sale?"
        description="Its record and price history are removed. Product prices don't change."
        confirmLabel="Delete"
        destructive
        pending={action.isPending}
        onConfirm={() =>
          action.mutate(
            { kind: "delete", id: s.id },
            {
              onSuccess: () => {
                toast.success("Sale deleted");
                router.replace("/admin/discounts/sales");
              },
              onError: (er) => toast.error(er.message),
            },
          )
        }
        onClose={() => setDeleting(false)}
      />
    </>
  );

  if (s.status === "scheduled")
    return (
      <div className="flex flex-col gap-6">
        {back}
        {header}
        <Alert tone="info" title={`Starts ${formatDateTime(s.starts_at)}`}>
          No prices have changed yet. You can still change anything below.
        </Alert>
        {canEdit && <SaleEditor sale={s} />}
        {dialogs}
      </div>
    );

  const endValue = endsAt ?? localInput(s.ends_at);
  return (
    <div className="flex flex-col gap-6">
      {back}
      {header}
      {result && result.kept.length > 0 && (
        <Alert tone="warning" title={`${result.kept.length} kept the price you set`}>
          You changed these prices during the sale, so they weren&apos;t put back:{" "}
          {result.kept
            .map((k) =>
              k.variant_title === "Default"
                ? k.product_title
                : `${k.product_title} (${k.variant_title})`,
            )
            .join(", ")}
          .
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardBody className="flex flex-col gap-1 text-sm">
            <span className="text-fg-muted">
              {s.status === "running" ? "On sale now" : "Were on sale"}
            </span>
            <span className="text-2xl font-semibold tabular-nums">{s.product_count}</span>
            <span className="text-fg-muted">
              {s.product_count === 1 ? "product" : "products"} · {s.variant_count}{" "}
              {s.variant_count === 1 ? "variant" : "variants"}
            </span>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex flex-col gap-1 text-sm">
            <span className="text-fg-muted">Started</span>
            <span className="font-medium">
              {s.started_at ? formatDateTime(s.started_at) : "Didn't run"}
            </span>
            <span className="text-fg-muted">
              {s.status === "running"
                ? s.ends_at
                  ? `Ends ${formatDateTime(s.ends_at)}`
                  : "Runs until you end it"
                : s.ended_at
                  ? `Ended ${formatDateTime(s.ended_at)}`
                  : ""}
            </span>
          </CardBody>
        </Card>
        {s.status !== "running" && (
          <Card>
            <CardBody className="flex flex-col gap-1 text-sm">
              <span className="text-fg-muted">Prices put back</span>
              <span className="text-2xl font-semibold tabular-nums">{s.restored_count}</span>
              <span className="text-fg-muted">
                {s.kept_count
                  ? `${s.kept_count} kept a price you set during the sale`
                  : "All prices went back"}
              </span>
            </CardBody>
          </Card>
        )}
        {s.status === "running" && canEdit && (
          <Card>
            <CardBody className="flex flex-col gap-3 text-sm">
              <Field label="End date" hint="Leave empty to run until you end it.">
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    type="datetime-local"
                    aria-describedby={describedBy}
                    value={endValue}
                    onChange={(ev) => setEndsAt(ev.target.value)}
                  />
                )}
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={action.isPending || endValue === localInput(s.ends_at)}
                  onClick={() =>
                    action.mutate(
                      {
                        kind: "update",
                        id: s.id,
                        body: { ends_at: endValue ? new Date(endValue).toISOString() : null },
                      },
                      {
                        onSuccess: () => {
                          setEndsAt(null);
                          toast.success("End date saved");
                        },
                        onError: (er) => toast.error(er.message),
                      },
                    )
                  }
                >
                  Save end date
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate(
                      { kind: "apply-new", id: s.id },
                      {
                        onSuccess: (r) => {
                          const n = (r as { added: number }).added;
                          toast.success(
                            n
                              ? `Added ${n} ${n === 1 ? "variant" : "variants"}`
                              : "Nothing new to add",
                          );
                        },
                        onError: (er) => toast.error(er.message),
                      },
                    )
                  }
                >
                  Add new matching products
                </Button>
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader
          title="Products"
          description={
            s.status === "running"
              ? "Editing a product's price during the sale is fine: it keeps your price when the sale ends."
              : undefined
          }
        />
        {s.items.length === 0 ? (
          <CardBody className="text-sm text-fg-muted">No products.</CardBody>
        ) : (
          <Table>
            <caption className="sr-only">Products in this sale</caption>
            <THead>
              <Tr>
                <Th>Product</Th>
                <Th className="text-right">Before</Th>
                <Th className="text-right">Sale price</Th>
                <Th className="text-right">Price now</Th>
                <Th>Status</Th>
                {s.status === "running" && canEdit && (
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                )}
              </Tr>
            </THead>
            <TBody>
              {s.items.map((i, n) => (
                <Tr key={n}>
                  <Td className="max-w-72">
                    <Link
                      href={`/admin/products/${i.product_id}`}
                      className="block truncate font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {i.product_title}
                    </Link>
                    {i.variant_title !== "Default" && (
                      <span className="block truncate text-xs text-fg-muted">
                        {i.variant_title}
                      </span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">
                    {money(i.old_price_minor)}
                    {i.old_compare_minor !== null && i.old_compare_minor > i.old_price_minor && (
                      <s className="block text-xs text-fg-muted">{money(i.old_compare_minor)}</s>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">
                    {money(i.sale_price_minor)}
                  </Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">
                    {money(i.current_price_minor)}
                  </Td>
                  <Td>
                    <Badge tone={ITEM_STATUS[i.status].tone}>{ITEM_STATUS[i.status].label}</Badge>
                  </Td>
                  {s.status === "running" && canEdit && (
                    <Td className="text-right">
                      {i.status === "active" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={action.isPending}
                          aria-label={`Remove ${i.product_title} from the sale`}
                          onClick={() =>
                            action.mutate(
                              { kind: "remove-products", id: s.id, product_ids: [i.product_id] },
                              {
                                onSuccess: (r) => {
                                  const res = r as SaleEndResult;
                                  toast.success(
                                    res.kept.length
                                      ? "Removed — it keeps the price you set"
                                      : "Removed — price restored",
                                  );
                                },
                                onError: (er) => toast.error(er.message),
                              },
                            )
                          }
                        >
                          Remove
                        </Button>
                      )}
                    </Td>
                  )}
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      {dialogs}
    </div>
  );
}
