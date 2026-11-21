"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft, Contact } from "lucide-react";
import { PERMISSIONS, type CommerceAddress } from "@cartforge/types";
import { formatMoney } from "@cartforge/validation";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Skeleton,
  Textarea,
  useToast,
} from "@cartforge/ui";
import { ApiError } from "@/lib/api-client";
import { FULFILLMENT_LABEL, PAYMENT_LABEL, PAYMENT_TONE } from "@/lib/commerce";
import { useCustomer, useUpdateCustomer } from "@/lib/customers";
import { formatDate, formatDateTime } from "@/lib/format";
import { useSession } from "@/lib/session";

function AddressText({ a }: { a: CommerceAddress }) {
  const country = new Intl.DisplayNames(["en"], { type: "region" }).of(a.country) ?? a.country;
  return (
    <address className="text-sm not-italic leading-relaxed">
      {[a.first_name, a.last_name].filter(Boolean).join(" ")}
      <br />
      {a.address1}
      {a.address2 && `, ${a.address2}`}
      <br />
      {[a.city, a.region, a.postal_code].filter(Boolean).join(", ")}
      <br />
      {country}
    </address>
  );
}

export default function CustomerPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = use(params);
  const q = useCustomer(customerId);
  const update = useUpdateCustomer(customerId);
  const toast = useToast();
  const { can } = useSession();
  const canEdit = can(PERMISSIONS.CUSTOMERS_WRITE);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  useEffect(() => {
    if (q.data) {
      setNote(q.data.note ?? "");
      setTags(q.data.tags.join(", "));
    }
  }, [q.data]);

  if (q.isError)
    return q.error instanceof ApiError && q.error.status === 404 ? (
      <EmptyState
        icon={<Contact />}
        title="Customer not found"
        description="They may belong to another store."
        action={
          <Button asChild variant="secondary">
            <Link href="/admin/customers">Back to customers</Link>
          </Button>
        }
      />
    ) : (
      <Alert tone="danger" title="Couldn't load this customer">
        {q.error.message}
      </Alert>
    );
  const c = q.data;
  if (!c) return <Skeleton className="h-96 w-full" />;
  const money = (m: number) => formatMoney(m, c.currency);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/customers" aria-label="Back to customers">
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight">
            {c.name ?? c.email}
            {c.has_account && <Badge>Account</Badge>}
            {c.accepts_marketing && <Badge tone="success">Subscribed</Badge>}
          </h1>
          <p className="mt-1 text-sm text-fg-muted">Customer since {formatDate(c.created_at)}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardBody>
              <dl className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <dt className="text-fg-muted">Orders</dt>
                  <dd className="text-lg font-semibold tabular-nums">{c.orders_count}</dd>
                </div>
                <div>
                  <dt className="text-fg-muted">Amount spent</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {money(c.total_spent_minor)}
                  </dd>
                </div>
                <div>
                  <dt className="text-fg-muted">Last order</dt>
                  <dd className="text-lg font-semibold">
                    {c.last_order_at ? formatDate(c.last_order_at) : "—"}
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Orders" />
            <CardBody>
              {c.orders.length === 0 ? (
                <p className="text-sm text-fg-muted">No orders yet.</p>
              ) : (
                <ul className="divide-y divide-border" aria-label="Orders">
                  {c.orders.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                      <Link href={`/admin/orders/${o.id}`} className="font-medium hover:underline">
                        #{o.number}
                      </Link>
                      <span className="text-fg-muted">{formatDateTime(o.placed_at)}</span>
                      <Badge tone={PAYMENT_TONE[o.payment_status]}>
                        {PAYMENT_LABEL[o.payment_status]}
                      </Badge>
                      <Badge>{FULFILLMENT_LABEL[o.fulfillment_status]}</Badge>
                      <span className="ml-auto tabular-nums">
                        {formatMoney(o.total_minor, o.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Contact" />
            <CardBody className="space-y-1 text-sm">
              <p>
                <a className="text-primary hover:underline" href={`mailto:${c.email}`}>
                  {c.email}
                </a>
              </p>
              {c.phone && <p>{c.phone}</p>}
              <p className="text-fg-muted">
                {c.accepts_marketing ? "Agreed to marketing emails" : "No marketing emails"}
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Addresses" />
            <CardBody className="flex flex-col gap-4">
              {c.addresses.length === 0 ? (
                <p className="text-sm text-fg-muted">No saved addresses.</p>
              ) : (
                c.addresses.map((a) => (
                  <div key={a.id}>
                    {a.is_default && <Badge className="mb-1">Default</Badge>}
                    <AddressText a={a.address} />
                  </div>
                ))
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Notes and tags" description="Only your team sees these." />
            <CardBody>
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  update.mutate(
                    {
                      note: note || null,
                      tags: tags
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    },
                    {
                      onSuccess: () => toast.success("Customer saved"),
                      onError: (err) => toast.error(err.message),
                    },
                  );
                }}
              >
                <fieldset disabled={!canEdit} className="flex flex-col gap-3">
                  <Field label="Note">
                    {({ id }) => (
                      <Textarea
                        id={id}
                        rows={3}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    )}
                  </Field>
                  <Field label="Tags" hint="Separate with commas, e.g. vip, wholesale">
                    {({ id, describedBy }) => (
                      <Input
                        id={id}
                        aria-describedby={describedBy}
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                      />
                    )}
                  </Field>
                  {canEdit && (
                    <div>
                      <Button type="submit" size="sm" loading={update.isPending}>
                        Save
                      </Button>
                    </div>
                  )}
                </fieldset>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
