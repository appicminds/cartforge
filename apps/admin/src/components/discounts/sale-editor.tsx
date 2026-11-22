"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  SaleExistingMode,
  SalePreview,
  SaleRoundingRule,
  SaleSkipReason,
  SaleStatus,
  SaleView,
} from "@cartforge/types";
import {
  formatMoney,
  minorToDecimalString,
  parseMoneyToMinor,
  type SaleInput,
} from "@cartforge/validation";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Select,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
  useToast,
} from "@cartforge/ui";
import { ApiError } from "@/lib/api-client";
import { useSaleAction, useSalePreview } from "@/lib/sales";
import { useStoreSettings } from "@/lib/store";
import { TargetPicker, localInput, scopeOf, toTarget, type Scope } from "./discount-editor";

export const SALE_STATUS: Record<
  SaleStatus,
  { label: string; tone: "success" | "info" | "neutral" | "warning" }
> = {
  running: { label: "Running", tone: "success" },
  scheduled: { label: "Scheduled", tone: "info" },
  ended: { label: "Ended", tone: "neutral" },
  canceled: { label: "Cancelled", tone: "neutral" },
};

export const ROUNDING: Record<SaleRoundingRule, string> = {
  none: "Don't round",
  whole: "Down to a whole amount (63.20 → 63)",
  x9: "Down to an amount ending in 9 (3,196 → 3,189)",
  ten: "Down to a multiple of 10 (3,196 → 3,190)",
  hundred: "Down to a multiple of 100 (3,196 → 3,100)",
};

export const SKIP_LABELS: Record<SaleSkipReason, string> = {
  no_price: "No price set",
  already_discounted: "Already on sale (skipped)",
  not_lower: "Wouldn't be any cheaper",
  below_zero: "Discount is more than the price",
  in_other_sale: "Already in another running sale",
};

const EXISTING: { key: SaleExistingMode; label: string; hint: string }[] = [
  {
    key: "skip",
    label: "Leave them as they are",
    hint: "Recommended. Their current sale price stays; only full-price products change.",
  },
  {
    key: "original",
    label: "Take the sale off their original price",
    hint: "E.g. was Rs 5,000, now Rs 4,000: 20% off Rs 5,000 = Rs 4,000. Only changes when that's cheaper than now.",
  },
  {
    key: "current",
    label: "Take the sale off their current sale price",
    hint: "Discounts stack: Rs 4,000 becomes Rs 3,200, with Rs 5,000 struck through.",
  },
];

