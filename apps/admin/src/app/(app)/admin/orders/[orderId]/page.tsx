"use client";

import Link from "next/link";
import { use, useState } from "react";
import { ArrowLeft, Receipt, Truck } from "lucide-react";
import { PERMISSIONS, type CommerceAddress, type OrderDetail } from "@cartforge/types";
import { formatMoney } from "@cartforge/validation";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Skeleton,
  Textarea,
  useToast,
} from "@cartforge/ui";
import { ApiError } from "@/lib/api-client";
import {
  FULFILLMENT_LABEL,
  ORDER_LABEL,
  PAYMENT_LABEL,
  PAYMENT_TONE,
  useOrder,
  useOrderAction,
} from "@/lib/commerce";
import { formatDateTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import {
  CancelDialog,
  FulfillDialog,
  MarkPaidDialog,
  RefundDialog,
  allowed,
  progress,
} from "./order-actions";

type Open = null | "paid" | "fulfill" | "cancel" | "refund";

const CANCEL_LABEL: Record<string, string> = {
  customer: "customer changed their mind",
  inventory: "items unavailable",
  fraud: "fraudulent order",
  declined: "payment declined",
  other: "other",
};

function Shipments({ order, canWrite }: { order: OrderDetail; canWrite: boolean }) {
  const action = useOrderAction(order.id);
  const toast = useToast();
  if (!order.fulfillments.length) return null;
  return (
    <Card>
      <CardHeader title="Shipments" />
      <CardBody>
        <ul className="divide-y divide-border" aria-label="Shipments">
          {order.fulfillments.map((f, i) => (
            <li key={f.id} className="flex flex-wrap items-start gap-3 py-3 text-sm">
              <Truck aria-hidden className="mt-0.5 size-4 text-fg-muted" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  Shipment {i + 1}
                  <Badge tone={f.delivered_at ? "success" : "info"}>
                    {f.delivered_at ? "Delivered" : "Shipped"}
                  </Badge>
                </p>
                <p className="text-fg-muted">
                  {f.items.map((x) => `${x.quantity} × ${x.title}`).join(", ")}
                </p>
                <p className="text-fg-muted">
                  Shipped {formatDateTime(f.shipped_at)}
                  {f.delivered_at && <> · delivered {formatDateTime(f.delivered_at)}</>}
                </p>
                {(f.tracking_company || f.tracking_number) && (
                  <p>
                    {[f.tracking_company, f.tracking_number].filter(Boolean).join(" ")}
                    {f.tracking_url && (
                      <>
                        {" · "}
                        <a
                          href={f.tracking_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline underline-offset-2"
                        >
                          Track
                        </a>
                      </>
                    )}
                  </p>
                )}
              </div>
              {canWrite && !f.delivered_at && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={action.isPending && action.variables?.kind === "delivered"}
                  aria-label={`Mark delivered, shipment ${i + 1}`}
                  onClick={() =>
                    action.mutate(
                      { kind: "delivered", fulfillmentId: f.id },
                      {
                        onSuccess: () => toast.success("Marked as delivered"),
                        onError: (e) => toast.error(e.message),
                      },
                    )
                  }
                >
                  Mark delivered
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function NoteForm({ order }: { order: OrderDetail }) {
  const action = useOrderAction(order.id);
  const [note, setNote] = useState("");
  return (
    <form
      className="mb-4 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!note.trim()) return;
        action.mutate({ kind: "note", body: { message: note } }, { onSuccess: () => setNote("") });
      }}
    >
      <label htmlFor="order-note" className="sr-only">
        Add a note
      </label>
      <Textarea
        id="order-note"
        rows={2}
        maxLength={500}
        placeholder="Add a note for your team…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {action.isError && <p className="text-sm text-danger">{action.error.message}</p>}
      <div>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          loading={action.isPending}
          disabled={!note.trim()}
        >
          Add note
        </Button>
      </div>
    </form>
  );
}

function AddressBlock({ a }: { a: CommerceAddress }) {
  const country = new Intl.DisplayNames(["en"], { type: "region" }).of(a.country) ?? a.country;
  return (
    <address className="text-sm not-italic leading-relaxed">
      {[a.first_name, a.last_name].filter(Boolean).join(" ")}
      {a.company && (
        <>
          <br />
          {a.company}
        </>
      )}
      <br />
      {a.address1}
      {a.address2 && `, ${a.address2}`}
      <br />
      {[a.city, a.region, a.postal_code].filter(Boolean).join(", ")}
      <br />
      {country}
      {a.phone && (
        <>
          <br />
          {a.phone}
        </>
      )}
    </address>
  );
}

export default function OrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const q = useOrder(orderId);
  const { can } = useSession();
  const [open, setOpen] = useState<Open>(null);
  if (q.isError) {
    return q.error instanceof ApiError && q.error.status === 404 ? (
      <EmptyState
        icon={<Receipt />}
        title="Order not found"
        description="It may belong to another store."
        action={
          <Button asChild variant="secondary">
            <Link href="/admin/orders">Back to orders</Link>
          </Button>
        }
      />
    ) : (
      <Alert tone="danger" title="Couldn't load this order">
        {q.error.message}
      </Alert>
    );
  }
  const o = q.data;
  if (!o) return <Skeleton className="h-96 w-full" />;
  const money = (m: number) => formatMoney(m, o.currency);
  const t = o.totals;
  const canWrite = can(PERMISSIONS.ORDERS_WRITE);
  const canRefund = can(PERMISSIONS.ORDERS_REFUND);
  const ok = allowed(o);
  const lineProgress = new Map(progress(o).map((p) => [p.line.id, p]));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/orders" aria-label="Back to orders">
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">Order #{o.number}</h1>
            <Badge tone={PAYMENT_TONE[o.payment_status]}>{PAYMENT_LABEL[o.payment_status]}</Badge>
            <Badge tone={o.fulfillment_status === "fulfilled" ? "success" : "neutral"}>
              {FULFILLMENT_LABEL[o.fulfillment_status]}
            </Badge>
            <Badge>{ORDER_LABEL[o.status]}</Badge>
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            Placed {formatDateTime(o.placed_at)} ·{" "}
            {o.source === "storefront" ? "Online store" : o.source}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          {canWrite && ok.markPaid && (
            <Button variant="secondary" onClick={() => setOpen("paid")}>
              Mark as paid
            </Button>
          )}
          {canWrite && ok.fulfill && <Button onClick={() => setOpen("fulfill")}>Ship items</Button>}
          {canRefund && ok.refund && (
            <Button variant="secondary" onClick={() => setOpen("refund")}>
              Refund
            </Button>
          )}
          {canWrite && ok.cancel && (
            <Button variant="ghost" onClick={() => setOpen("cancel")}>
              Cancel order
            </Button>
          )}
        </div>
      </div>
      {o.canceled_at && (
        <Alert tone="warning" title={`Canceled ${formatDateTime(o.canceled_at)}`}>
          Reason: {CANCEL_LABEL[o.cancel_reason ?? "other"] ?? o.cancel_reason}.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader title="Items" />
            <CardBody>
              <ul className="divide-y divide-border">
                {o.lines.map((l) => (
                  <li key={l.id} className="flex justify-between gap-4 py-3 text-sm">
                    <div className="min-w-0">
                      {l.product_id ? (
                        <Link
                          href={`/admin/products/${l.product_id}`}
                          className="font-medium hover:underline"
                        >
                          {l.product_title}
                        </Link>
                      ) : (
                        <span className="font-medium">{l.product_title}</span>
                      )}
                      {l.variant_title && <p className="text-fg-muted">{l.variant_title}</p>}
                      {l.sku && <p className="text-xs text-fg-subtle">SKU {l.sku}</p>}
                    </div>
                    <div className="whitespace-nowrap text-right text-fg-muted tabular-nums">
                      <p>
                        {money(l.unit_price_minor)} × {l.quantity}
                      </p>
                      {(lineProgress.get(l.id)?.fulfilled ?? 0) > 0 && (
                        <p className="text-xs">
                          Shipped {lineProgress.get(l.id)!.fulfilled} of {l.quantity}
                        </p>
                      )}
                      {(lineProgress.get(l.id)?.refunded ?? 0) > 0 && (
                        <p className="text-xs">Refunded {lineProgress.get(l.id)!.refunded}</p>
                      )}
                    </div>
                    <p className="w-24 text-right font-medium tabular-nums">
                      {money(l.line_total_minor)}
                    </p>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Payment"
              description={o.payment ? `${o.payment.label}` : undefined}
            />
            <CardBody>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt>Subtotal</dt>
                  <dd className="tabular-nums">{money(t.subtotal_minor)}</dd>
                </div>
                {o.discounts.length > 0
                  ? o.discounts.map((d) => (
                      <div key={d.id} className="flex justify-between" data-testid="order-discount">
                        <dt>
                          {d.kind === "shipping" ? "Free shipping" : "Discount"}
                          {d.code ? ` · ${d.code}` : ` · ${d.title}`}
                        </dt>
                        <dd className="tabular-nums">−{money(d.amount_minor)}</dd>
                      </div>
                    ))
                  : t.discount_minor > 0 && (
                      <div className="flex justify-between">
                        <dt>Discount</dt>
                        <dd className="tabular-nums">−{money(t.discount_minor)}</dd>
                      </div>
                    )}
                {o.shipping_method && (
                  <div className="flex justify-between">
                    <dt>Shipping · {o.shipping_method.name}</dt>
                    <dd className="tabular-nums">
                      {/* Before a free-shipping discount, which is listed above. */}
                      {money(
                        t.shipping_minor +
                          o.discounts
                            .filter((d) => d.kind === "shipping")
                            .reduce((a, d) => a + d.amount_minor, 0),
                      )}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt>
                    {t.tax_label}
                    {t.prices_include_tax ? " (included)" : ""}
                  </dt>
                  <dd className="tabular-nums">{money(t.tax_minor)}</dd>
                </div>
                <div className="flex justify-between border-t border-border pt-2 font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{money(t.total_minor)}</dd>
                </div>
                {o.store_value && (
                  <div className="flex justify-between text-fg-muted" data-testid="store-value">
                    <dt>
                      In {o.store_value.currency} (1 {o.currency} ={" "}
                      {o.store_value.rate.toLocaleString("en", { maximumFractionDigits: 4 })})
                    </dt>
                    <dd className="tabular-nums">
                      ≈ {formatMoney(o.store_value.total_minor, o.store_value.currency)}
                    </dd>
                  </div>
                )}
                {o.refunded_minor > 0 && (
                  <>
                    <div className="flex justify-between text-fg-muted">
                      <dt>Refunded</dt>
                      <dd className="tabular-nums">−{money(o.refunded_minor)}</dd>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <dt>Net</dt>
                      <dd className="tabular-nums">{money(t.total_minor - o.refunded_minor)}</dd>
                    </div>
                  </>
                )}
              </dl>
              {o.refunds.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-fg-muted" aria-label="Refunds">
                  {o.refunds.map((r) => (
                    <li key={r.id}>
                      {formatDateTime(r.created_at)}: refunded {money(r.amount_minor)}
                      {r.items.length > 0 &&
                        ` (${r.items.map((x) => `${x.quantity} × ${x.title}${x.restocked ? ", restocked" : ""}`).join("; ")})`}
                      {r.reason && ` — ${r.reason}`}
                      {r.created_by && ` · ${r.created_by}`}
                    </li>
                  ))}
                </ul>
              )}
              {o.payment?.instructions && (
                <p className="mt-3 whitespace-pre-line rounded-lg bg-surface-sunken p-3 text-xs text-fg-muted">
                  {o.payment.instructions}
                </p>
              )}
            </CardBody>
          </Card>
          <Shipments order={o} canWrite={canWrite} />
          <Card>
            <CardHeader title="Timeline" />
            <CardBody>
              {canWrite && <NoteForm order={o} />}
              <ol className="space-y-3 border-l border-border pl-4" aria-label="Order timeline">
                {[...o.events].reverse().map((e) => (
                  <li key={e.id} className="text-sm">
                    <p
                      className={
                        e.type === "note"
                          ? "whitespace-pre-line rounded-md bg-surface-sunken px-2 py-1"
                          : undefined
                      }
                    >
                      {e.message}
                    </p>
                    <p className="text-xs text-fg-muted">
                      {formatDateTime(e.at)}
                      {e.actor && ` · ${e.actor}`}
                    </p>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Customer" />
            <CardBody className="space-y-1 text-sm">
              {o.email && (
                <p>
                  <a className="text-primary hover:underline" href={`mailto:${o.email}`}>
                    {o.email}
                  </a>
                </p>
              )}
              {o.phone && <p>{o.phone}</p>}
              {!o.email && !o.phone && <p className="text-fg-muted">No contact details</p>}
            </CardBody>
          </Card>
          {o.shipping_address && (
            <Card>
              <CardHeader title="Shipping address" />
              <CardBody>
                <AddressBlock a={o.shipping_address} />
              </CardBody>
            </Card>
          )}
          {o.billing_address && (
            <Card>
              <CardHeader title="Billing address" />
              <CardBody>
                <AddressBlock a={o.billing_address} />
              </CardBody>
            </Card>
          )}
          {(o.custom_fields.length > 0 || o.terms_accepted_at) && (
            <Card>
              <CardHeader title="Additional details" />
              <CardBody>
                <dl className="space-y-2 text-sm">
                  {o.custom_fields.map((f) => (
                    <div key={f.key}>
                      <dt className="text-fg-muted">{f.label}</dt>
                      <dd className="whitespace-pre-line">
                        {typeof f.value === "boolean" ? (f.value ? "Yes" : "No") : f.value}
                      </dd>
                    </div>
                  ))}
                  {o.terms_accepted_at && (
                    <div>
                      <dt className="text-fg-muted">Terms accepted</dt>
                      <dd>{formatDateTime(o.terms_accepted_at)}</dd>
                    </div>
                  )}
                </dl>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
      <MarkPaidDialog order={o} open={open === "paid"} onClose={() => setOpen(null)} />
      <FulfillDialog order={o} open={open === "fulfill"} onClose={() => setOpen(null)} />
      <CancelDialog
        order={o}
        open={open === "cancel"}
        canRefund={canRefund}
        onClose={() => setOpen(null)}
      />
      <RefundDialog order={o} open={open === "refund"} onClose={() => setOpen(null)} />
    </div>
  );
}
