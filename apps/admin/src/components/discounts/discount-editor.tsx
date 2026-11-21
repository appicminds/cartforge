"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { Gift, Percent, ShoppingBag, Truck } from "lucide-react";
import { PERMISSIONS, type DiscountKindKey, type DiscountView } from "@cartforge/types";
import {
  formatMoney,
  minorToDecimalString,
  parseMoneyToMinor,
  type DiscountInput,
} from "@cartforge/validation";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Field,
  Input,
  Select,
  useToast,
} from "@cartforge/ui";
import { ChipPicker } from "@/components/chip-picker";
import { Toggle } from "@/components/toggle";
import { ApiError } from "@/lib/api-client";
import { useCollections } from "@/lib/catalog";
import { useDiscountAction } from "@/lib/discounts";
import { useMarkets } from "@/lib/markets";
import { useProductList } from "@/lib/products";
import { useSession } from "@/lib/session";
import { useStoreSettings } from "@/lib/store";

const KINDS: { key: DiscountKindKey; label: string; hint: string; icon: ReactNode }[] = [
  {
    key: "order",
    label: "Amount off order",
    hint: "e.g. 10% off orders over Rs 5,000",
    icon: <Percent aria-hidden />,
  },
  {
    key: "products",
    label: "Amount off products",
    hint: "e.g. 20% off a collection",
    icon: <ShoppingBag aria-hidden />,
  },
  {
    key: "bxgy",
    label: "Buy X get Y",
    hint: "e.g. buy 2 suits, get a dupatta free",
    icon: <Gift aria-hidden />,
  },
  {
    key: "shipping",
    label: "Free shipping",
    hint: "e.g. free delivery over Rs 3,000",
    icon: <Truck aria-hidden />,
  },
];

type Scope = "all" | "collections" | "products";
type Target = { all: boolean; product_ids: string[]; collection_ids: string[] };
const scopeOf = (t: Target | undefined): Scope =>
  !t || t.all ? "all" : t.collection_ids.length ? "collections" : "products";
const toTarget = (scope: Scope, products: string[], collections: string[]): Target => ({
  all: scope === "all",
  product_ids: scope === "products" ? products : [],
  collection_ids: scope === "collections" ? collections : [],
});