/** Run a sale (or edit a scheduled one): choose, review what will change, then start. */
export function SaleEditor({ sale }: { sale: SaleView | null }) {
  const router = useRouter();
  const toast = useToast();
  const store = useStoreSettings();
  const currency = store.data?.currency ?? "PKR";
  const preview = useSalePreview();
  const action = useSaleAction();
  const s = sale;

  const [title, setTitle] = useState(s?.title ?? "");
  const [valueType, setValueType] = useState<"percent" | "fixed">(s?.value_type ?? "percent");
  const [value, setValue] = useState(
    s
      ? s.value_type === "percent"
        ? String(s.value / 100)
        : minorToDecimalString(s.value, currency)
      : "",
  );
  const [scope, setScope] = useState<Scope>(scopeOf(s?.target));
  const [products, setProducts] = useState<string[]>(s?.target.product_ids ?? []);
  const [collections, setCollections] = useState<string[]>(s?.target.collection_ids ?? []);
  const [existing, setExisting] = useState<SaleExistingMode>(s?.existing ?? "skip");
  const [rounding, setRounding] = useState<SaleRoundingRule>(s?.rounding ?? "none");
  const [startLater, setStartLater] = useState(!!s);
  const [startsAt, setStartsAt] = useState(localInput(s?.starts_at));
  const [endOn, setEndOn] = useState(!!s?.ends_at);
  const [endsAt, setEndsAt] = useState(localInput(s?.ends_at));
  const [submitted, setSubmitted] = useState(false);
  const [reviewed, setReviewed] = useState<{ key: string; data: SalePreview } | null>(null);

  // ── Request and local checks ──
  const local: Record<string, string> = {};
  let valueNum = 0;
  if (valueType === "percent") {
    const p = Number(value.replace(",", "."));
    if (!(p > 0 && p < 100)) local.value = "Enter a percentage between 0 and 100";
    valueNum = Math.round(p * 100);
  } else {
    const m = parseMoneyToMinor(value || "x", currency);
    if (m === null || Number.isNaN(m) || m <= 0) local.value = "Enter an amount like 500";
    valueNum = m ?? 0;
  }
  if (!title.trim()) local.title = "Enter a name";
  if (startLater && !startsAt) local.starts_at = "Choose when it starts";
  if (endOn && !endsAt) local.ends_at = "Choose when it ends";
  const body: SaleInput = {
    title: title.trim(),
    value_type: valueType,
    value: valueNum,
    target: toTarget(scope, products, collections),
    existing,
    rounding,
    starts_at: startLater && startsAt ? new Date(startsAt).toISOString() : null,
    ends_at: endOn && endsAt ? new Date(endsAt).toISOString() : null,
  };
  const key = JSON.stringify(body);
  const review = reviewed?.key === key ? reviewed.data : null;
  const err = action.error ?? preview.error;
  const server: Record<string, string> = {};
  if (err instanceof ApiError) for (const f of err.fields) server[f.path] ??= f.message;
  const e = { ...server, ...(submitted ? local : {}) };
  const startsNow = !startLater || !startsAt || new Date(startsAt) <= new Date();

  const doReview = () => {
    setSubmitted(true);
    if (Object.keys(local).length) {
      toast.error("Check the highlighted fields.");
      return;
    }
    action.reset();
    preview.mutate(body, {
      onSuccess: (data) => setReviewed({ key, data }),
      onError: (er) =>
        toast.error(
          er instanceof ApiError && er.fields.length ? "Check the highlighted fields." : er.message,
        ),
    });
  };

  const run = () =>
    action.mutate(s ? { kind: "update", id: s.id, body } : { kind: "create", body }, {
      onSuccess: (saved) => {
        toast.success(startsNow ? "Sale started — prices updated" : "Sale scheduled");
        router.replace(`/admin/discounts/sales/${(saved as { id: string }).id}`);
      },
      onError: (er) => toast.error(er.message),
    });

  const money = (m: number | null) => (m === null ? "—" : formatMoney(m, currency));
  const radio = (name: string, checked: boolean, onChange: () => void, label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="size-4 accent-primary"
      />
      {label}
    </label>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <fieldset disabled={action.isPending} className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader
            title="Sale"
            description="Changes the product prices themselves. The old price shows struck through in your store until the sale ends."
          />
          <CardBody className="flex flex-col gap-4">
            <Field label="Name" required error={e.title} hint="For you, e.g. Eid Sale.">
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={title}
                  onChange={(ev) => setTitle(ev.target.value)}
                />
              )}
            </Field>
            <fieldset className="flex flex-wrap gap-4">
              <legend className="mb-2 text-sm font-medium">Discount</legend>
              {radio(
                "value-type",
                valueType === "percent",
                () => setValueType("percent"),
                "Percentage",
              )}
              {radio(
                "value-type",
                valueType === "fixed",
                () => setValueType("fixed"),
                `Fixed amount (${currency})`,
              )}
            </fieldset>
            <Field
              label={valueType === "percent" ? "Percentage off" : "Amount off each item"}
              required
              error={e.value}
            >
              {({ id, describedBy, invalid }) => (
                <div className="relative max-w-48">
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    inputMode="decimal"
                    value={value}
                    placeholder={valueType === "percent" ? "20" : "500"}
                    className="pr-12"
                    onChange={(ev) => setValue(ev.target.value)}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-fg-muted">
                    {valueType === "percent" ? "%" : currency}
                  </span>
                </div>
              )}
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Products" />
          <CardBody className="flex flex-col gap-6">
            <TargetPicker
              label="Applies to"
              scope={scope}
              setScope={setScope}
              products={products}
              setProducts={setProducts}
              collections={collections}
              setCollections={setCollections}
              allowAll
              error={e.target}
            />
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 text-sm font-medium">
                Products that are already on sale
              </legend>
              <p className="-mt-1 text-xs text-fg-muted">
                Products whose compare-at price is above their price.
                {review ? ` ${review.already_discounted} of the chosen items are.` : ""}
              </p>
              {EXISTING.map((o) => (
                <label key={o.key} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="existing"
                    checked={existing === o.key}
                    onChange={() => setExisting(o.key)}
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span>
                    <span className="block">{o.label}</span>
                    <span className="block text-xs text-fg-muted">{o.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <Field
              label="Rounding"
              hint="Sale prices round down, so the discount is never less than you advertise."
            >
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  className="max-w-md"
                  value={rounding}
                  onChange={(ev) => setRounding(ev.target.value as SaleRoundingRule)}
                >
                  {Object.entries(ROUNDING).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Schedule" />
          <CardBody className="grid gap-6 sm:grid-cols-2">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Starts</legend>
              {radio("start", !startLater, () => setStartLater(false), "Now")}
              {radio("start", startLater, () => setStartLater(true), "On a date")}
              {startLater && (
                <Field label="Start date" error={e.starts_at}>
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      type="datetime-local"
                      aria-describedby={describedBy}
                      invalid={invalid}
                      value={startsAt}
                      onChange={(ev) => setStartsAt(ev.target.value)}
                    />
                  )}
                </Field>
              )}
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Ends</legend>
              {radio("end", !endOn, () => setEndOn(false), "When I end it")}
              {radio("end", endOn, () => setEndOn(true), "On a date")}
              {endOn && (
                <Field
                  label="End date"
                  error={e.ends_at}
                  hint="Prices go back automatically, usually within minutes."
                >
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      type="datetime-local"
                      aria-describedby={describedBy}
                      invalid={invalid}
                      value={endsAt}
                      onChange={(ev) => setEndsAt(ev.target.value)}
                    />
                  )}
                </Field>
              )}
            </fieldset>
          </CardBody>
        </Card>
      </fieldset>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader title="Review" />
          <CardBody className="flex flex-col gap-4 text-sm">
            {!review ? (
              <>
                <p className="text-fg-muted">
                  Nothing changes until you review and confirm. You&apos;ll see how many products
                  change and example prices first.
                </p>
                <Button onClick={doReview} disabled={preview.isPending}>
                  {preview.isPending ? "Checking…" : "Review changes"}
                </Button>
              </>
            ) : (
              <div className="flex flex-col gap-3" data-testid="sale-review">
                <p className="text-base">
                  <strong>{review.changing_products}</strong>{" "}
                  {review.changing_products === 1 ? "product" : "products"} ({review.changing}{" "}
                  {review.changing === 1 ? "variant" : "variants"}) will change price.
                </p>
                {review.skipped.length > 0 && (
                  <ul className="flex flex-col gap-1 text-fg-muted">
                    {review.skipped.map((k) => (
                      <li key={k.reason}>
                        {SKIP_LABELS[k.reason]}: {k.count}
                      </li>
                    ))}
                  </ul>
                )}
                {review.changing === 0 ? (
                  <Alert tone="warning" title="No prices would change">
                    Choose other products, or change how already-discounted products are handled.
                  </Alert>
                ) : (
                  <Button onClick={run} disabled={action.isPending}>
                    {action.isPending
                      ? "Saving…"
                      : startsNow
                        ? `Start sale on ${review.changing_products} ${review.changing_products === 1 ? "product" : "products"}`
                        : "Schedule sale"}
                  </Button>
                )}
                <p className="text-xs text-fg-muted">
                  Old prices are saved. Ending the sale puts them back, except on products you edit
                  by hand during the sale.
                </p>
              </div>
            )}
            {action.error && !(action.error instanceof ApiError && action.error.fields.length) && (
              <Alert tone="danger" title="Couldn't save the sale">
                {action.error.message}
              </Alert>
            )}
          </CardBody>
        </Card>
        {review && review.samples.length > 0 && (
          <Card>
            <CardHeader title="Examples" />
            <Table>
              <caption className="sr-only">Example price changes</caption>
              <THead>
                <Tr>
                  <Th>Product</Th>
                  <Th className="text-right">Now</Th>
                  <Th className="text-right">Sale</Th>
                </Tr>
              </THead>
              <TBody>
                {review.samples.map((r, i) => (
                  <Tr key={i}>
                    <Td className="max-w-40">
                      <span className="block truncate">{r.product_title}</span>
                      {r.variant_title !== "Default" && (
                        <span className="block truncate text-xs text-fg-muted">
                          {r.variant_title}
                        </span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">
                      {money(r.price_minor)}
                      {r.compare_at_minor !== null &&
                        r.price_minor !== null &&
                        r.compare_at_minor > r.price_minor && (
                          <s className="block text-xs text-fg-muted">{money(r.compare_at_minor)}</s>
                        )}
                    </Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">
                      {r.skip ? (
                        <span className="text-xs text-fg-muted">{SKIP_LABELS[r.skip]}</span>
                      ) : (
                        <>
                          <span className="font-medium">{money(r.sale_price_minor)}</span>
                          <s className="block text-xs text-fg-muted">
                            {money(r.sale_compare_minor)}
                          </s>
                        </>
                      )}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Card>
        )}
      </aside>
    </div>
  );
}
