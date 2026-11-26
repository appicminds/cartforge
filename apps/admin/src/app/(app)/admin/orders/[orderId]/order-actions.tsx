"use client";

import { useEffect, useMemo, useState } from "react";
import { CANCEL_REASONS, type CancelReason, type OrderDetail } from "@cartforge/types";
import { formatMoney, minorToDecimalString, parseMoneyToMinor } from "@cartforge/validation";
import { Alert, Button, Dialog, Field, Input, Select, useToast } from "@cartforge/ui";
import { ApiError } from "@/lib/api-client";
import { useOrderAction } from "@/lib/commerce";

const PAID = ["paid", "partially_refunded"];

/** Per line: still to ship, and still refundable. */
export function progress(o: OrderDetail) {
  return o.lines.map((l) => {
    const p = o.line_progress.find((x) => x.order_item_id === l.id);
    const fulfilled = p?.fulfilled ?? 0;
    const refunded = p?.refunded ?? 0;
    return {
      line: l,
      fulfilled,
      refunded,
      toShip: Math.max(0, l.quantity - refunded - fulfilled),
      refundable: Math.max(0, l.quantity - refunded),
    };
  });
}

/** What the order allows right now (the API enforces the same rules). */
export function allowed(o: OrderDetail) {
  const canceled = !!o.canceled_at;
  return {
    markPaid: !canceled && (o.payment_status === "pending" || o.payment_status === "authorized"),
    fulfill: !canceled && progress(o).some((p) => p.toShip > 0),
    cancel: !canceled && o.fulfillments.length === 0,
    refund: PAID.includes(o.payment_status) && o.totals.total_minor - o.refunded_minor > 0,
  };
}

const lineTitle = (l: OrderDetail["lines"][number]) =>
  l.variant_title && l.variant_title !== "Default"
    ? `${l.product_title} — ${l.variant_title}`
    : l.product_title;

const errorText = (e: unknown) => (e instanceof Error ? e.message : null);

// ───────────── Mark paid ─────────────

export function MarkPaidDialog({
  order,
  open,
  onClose,
}: {
  order: OrderDetail;
  open: boolean;
  onClose: () => void;
}) {
  const action = useOrderAction(order.id);
  const toast = useToast();
  const [reference, setReference] = useState("");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Record payment"
      description={`Confirm you received ${formatMoney(order.totals.total_minor, order.currency)}${order.payment ? ` by ${order.payment.label.toLowerCase()}` : ""}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="mark-paid-form" loading={action.isPending}>
            Mark as paid
          </Button>
        </>
      }
    >
      <form
        id="mark-paid-form"
        onSubmit={(e) => {
          e.preventDefault();
          action.mutate(
            { kind: "mark-paid", body: { reference: reference || undefined } },
            {
              onSuccess: () => {
                toast.success("Payment recorded");
                setReference("");
                onClose();
              },
            },
          );
        }}
        className="flex flex-col gap-4"
      >
        {action.isError && <Alert tone="danger" title={errorText(action.error)} />}
        <Field label="Reference" hint="Optional: bank reference, receipt number…">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}

// ───────────── Ship ─────────────

export function FulfillDialog({
  order,
  open,
  onClose,
}: {
  order: OrderDetail;
  open: boolean;
  onClose: () => void;
}) {
  const action = useOrderAction(order.id);
  const toast = useToast();
  const lines = useMemo(() => progress(order).filter((p) => p.toShip > 0), [order]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [company, setCompany] = useState("");
  const [number, setNumber] = useState("");
  const [url, setUrl] = useState("");
  const [notify, setNotify] = useState(true);

  useEffect(() => {
    if (open) {
      setQty(Object.fromEntries(lines.map((p) => [p.line.id, String(p.toShip)])));
      setCompany("");
      setNumber("");
      setUrl("");
      setNotify(!!order.email);
      action.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when opening
  }, [open]);

  const items = lines
    .map((p) => ({
      order_item_id: p.line.id,
      quantity: Number.parseInt(qty[p.line.id] ?? "0", 10) || 0,
    }))
    .filter((i) => i.quantity > 0);
  const total = items.reduce((s, i) => s + i.quantity, 0);
  const urlError =
    action.error instanceof ApiError
      ? action.error.fields.find((f) => f.path === "tracking_url")?.message
      : undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Ship items"
      description="Choose what's in this shipment. Add tracking so the customer can follow it."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="fulfill-form"
            loading={action.isPending}
            disabled={total === 0}
          >
            {total === 1 ? "Ship 1 item" : `Ship ${total} items`}
          </Button>
        </>
      }
    >
      <form
        id="fulfill-form"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          action.mutate(
            {
              kind: "fulfill",
              body: {
                items,
                tracking_company: company || undefined,
                tracking_number: number || undefined,
                tracking_url: url || undefined,
                notify_customer: notify,
              },
            },
            {
              onSuccess: () => {
                toast.success(notify ? "Shipped — customer notified" : "Shipped");
                onClose();
              },
            },
          );
        }}
      >
        {action.isError && !urlError && <Alert tone="danger" title={errorText(action.error)} />}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Items</legend>
          {lines.map((p) => (
            <div key={p.line.id} className="flex items-center gap-3 text-sm">
              <label htmlFor={`ship-${p.line.id}`} className="min-w-0 flex-1 truncate">
                {lineTitle(p.line)}
              </label>
              <Input
                id={`ship-${p.line.id}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={p.toShip}
                className="w-20"
                aria-describedby={`ship-${p.line.id}-of`}
                value={qty[p.line.id] ?? ""}
                onChange={(e) => setQty({ ...qty, [p.line.id]: e.target.value })}
              />
              <span id={`ship-${p.line.id}-of`} className="w-14 text-fg-muted">
                of {p.toShip}
              </span>
            </div>
          ))}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Carrier">
            {({ id }) => (
              <Input
                id={id}
                placeholder="DHL, UPS…"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            )}
          </Field>
          <Field label="Tracking number">
            {({ id }) => (
              <Input id={id} value={number} onChange={(e) => setNumber(e.target.value)} />
            )}
          </Field>
        </div>
        <Field label="Tracking link" error={urlError}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="url"
              placeholder="https://"
              aria-describedby={describedBy}
              invalid={invalid}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          )}
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={notify}
            disabled={!order.email}
            onChange={(e) => setNotify(e.target.checked)}
          />
          Email the customer a shipping confirmation
        </label>
      </form>
    </Dialog>
  );
}