/** Local date-time input value (yyyy-mm-ddThh:mm). */
const localInput = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function TargetPicker({
  label,
  scope,
  setScope,
  products,
  setProducts,
  collections,
  setCollections,
  allowAll,
  error,
}: {
  label: string;
  scope: Scope;
  setScope: (s: Scope) => void;
  products: string[];
  setProducts: (v: string[]) => void;
  collections: string[];
  setCollections: (v: string[]) => void;
  allowAll: boolean;
  error?: string;
}) {
  const productList = useProductList({ page: 1, page_size: 100, sort: "title", order: "asc" });
  const collectionList = useCollections({ page_size: 100 });
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-4 text-sm">
        {(
          [
            ...(allowAll ? [["all", "All products"]] : []),
            ["collections", "Specific collections"],
            ["products", "Specific products"],
          ] as [Scope, string][]
        ).map(([v, l]) => (
          <label key={v} className="flex items-center gap-2">
            <input
              type="radio"
              name={`${label}-scope`}
              checked={scope === v}
              onChange={() => setScope(v)}
              className="size-4 accent-primary"
            />
            {l}
          </label>
        ))}
      </div>
      {scope === "collections" && (
        <ChipPicker
          label="Collections"
          emptyText="No collections chosen"
          addLabel={collections.length ? "Edit" : "Choose"}
          options={(collectionList.data?.data ?? []).map((c) => ({ id: c.id, label: c.title }))}
          value={collections}
          onChange={setCollections}
        />
      )}
      {scope === "products" && (
        <ChipPicker
          label="Products"
          emptyText="No products chosen"
          addLabel={products.length ? "Edit" : "Choose"}
          options={(productList.data?.data ?? []).map((p) => ({ id: p.id, label: p.title }))}
          value={products}
          onChange={setProducts}
        />
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </fieldset>
  );
}

/** Create or edit a discount (Next 8), laid out like Shopify's discount editor. */
export function DiscountEditor({ discount }: { discount: DiscountView | null }) {
  const router = useRouter();
  const toast = useToast();
  const { can } = useSession();
  const canEdit = can(PERMISSIONS.STORE_SETTINGS_WRITE);
  const store = useStoreSettings();
  const currency = store.data?.currency ?? "PKR";
  const markets = useMarkets();
  const action = useDiscountAction();
  const d = discount;

  const [kind, setKind] = useState<DiscountKindKey>(d?.kind ?? "order");
  const [method, setMethod] = useState<"code" | "automatic">(d?.method ?? "code");
  const [code, setCode] = useState(d?.code ?? "");
  const [title, setTitle] = useState(d?.title ?? "");
  const [valueType, setValueType] = useState<"percent" | "fixed">(d?.value_type ?? "percent");
  const [value, setValue] = useState(
    d
      ? d.value_type === "percent"
        ? String(d.value / 100)
        : minorToDecimalString(d.value, currency)
      : "",
  );
  const [scope, setScope] = useState<Scope>(scopeOf(d?.target));
  const [products, setProducts] = useState<string[]>(d?.target.product_ids ?? []);
  const [collections, setCollections] = useState<string[]>(d?.target.collection_ids ?? []);
  const [buyQty, setBuyQty] = useState(String(d?.buy?.quantity ?? 2));
  const [buyScope, setBuyScope] = useState<Scope>(
    scopeOf(d?.buy?.target) === "all" ? "products" : scopeOf(d?.buy?.target),
  );
  const [buyProducts, setBuyProducts] = useState<string[]>(d?.buy?.target.product_ids ?? []);
  const [buyCollections, setBuyCollections] = useState<string[]>(
    d?.buy?.target.collection_ids ?? [],
  );
  const [getQty, setGetQty] = useState(String(d?.buy?.get_quantity ?? 1));
  const [getFree, setGetFree] = useState(!d || d.kind !== "bxgy" || d.value >= 10_000);
  const [maxUses, setMaxUses] = useState(d?.buy?.max_uses != null ? String(d.buy.max_uses) : "");
  const [minType, setMinType] = useState<"none" | "amount" | "quantity">(
    d?.min_subtotal_minor != null ? "amount" : d?.min_quantity != null ? "quantity" : "none",
  );
  const [minAmount, setMinAmount] = useState(
    d?.min_subtotal_minor != null ? minorToDecimalString(d.min_subtotal_minor, currency) : "",
  );
  const [minQty, setMinQty] = useState(d?.min_quantity != null ? String(d.min_quantity) : "");
  const [limitOn, setLimitOn] = useState(d?.usage_limit != null);
  const [limit, setLimit] = useState(d?.usage_limit != null ? String(d.usage_limit) : "");
  const [once, setOnce] = useState(d?.once_per_customer ?? false);
  const [combines, setCombines] = useState(d?.combines ?? false);
  const [allMarkets, setAllMarkets] = useState(!d || d.market_ids.length === 0);
  const [marketIds, setMarketIds] = useState<string[]>(d?.market_ids ?? []);
  const [startsAt, setStartsAt] = useState(localInput(d?.starts_at ?? new Date().toISOString()));
  const [endOn, setEndOn] = useState(!!d?.ends_at);
  const [endsAt, setEndsAt] = useState(localInput(d?.ends_at));
  const [enabled, setEnabled] = useState(d?.enabled ?? true);
  const [removing, setRemoving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // ── Build the request and local checks ──
  const local: Record<string, string> = {};
  const int = (v: string, key: string, min = 1) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min) local[key] = `Enter a whole number of ${min} or more`;
    return n;
  };
  let valueNum = 0;
  if (kind !== "shipping") {
    if (kind === "bxgy" && getFree) valueNum = 10_000;
    else if (valueType === "percent" || kind === "bxgy") {
      const p = Number(value.replace(",", "."));
      if (!(p > 0 && p <= 100)) local.value = "Enter a percentage between 0 and 100";
      valueNum = Math.round(p * 100);
    } else {
      const m = parseMoneyToMinor(value || "x", currency);
      if (m === null || Number.isNaN(m) || m <= 0) local.value = "Enter an amount like 500";
      valueNum = m ?? 0;
    }
  }
  const minSubtotal = minType === "amount" ? parseMoneyToMinor(minAmount || "x", currency) : null;
  if (minType === "amount" && (minSubtotal === null || Number.isNaN(minSubtotal)))
    local.min_subtotal_minor = "Enter an amount";
  const minQuantity = minType === "quantity" ? int(minQty, "min_quantity") : null;
  const usageLimit = limitOn ? int(limit, "usage_limit") : null;
  const body: DiscountInput = {
    title: title || (method === "code" ? code.toUpperCase() : ""),
    method,
    code: method === "code" ? code : null,
    kind,
    value_type: kind === "bxgy" ? "percent" : valueType,
    value: valueNum,
    target: toTarget(
      kind === "order" || kind === "shipping" ? "all" : scope,
      products,
      collections,
    ),
    buy:
      kind === "bxgy"
        ? {
            quantity: int(buyQty, "buy_quantity"),
            target: toTarget(buyScope, buyProducts, buyCollections),
            get_quantity: int(getQty, "get_quantity"),
            max_uses: maxUses.trim() ? int(maxUses, "max_uses") : null,
          }
        : null,
    min_subtotal_minor:
      minType === "amount" && minSubtotal !== null && !Number.isNaN(minSubtotal)
        ? minSubtotal
        : null,
    min_quantity: minQuantity,
    starts_at: startsAt ? new Date(startsAt).toISOString() : undefined,
    ends_at: endOn && endsAt ? new Date(endsAt).toISOString() : null,
    usage_limit: usageLimit,
    once_per_customer: once,
    combines,
    market_ids: allMarkets ? [] : marketIds,
    enabled,
  };
  const server: Record<string, string> = {};
  if (action.error instanceof ApiError)
    for (const f of action.error.fields) server[f.path] ??= f.message;
  const e = { ...server, ...(submitted ? local : {}) };

  const otherMarkets = (markets.data?.markets ?? []).filter((m) => !m.is_primary);
  const summary = useMemo(() => {
    const v =
      kind === "shipping"
        ? ""
        : kind === "bxgy"
          ? getFree
            ? "free"
            : `${value || "?"}% off`
          : valueType === "percent"
            ? `${value || "?"}%`
            : value
              ? formatMoney(parseMoneyToMinor(value, currency) ?? 0, currency)
              : "?";
    const main =
      kind === "order"
        ? `${v} off the order`
        : kind === "products"
          ? `${v} off ${scope === "all" ? "all products" : `selected ${scope}`}`
          : kind === "bxgy"
            ? `Buy ${buyQty || "?"}, get ${getQty || "?"} ${v}`
            : "Free shipping";
    const min =
      minType === "amount" && minAmount
        ? `Minimum purchase ${formatMoney(parseMoneyToMinor(minAmount, currency) ?? 0, currency)}`
        : minType === "quantity" && minQty
          ? `Minimum ${minQty} items`
          : "No minimum";
    return [
      main,
      min,
      limitOn && limit ? `Limit ${limit} uses` : null,
      once ? "Once per customer" : null,
      combines ? "Combines with other discounts" : "Doesn't combine",
    ].filter(Boolean) as string[];
  }, [
    kind,
    getFree,
    value,
    valueType,
    currency,
    scope,
    buyQty,
    getQty,
    minType,
    minAmount,
    minQty,
    limitOn,
    limit,
    once,
    combines,
  ]);

  const save = () => {
    setSubmitted(true);
    if (Object.keys(local).length) {
      toast.error("Check the highlighted fields.");
      return;
    }
    action.mutate(
      { kind: "save", id: d?.id, body },
      {
        onSuccess: (saved) => {
          toast.success(d ? "Discount saved" : "Discount created");
          if (!d && saved && typeof saved === "object" && "id" in saved)
            router.replace(`/admin/discounts/${(saved as DiscountView).id}`);
        },
        onError: (err) =>
          toast.error(
            err instanceof ApiError && err.fields.length
              ? "Check the highlighted fields."
              : err.message,
          ),
      },
    );
  };

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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <fieldset disabled={!canEdit || action.isPending} className="flex min-w-0 flex-col gap-6">
        {!d && (
          <Card>
            <CardHeader title="Type" />
            <CardBody>
              <div
                role="radiogroup"
                aria-label="Discount type"
                className="grid gap-3 sm:grid-cols-2"
              >
                {KINDS.map((k) => (
                  <button
                    key={k.key}
                    type="button"
                    role="radio"
                    aria-checked={kind === k.key}
                    onClick={() => setKind(k.key)}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left text-sm ${kind === k.key ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-surface-sunken"}`}
                  >
                    <span className="mt-0.5 text-fg-muted [&>svg]:size-5">{k.icon}</span>
                    <span>
                      <span className="block font-medium">{k.label}</span>
                      <span className="block text-fg-muted">{k.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title={KINDS.find((k) => k.key === kind)!.label} />
          <CardBody className="flex flex-col gap-4">
            <fieldset className="flex flex-wrap gap-4">
              <legend className="mb-2 text-sm font-medium">Method</legend>
              {radio("method", method === "code", () => setMethod("code"), "Discount code")}
              {radio(
                "method",
                method === "automatic",
                () => setMethod("automatic"),
                "Automatic discount",
              )}
            </fieldset>
            {method === "code" ? (
              <Field
                label="Discount code"
                required
                error={e.code}
                hint="Customers enter this at checkout."
              >
                {({ id, describedBy, invalid }) => (
                  <div className="flex gap-2">
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      invalid={invalid}
                      value={code}
                      placeholder="EID20"
                      className="uppercase"
                      onChange={(ev) => setCode(ev.target.value.toUpperCase().replace(/\s/g, ""))}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        setCode(
                          Array.from(
                            crypto.getRandomValues(new Uint8Array(8)),
                            (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32],
                          ).join(""),
                        )
                      }
                    >
                      Generate
                    </Button>
                  </div>
                )}
              </Field>
            ) : null}
            <Field
              label="Title"
              required={method === "automatic"}
              error={e.title}
              hint={
                method === "code"
                  ? "Optional. Shown to customers; defaults to the code."
                  : "Shown to customers at checkout, e.g. Eid Sale."
              }
            >
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
          </CardBody>
        </Card>

        {kind !== "shipping" && kind !== "bxgy" && (
          <Card>
            <CardHeader title="Value" />
            <CardBody className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
                <Field label="Discount as">
                  {({ id }) => (
                    <Select
                      id={id}
                      value={valueType}
                      onChange={(ev) => setValueType(ev.target.value as "percent" | "fixed")}
                    >
                      <option value="percent">Percentage</option>
                      <option value="fixed">Fixed amount ({currency})</option>
                    </Select>
                  )}
                </Field>
                <Field
                  label={valueType === "percent" ? "Percentage off" : `Amount off (${currency})`}
                  required
                  error={e.value}
                  hint={
                    kind === "products" && valueType === "fixed"
                      ? "Taken off each item."
                      : undefined
                  }
                >
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      inputMode="decimal"
                      aria-describedby={describedBy}
                      invalid={invalid}
                      value={value}
                      placeholder={valueType === "percent" ? "10" : "500"}
                      onChange={(ev) => setValue(ev.target.value)}
                    />
                  )}
                </Field>
              </div>
              {kind === "products" && (
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
              )}
            </CardBody>
          </Card>
        )}

        {kind === "bxgy" && (
          <>
            <Card>
              <CardHeader title="Customer buys" />
              <CardBody className="flex flex-col gap-4">
                <Field label="Quantity" required error={e.buy_quantity}>
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      inputMode="numeric"
                      className="w-28"
                      aria-describedby={describedBy}
                      invalid={invalid}
                      value={buyQty}
                      onChange={(ev) => setBuyQty(ev.target.value)}
                    />
                  )}
                </Field>
                <TargetPicker
                  label="Any items from"
                  scope={buyScope}
                  setScope={setBuyScope}
                  products={buyProducts}
                  setProducts={setBuyProducts}
                  collections={buyCollections}
                  setCollections={setBuyCollections}
                  allowAll
                  error={e.buy}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Customer gets" />
              <CardBody className="flex flex-col gap-4">
                <Field label="Quantity" required error={e.get_quantity}>
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      inputMode="numeric"
                      className="w-28"
                      aria-describedby={describedBy}
                      invalid={invalid}
                      value={getQty}
                      onChange={(ev) => setGetQty(ev.target.value)}
                    />
                  )}
                </Field>
                <TargetPicker
                  label="Any items from"
                  scope={scope}
                  setScope={setScope}
                  products={products}
                  setProducts={setProducts}
                  collections={collections}
                  setCollections={setCollections}
                  allowAll
                  error={e.target}
                />
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-sm font-medium">At a discounted value</legend>
                  {radio("get", getFree, () => setGetFree(true), "Free")}
                  {radio("get", !getFree, () => setGetFree(false), "Percentage off")}
                  {!getFree && (
                    <Field label="Percentage off" required error={e.value}>
                      {({ id, describedBy, invalid }) => (
                        <Input
                          id={id}
                          inputMode="decimal"
                          className="w-28"
                          aria-describedby={describedBy}
                          invalid={invalid}
                          value={value}
                          onChange={(ev) => setValue(ev.target.value)}
                        />
                      )}
                    </Field>
                  )}
                </fieldset>
                <Field
                  label="Maximum uses per order"
                  error={e.max_uses}
                  hint="Leave empty for no limit."
                >
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      inputMode="numeric"
                      className="w-28"
                      aria-describedby={describedBy}
                      invalid={invalid}
                      value={maxUses}
                      onChange={(ev) => setMaxUses(ev.target.value)}
                    />
                  )}
                </Field>
              </CardBody>
            </Card>
          </>
        )}

        {kind !== "bxgy" && (
          <Card>
            <CardHeader title="Minimum purchase requirements" />
            <CardBody className="flex flex-col gap-3">
              {radio(
                "min",
                minType === "none",
                () => setMinType("none"),
                "No minimum requirements",
              )}
              {radio(
                "min",
                minType === "amount",
                () => setMinType("amount"),
                `Minimum purchase amount (${currency})`,
              )}
              {minType === "amount" && (
                <Field label="Minimum purchase amount" error={e.min_subtotal_minor}>
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      inputMode="decimal"
                      className="w-40"
                      aria-describedby={describedBy}
                      invalid={invalid}
                      value={minAmount}
                      onChange={(ev) => setMinAmount(ev.target.value)}
                    />
                  )}
                </Field>
              )}
              {radio(
                "min",
                minType === "quantity",
                () => setMinType("quantity"),
                "Minimum quantity of items",
              )}
              {minType === "quantity" && (
                <Field label="Minimum quantity" error={e.min_quantity}>
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      inputMode="numeric"
                      className="w-28"
                      aria-describedby={describedBy}
                      invalid={invalid}
                      value={minQty}
                      onChange={(ev) => setMinQty(ev.target.value)}
                    />
                  )}
                </Field>
              )}
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="Usage and combinations" />
          <CardBody className="flex flex-col gap-3">
            <Toggle
              label="Limit the number of times this discount can be used in total"
              checked={limitOn}
              onChange={setLimitOn}
            />
            {limitOn && (
              <Field label="Total uses" error={e.usage_limit}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    inputMode="numeric"
                    className="w-28"
                    aria-describedby={describedBy}
                    invalid={invalid}
                    value={limit}
                    onChange={(ev) => setLimit(ev.target.value)}
                  />
                )}
              </Field>
            )}
            <Toggle
              label="Limit to one use per customer"
              description="Checked by email address."
              checked={once}
              onChange={setOnce}
            />
            <Toggle
              label="Combines with other discounts"
              description="Applies together with other combinable discounts (one of each kind). Otherwise the best single discount wins."
              checked={combines}
              onChange={setCombines}
            />
          </CardBody>
        </Card>

        {otherMarkets.length > 0 && (
          <Card>
            <CardHeader title="Markets" />
            <CardBody className="flex flex-col gap-3">
              {radio("markets", allMarkets, () => setAllMarkets(true), "All markets")}
              {radio("markets", !allMarkets, () => setAllMarkets(false), "Specific markets")}
              {!allMarkets &&
                (markets.data?.markets ?? []).map((m) => (
                  <label key={m.id} className="ml-6 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={marketIds.includes(m.id)}
                      onChange={(ev) =>
                        setMarketIds(
                          ev.target.checked
                            ? [...marketIds, m.id]
                            : marketIds.filter((x) => x !== m.id),
                        )
                      }
                    />
                    {m.name} ({m.currency})
                  </label>
                ))}
              <p className="text-xs text-fg-muted">
                Fixed amounts are converted to each market&apos;s currency.
              </p>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="Active dates" />
          <CardBody className="flex flex-col gap-3">
            <Field label="Start" error={e.starts_at}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="datetime-local"
                  className="w-60"
                  aria-describedby={describedBy}
                  value={startsAt}
                  onChange={(ev) => setStartsAt(ev.target.value)}
                />
              )}
            </Field>
            <Toggle label="Set an end date" checked={endOn} onChange={setEndOn} />
            {endOn && (
              <Field label="End" error={e.ends_at}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    type="datetime-local"
                    className="w-60"
                    aria-describedby={describedBy}
                    invalid={invalid}
                    value={endsAt}
                    onChange={(ev) => setEndsAt(ev.target.value)}
                  />
                )}
              </Field>
            )}
          </CardBody>
        </Card>
      </fieldset>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader title="Summary" />
          <CardBody className="flex flex-col gap-3 text-sm">
            <p className="font-semibold">
              {method === "code" ? code || "No code yet" : title || "Automatic discount"}
            </p>
            <ul className="list-disc space-y-1 pl-5" data-testid="discount-summary">
              {summary.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            {d && (
              <p className="text-fg-muted">
                Used {d.used_count} {d.used_count === 1 ? "time" : "times"}
              </p>
            )}
            <Toggle
              label="Active"
              description="Turn off to stop the discount without deleting it."
              checked={enabled}
              onChange={setEnabled}
            />
          </CardBody>
        </Card>
        {action.isError && !Object.keys(server).length && (
          <Alert tone="danger" title={action.error.message} />
        )}
        {canEdit && (
          <div className="flex gap-2">
            <Button className="flex-1" loading={action.isPending} onClick={save}>
              {d ? "Save" : "Create discount"}
            </Button>
            {d && (
              <Button variant="secondary" onClick={() => setRemoving(true)}>
                Delete
              </Button>
            )}
          </div>
        )}
      </aside>
      <ConfirmDialog
        open={removing}
        title="Delete this discount?"
        description="Customers can't use it any more. Orders that used it keep their record."
        confirmLabel="Delete"
        destructive
        pending={action.isPending}
        onClose={() => setRemoving(false)}
        onConfirm={() =>
          d &&
          action.mutate(
            { kind: "remove", id: d.id },
            {
              onSuccess: () => {
                toast.success("Discount deleted");
                router.replace("/admin/discounts");
              },
              onError: (err) => toast.error(err.message),
            },
          )
        }
      />
    </div>
  );
}
