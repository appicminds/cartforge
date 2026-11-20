"use client";

import Link from "next/link";
import { use } from "react";
import { ArrowLeft, Receipt } from "lucide-react";
import type { CommerceAddress } from "@cartforge/types";
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
} from "@cartforge/ui";
import { ApiError } from "@/lib/api-client";
import {
  FULFILLMENT_LABEL,
  ORDER_LABEL,
  PAYMENT_LABEL,
  PAYMENT_TONE,
  useOrder,
} from "@/lib/commerce";
import { formatDateTime } from "@/lib/format";

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
      </div>

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
                    <p className="whitespace-nowrap text-fg-muted tabular-nums">
                      {money(l.unit_price_minor)} × {l.quantity}
                    </p>
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
                {t.discount_minor > 0 && (
                  <div className="flex justify-between">
                    <dt>Discount</dt>
                    <dd className="tabular-nums">−{money(t.discount_minor)}</dd>
                  </div>
                )}
                {o.shipping_method && (
                  <div className="flex justify-between">
                    <dt>Shipping · {o.shipping_method.name}</dt>
                    <dd className="tabular-nums">{money(t.shipping_minor)}</dd>
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
              </dl>
              {o.payment?.instructions && (
                <p className="mt-3 whitespace-pre-line rounded-lg bg-surface-sunken p-3 text-xs text-fg-muted">
                  {o.payment.instructions}
                </p>
              )}
              <p className="mt-3 text-xs text-fg-subtle">
                Recording payments, fulfillment and refunds arrives with Order Management (Next 6).
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Timeline" />
            <CardBody>
              <ol className="space-y-3 border-l border-border pl-4">
                {[...o.events].reverse().map((e) => (
                  <li key={e.id} className="text-sm">
                    <p>{e.message}</p>
                    <p className="text-xs text-fg-muted">{formatDateTime(e.at)}</p>
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
    </div>
  );
}