// ───────────── Cancel ─────────────

const REASON_LABEL: Record<CancelReason, string> = {
  customer: "Customer changed their mind",
  inventory: "Items unavailable",
  fraud: "Fraudulent order",
  declined: "Payment declined",
  other: "Other",
};

export function CancelDialog({
  order,
  open,
  canRefund,
  onClose,
}: {
  order: OrderDetail;
  open: boolean;
  canRefund: boolean;
  onClose: () => void;
}) {
  const action = useOrderAction(order.id);
  const toast = useToast();
  const paid = PAID.includes(order.payment_status);
  const [reason, setReason] = useState<CancelReason>("customer");
  const [restock, setRestock] = useState(true);
  const [notify, setNotify] = useState(true);
  useEffect(() => {
    if (open) action.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when opening
  }, [open]);
  const left = order.totals.total_minor - order.refunded_minor;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Cancel order #${order.number}?`}
      description={
        paid
          ? `This order is paid: canceling records a refund of ${formatMoney(left, order.currency)}. Send the money back the same way you received it.`
          : "The order stays in your records, marked as canceled."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep order
          </Button>
          <Button
            variant="destructive"
            type="submit"
            form="cancel-form"
            loading={action.isPending}
            disabled={paid && !canRefund}
          >
            {paid ? "Cancel and refund" : "Cancel order"}
          </Button>
        </>
      }
    >
      <form
        id="cancel-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          action.mutate(
            {
              kind: "cancel",
              body: { reason, restock, refund: paid, notify_customer: notify && !!order.email },
            },
            {
              onSuccess: () => {
                toast.success("Order canceled");
                onClose();
              },
            },
          );
        }}
      >
        {paid && !canRefund && (
          <Alert tone="warning" title="You can't refund orders">
            Ask someone with refund permission to cancel this paid order.
          </Alert>
        )}
        {action.isError && <Alert tone="danger" title={errorText(action.error)} />}
        <Field label="Reason">
          {({ id }) => (
            <Select
              id={id}
              value={reason}
              onChange={(e) => setReason(e.target.value as CancelReason)}
            >
              {CANCEL_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REASON_LABEL[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={restock}
            onChange={(e) => setRestock(e.target.checked)}
          />
          Put the items back in stock
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={notify && !!order.email}
            disabled={!order.email}
            onChange={(e) => setNotify(e.target.checked)}
          />
          Email the customer
        </label>
      </form>
    </Dialog>
  );
}

// ───────────── Refund ─────────────

/** What a line's units cost the customer (after discount; plus tax when added on top). */
function unitRefund(o: OrderDetail, l: OrderDetail["lines"][number]): number {
  const net = l.unit_price_minor * l.quantity - l.discount_minor;
  const tax = o.totals.prices_include_tax ? 0 : l.tax_minor;
  return (net + tax) / l.quantity;
}

export function RefundDialog({
  order,
  open,
  onClose,
}: {
  order: OrderDetail;
  open: boolean;
  onClose: () => void;
}) {
  const action = useOrderAction(order.id);
  const toast = useToast();
  const lines = useMemo(() => progress(order).filter((p) => p.refundable > 0), [order]);
  const left = order.totals.total_minor - order.refunded_minor;
  const [qty, setQty] = useState<Record<string, string>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [shipping, setShipping] = useState(false);
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);

  useEffect(() => {
    if (open) {
      setQty({});
      setRestock(Object.fromEntries(lines.map((p) => [p.line.id, p.fulfilled === 0])));
      setShipping(false);
      setAmount("");
      setAmountTouched(false);
      setReason("");
      setNotify(!!order.email);
      action.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when opening
  }, [open]);

  const items = lines
    .map((p) => ({
      p,
      quantity: Math.min(p.refundable, Number.parseInt(qty[p.line.id] ?? "0", 10) || 0),
    }))
    .filter((x) => x.quantity > 0);
  const suggested = Math.min(
    left,
    Math.round(
      items.reduce((s, x) => s + unitRefund(order, x.p.line) * x.quantity, 0) +
        (shipping ? order.totals.shipping_minor : 0),
    ),
  );
  useEffect(() => {
    if (!amountTouched) setAmount(suggested ? minorToDecimalString(suggested, order.currency) : "");
  }, [suggested, amountTouched, order.currency]);
  const amountMinor = amount.trim() === "" ? 0 : parseMoneyToMinor(amount, order.currency);
  const amountError =
    amountMinor === null
      ? "Enter an amount like 12.50"
      : amountMinor > left
        ? `At most ${formatMoney(left, order.currency)}`
        : action.error instanceof ApiError
          ? action.error.fields.find((f) => f.path === "amount_minor")?.message
          : undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Refund"
      description={`Up to ${formatMoney(left, order.currency)} can still be refunded. Send the money back the same way you received it; this records it.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="refund-form"
            loading={action.isPending}
            disabled={!!amountError || (!amountMinor && items.length === 0)}
          >
            Refund {amountMinor ? formatMoney(amountMinor, order.currency) : ""}
          </Button>
        </>
      }
    >
      <form
        id="refund-form"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (amountError || amountMinor === null) return;
          action.mutate(
            {
              kind: "refund",
              body: {
                items: items.map((x) => ({
                  order_item_id: x.p.line.id,
                  quantity: x.quantity,
                  restock: restock[x.p.line.id] ?? false,
                })),
                amount_minor: amountMinor,
                reason: reason || undefined,
                notify_customer: notify,
              },
            },
            {
              onSuccess: () => {
                toast.success("Refund recorded");
                onClose();
              },
            },
          );
        }}
      >
        {action.isError && !amountError && <Alert tone="danger" title={errorText(action.error)} />}
        {lines.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Items being returned (optional)</legend>
            {lines.map((p) => (
              <div key={p.line.id} className="flex flex-wrap items-center gap-3 text-sm">
                <label htmlFor={`refund-${p.line.id}`} className="min-w-0 flex-1 truncate">
                  {lineTitle(p.line)}
                </label>
                <Input
                  id={`refund-${p.line.id}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={p.refundable}
                  className="w-20"
                  aria-describedby={`refund-${p.line.id}-of`}
                  value={qty[p.line.id] ?? ""}
                  placeholder="0"
                  onChange={(e) => setQty({ ...qty, [p.line.id]: e.target.value })}
                />
                <span id={`refund-${p.line.id}-of`} className="w-14 text-fg-muted">
                  of {p.refundable}
                </span>
                <label className="flex items-center gap-1.5 text-fg-muted">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={restock[p.line.id] ?? false}
                    onChange={(e) => setRestock({ ...restock, [p.line.id]: e.target.checked })}
                  />
                  Restock
                </label>
              </div>
            ))}
          </fieldset>
        )}
        {order.totals.shipping_minor > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={shipping}
              onChange={(e) => setShipping(e.target.checked)}
            />
            Refund shipping ({formatMoney(order.totals.shipping_minor, order.currency)})
          </label>
        )}
        <Field
          label={`Amount (${order.currency})`}
          required
          error={amountError}
          hint={
            !amountTouched && suggested
              ? "Worked out from the items above; you can change it."
              : undefined
          }
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              inputMode="decimal"
              aria-describedby={describedBy}
              invalid={invalid}
              value={amount}
              onChange={(e) => {
                setAmountTouched(true);
                setAmount(e.target.value);
              }}
            />
          )}
        </Field>
        <Field label="Reason" hint="Shown to the customer in the refund email.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={notify && !!order.email}
            disabled={!order.email}
            onChange={(e) => setNotify(e.target.checked)}
          />
          Email the customer
        </label>
      </form>
    </Dialog>
  );
}
