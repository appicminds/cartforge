"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronsUpDown, Plus, X } from "lucide-react";
import type { ShippingMethodView } from "@cartforge/types";
import {
  COUNTRY_CODES,
  currencyExponent,
  describeEstimate,
  formatMoney,
  minorToDecimalString,
  parseMoneyToMinor,
} from "@cartforge/validation";
import { Alert, Button, Dialog, Field, Input, useToast } from "@cartforge/ui";
import { ApiError } from "@/lib/api-client";
import { useSaveShippingMethod } from "@/lib/commerce";

/** Transit presets shown to customers as "3 to 5 business days". */
const TRANSIT: { key: string; label: string; days: [number | null, number | null] }[] = [
  { key: "none", label: "No estimate", days: [null, null] },
  { key: "0-0", label: "Same day", days: [0, 0] },
  { key: "1-2", label: "1 to 2 business days", days: [1, 2] },
  { key: "2-3", label: "2 to 3 business days", days: [2, 3] },
  { key: "3-5", label: "3 to 5 business days", days: [3, 5] },
  { key: "5-7", label: "5 to 7 business days", days: [5, 7] },
  { key: "7-10", label: "7 to 10 business days", days: [7, 10] },
];
const transitKey = (lo: number | null, hi: number | null) =>
  TRANSIT.find((t) => t.days[0] === lo && t.days[1] === hi)?.key ?? "custom";

/** A rounded "pill" around a native select: "Type  Flat ⇅". */
function PillSelect({
  label,
  value,
  onChange,
  children,
  dot,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  dot?: "on" | "off";
}) {
  return (
    <div className="relative inline-flex h-9 items-center gap-2 rounded-full bg-surface-sunken pl-3 pr-8 text-sm focus-within:outline-2 focus-within:outline-focus/40">
      {dot && (
        <span
          aria-hidden
          className={`size-2.5 rounded-full ${dot === "on" ? "bg-success ring-2 ring-success/30" : "bg-fg-subtle"}`}
        />
      )}
      {!dot && (
        <span aria-hidden className="text-fg-muted">
          {label}
        </span>
      )}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-48 appearance-none truncate bg-transparent font-medium text-fg outline-none [field-sizing:content]"
      >
        {children}
      </select>
      <ChevronsUpDown
        aria-hidden
        className="pointer-events-none absolute right-3 size-3.5 text-fg-subtle"
      />
    </div>
  );
}

/** Money input with the currency symbol in front and the code behind: "Rs 0 PKR". */
function MoneyInput({
  id,
  currency,
  value,
  onChange,
  describedBy,
  invalid,
  disabled,
}: {
  id: string;
  currency: string;
  value: string;
  onChange: (v: string) => void;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const symbol = useMemo(
    () =>
      new Intl.NumberFormat(currency === "PKR" ? "en-PK" : "en", {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
      })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? currency,
    [currency],
  );
  const placeholder = currencyExponent(currency) === 0 ? "0" : "0.00";
  return (
    <div
      className={`flex h-10 items-center gap-2 rounded-lg border bg-surface px-3 text-sm focus-within:border-focus focus-within:outline-2 focus-within:outline-focus/30 ${invalid ? "border-danger" : "border-border-strong"} ${disabled ? "bg-surface-sunken" : ""}`}
    >
      <span aria-hidden className="text-fg-muted">
        {symbol}
      </span>
      <input
        id={id}
        inputMode="decimal"
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-subtle"
      />
      <span aria-hidden className="text-fg-muted">
        {currency}
      </span>
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${checked ? "bg-primary" : "bg-border-strong"}`}
    >
      <span
        aria-hidden
        className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] ${checked ? "left-[1.375rem]" : "left-0.5"}`}
      />
    </button>
  );
}

const list = (v: string) =>
  v
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * Add or edit a shipping option (Settings → Checkout → Shipping): name, status
 * and type, a live preview of what customers see, the rate with transit time,
 * free shipping over an amount, and optional limits by place or order value.
 */
export function ShippingEditor({
  open,
  method,
  currency,
  onClose,
}: {
  open: boolean;
  method: ShippingMethodView | null;
  currency: string;
  onClose: () => void;
}) {
  const save = useSaveShippingMethod();
  const toast = useToast();
  const regionNames = useMemo(() => new Intl.DisplayNames(["en"], { type: "region" }), []);
  const dec = (v: number | null | undefined) =>
    v == null ? "" : minorToDecimalString(v, currency);

  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [type, setType] = useState<"flat" | "per_item">("flat");
  const [showDetails, setShowDetails] = useState(false);
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [transit, setTransit] = useState("3-5");
  const [minDays, setMinDays] = useState("");
  const [maxDays, setMaxDays] = useState("");
  const [freeOn, setFreeOn] = useState(false);
  const [freeOver, setFreeOver] = useState("");
  const [shipsTo, setShipsTo] = useState("everywhere");
  const [countries, setCountries] = useState("");
  const [showLimits, setShowLimits] = useState(false);
  const [regions, setRegions] = useState("");
  const [cities, setCities] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [maxOrder, setMaxOrder] = useState("");
  const [extraPerItem, setExtraPerItem] = useState("");

  useEffect(() => {
    if (!open) return;
    const m = method;
    setName(m?.name ?? "");
    setActive(m?.active ?? true);
    const perItem = !!m && m.per_item_minor > 0 && m.per_item_minor === m.price_minor;
    setType(perItem ? "per_item" : "flat");
    setDescription(m?.description ?? "");
    setShowDetails(!!m?.description);
    setPrice(m ? dec(m.price_minor) : "");
    const t = m ? transitKey(m.min_days, m.max_days) : "3-5";
    setTransit(t);
    setMinDays(m?.min_days != null ? String(m.min_days) : "");
    setMaxDays(m?.max_days != null ? String(m.max_days) : "");
    setFreeOn(m?.free_over_minor != null);
    setFreeOver(m?.free_over_minor ? dec(m.free_over_minor) : "");
    const cs = m?.countries ?? (currency === "PKR" ? ["PK"] : []);
    setShipsTo(cs.length === 0 ? "everywhere" : cs.length === 1 ? cs[0]! : "several");
    setCountries(cs.join(", "));
    setRegions(m?.regions.join(", ") ?? "");
    setCities(m?.cities.join(", ") ?? "");
    setMinOrder(dec(m?.min_order_minor));
    setMaxOrder(dec(m?.max_order_minor));
    setExtraPerItem(!perItem && m?.per_item_minor ? dec(m.per_item_minor) : "");
    // Limits are folded away unless this option already uses them.
    setShowLimits(
      !!m &&
        (m.regions.length > 0 ||
          m.cities.length > 0 ||
          m.min_order_minor !== null ||
          m.max_order_minor !== null ||
          (!perItem && m.per_item_minor > 0)),
    );
    save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset each time it opens
  }, [open, method, currency]);

  // ── Derived values and local checks ──
  const local: Record<string, string> = {};
  const money = (v: string, key: string, required = false) => {
    if (!v.trim()) {
      if (required) local[key] = "Enter an amount (0 for free)";
      return null;
    }
    const m = parseMoneyToMinor(v, currency);
    if (m === null || Number.isNaN(m)) local[key] = "Enter an amount like 250";
    return m;
  };
  const priceMinor = money(price, "price_minor", true);
  const freeMinor = freeOn ? (money(freeOver, "free_over_minor") ?? 0) : null;
  const minOrderMinor = money(minOrder, "min_order_minor");
  const maxOrderMinor = money(maxOrder, "max_order_minor");
  const extraMinor = type === "flat" ? (money(extraPerItem, "per_item_minor") ?? 0) : 0;
  const preset = TRANSIT.find((t) => t.key === transit);
  const dayNum = (v: string, key: string) => {
    if (!v.trim()) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 365) local[key] = "Whole days, 0–365";
    return n;
  };
  const [lo, hi] = preset
    ? preset.days
    : [dayNum(minDays, "min_days"), dayNum(maxDays, "max_days")];
  if (lo !== null && hi !== null && lo > hi) local.max_days = "Must be at least the first number";
  const codes =
    shipsTo === "everywhere"
      ? []
      : shipsTo === "several"
        ? list(countries).map((c) => c.toUpperCase())
        : [shipsTo];
  if (codes.some((c) => !/^[A-Z]{2}$/.test(c)))
    local.countries = "Use two-letter country codes like PK, AE";
  const regionList = list(regions);
  const cityList = list(cities);
  if ((regionList.length || cityList.length) && codes.length !== 1)
    local[regionList.length ? "regions" : "cities"] = "Choose one country under Ships to first";

  const server: Record<string, string> = {};
  if (save.error instanceof ApiError)
    for (const f of save.error.fields) server[f.path] ??= f.message;
  const e = { ...server, ...local };
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => setSubmitted(false), [open]);
  const shown = (k: string) => (submitted || server[k] ? e[k] : undefined);

  const free = priceMinor === 0 || (freeOn && !freeOver.trim());
  const estimate = describeEstimate(
    lo === null && hi === null ? null : { min_days: lo, max_days: hi },
  );
  const previewPrice = free
    ? "FREE"
    : priceMinor !== null && !Number.isNaN(priceMinor)
      ? `${formatMoney(priceMinor, currency)}${type === "per_item" ? " per item" : ""}`
      : "—";

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setSubmitted(true);
    if (Object.keys(local).length || priceMinor === null) return;
    save.mutate(
      {
        id: method?.id,
        body: {
          name,
          description: showDetails ? description || undefined : undefined,
          price_minor: priceMinor,
          per_item_minor: type === "per_item" ? priceMinor : extraMinor,
          free_over_minor: freeMinor,
          countries: codes,
          regions: showLimits ? regionList : [],
          cities: showLimits ? cityList : [],
          min_order_minor: showLimits ? minOrderMinor : null,
          max_order_minor: showLimits ? maxOrderMinor : null,
          min_days: lo,
          max_days: hi,
          active,
        },
      },
      {
        onSuccess: () => {
          toast.success(method ? "Shipping option saved" : "Shipping option added");
          onClose();
        },
      },
    );
  };

  const countryOptions = useMemo(
    () =>
      [...COUNTRY_CODES]
        .map((c) => ({ code: c, name: regionNames.of(c) ?? c }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [regionNames],
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={method ? "Edit shipping option" : "Add shipping option"}
      className="max-h-[92vh] w-[min(46rem,calc(100vw-2rem))] overflow-y-auto"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="shipping-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="shipping-form" noValidate onSubmit={submit} className="flex flex-col gap-6">
        {save.isError && !Object.keys(server).length && (
          <Alert tone="danger" title={save.error.message} />
        )}

        <Field label="Option name" required error={shown("name")}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              value={name}
              placeholder="Standard"
              onChange={(ev) => setName(ev.target.value)}
            />
          )}
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <PillSelect
            label="Status"
            dot={active ? "on" : "off"}
            value={active ? "active" : "inactive"}
            onChange={(v) => setActive(v === "active")}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </PillSelect>
          <PillSelect label="Type" value={type} onChange={(v) => setType(v as "flat" | "per_item")}>
            <option value="flat">Flat</option>
            <option value="per_item">Per item</option>
          </PillSelect>
          <PillSelect label="Ships to" value={shipsTo} onChange={setShipsTo}>
            <option value="everywhere">Everywhere</option>
            <option value="several">Several countries…</option>
            {countryOptions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </PillSelect>
          {!showDetails && (
            <button
              type="button"
              onClick={() => setShowDetails(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-dashed border-border-strong px-3 text-sm text-fg-muted hover:text-fg"
            >
              <Plus aria-hidden className="size-4" /> Delivery details
            </button>
          )}
        </div>

        {shipsTo === "several" && (
          <Field
            label="Countries"
            error={shown("countries")}
            hint="Two-letter codes, comma-separated, e.g. PK, AE."
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                value={countries}
                onChange={(ev) => setCountries(ev.target.value)}
              />
            )}
          </Field>
        )}
        {showDetails && (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Field
                label="Delivery details"
                error={shown("description")}
                hint="Shown under the option at checkout, e.g. Tracked courier, cash on delivery available."
              >
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    value={description}
                    maxLength={200}
                    onChange={(ev) => setDescription(ev.target.value)}
                  />
                )}
              </Field>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mb-6"
              aria-label="Remove delivery details"
              onClick={() => {
                setShowDetails(false);
                setDescription("");
              }}
            >
              <X aria-hidden />
            </Button>
          </div>
        )}

        {/* What customers will see at checkout. */}
        <figure className="flex justify-center rounded-xl bg-surface-sunken px-4 py-10">
          <figcaption className="sr-only">Preview at checkout</figcaption>
          <div
            data-testid="shipping-preview"
            className="flex w-full max-w-sm items-start gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm"
          >
            <span
              aria-hidden
              className="mt-0.5 grid size-5 place-items-center rounded-full bg-primary"
            >
              <span className="size-2 rounded-full bg-white" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{name || "Shipping option"}</span>
              {estimate && <span className="block text-sm text-fg-muted">{estimate}</span>}
              {showDetails && description && (
                <span className="block text-sm text-fg-muted">{description}</span>
              )}
            </span>
            <span className="text-right">
              <span className="block font-semibold">{previewPrice}</span>
              {freeOn && !free && freeMinor !== null && freeMinor > 0 && (
                <span className="block text-xs text-fg-muted">
                  Free over {formatMoney(freeMinor, currency)}
                </span>
              )}
            </span>
          </div>
        </figure>

        <section aria-labelledby="rate-h" className="flex flex-col gap-3">
          <h3 id="rate-h" className="text-base font-semibold">
            Rate
          </h3>
          <div className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
            <Field
              label={type === "per_item" ? "Price per item" : "Price"}
              required
              error={shown("price_minor")}
              hint="0 makes it free."
            >
              {({ id, describedBy, invalid }) => (
                <MoneyInput
                  id={id}
                  currency={currency}
                  value={price}
                  onChange={setPrice}
                  describedBy={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>
            <Field label="Transit time">
              {({ id }) => (
                <div className="relative">
                  <select
                    id={id}
                    value={transit}
                    onChange={(ev) => setTransit(ev.target.value)}
                    className="h-10 w-full appearance-none rounded-lg border border-border-strong bg-surface pl-3 pr-10 text-sm focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus/30"
                  >
                    {TRANSIT.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                    <option value="custom">Custom…</option>
                  </select>
                  <ChevronsUpDown
                    aria-hidden
                    className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
                  />
                </div>
              )}
            </Field>
            {transit === "custom" && (
              <div className="grid grid-cols-2 gap-4 sm:col-start-2">
                <Field label="From (days)" error={shown("min_days")}>
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      inputMode="numeric"
                      aria-describedby={describedBy}
                      invalid={invalid}
                      value={minDays}
                      onChange={(ev) => setMinDays(ev.target.value)}
                    />
                  )}
                </Field>
                <Field label="To (days)" error={shown("max_days")}>
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      inputMode="numeric"
                      aria-describedby={describedBy}
                      invalid={invalid}
                      value={maxDays}
                      onChange={(ev) => setMaxDays(ev.target.value)}
                    />
                  )}
                </Field>
              </div>
            )}
            <p className="text-xs text-fg-muted sm:col-span-2">Applies to all products.</p>
          </div>
        </section>

        <section aria-labelledby="free-h" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <h3 id="free-h" className="text-base font-semibold">
              Offer free shipping
            </h3>
            <Switch checked={freeOn} onChange={setFreeOn} label="Offer free shipping" />
          </div>
          <div className="rounded-xl border border-border p-4">
            <Field
              label="Minimum order amount"
              error={freeOn ? shown("free_over_minor") : undefined}
              hint={
                freeOn
                  ? "Orders at or above this ship free. Leave empty to always ship free."
                  : "Turn on to ship free above an order amount."
              }
            >
              {({ id, describedBy, invalid }) => (
                <MoneyInput
                  id={id}
                  currency={currency}
                  value={freeOver}
                  onChange={setFreeOver}
                  describedBy={describedBy}
                  invalid={invalid}
                  disabled={!freeOn}
                />
              )}
            </Field>
          </div>
        </section>

        {showLimits ? (
          <section aria-labelledby="limits-h" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <h3 id="limits-h" className="text-base font-semibold">
                Limits
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowLimits(false);
                  setRegions("");
                  setCities("");
                  setMinOrder("");
                  setMaxOrder("");
                  setExtraPerItem("");
                }}
              >
                Remove limits
              </Button>
            </div>
            <div className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
              <Field
                label="Only these provinces / states"
                error={shown("regions")}
                hint="Comma-separated, e.g. Punjab, Sindh. Empty = the whole country."
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    value={regions}
                    onChange={(ev) => setRegions(ev.target.value)}
                  />
                )}
              </Field>
              <Field
                label="Only these cities"
                error={shown("cities")}
                hint="Comma-separated, e.g. Lahore, Karachi. Empty = every city."
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    value={cities}
                    onChange={(ev) => setCities(ev.target.value)}
                  />
                )}
              </Field>
              <Field
                label="Orders from"
                error={shown("min_order_minor")}
                hint="Hide this option below this order amount."
              >
                {({ id, describedBy, invalid }) => (
                  <MoneyInput
                    id={id}
                    currency={currency}
                    value={minOrder}
                    onChange={setMinOrder}
                    describedBy={describedBy}
                    invalid={invalid}
                  />
                )}
              </Field>
              <Field
                label="Orders up to"
                error={shown("max_order_minor")}
                hint="Hide this option above this order amount."
              >
                {({ id, describedBy, invalid }) => (
                  <MoneyInput
                    id={id}
                    currency={currency}
                    value={maxOrder}
                    onChange={setMaxOrder}
                    describedBy={describedBy}
                    invalid={invalid}
                  />
                )}
              </Field>
              {type === "flat" && (
                <Field
                  label="Extra per additional item"
                  error={shown("per_item_minor")}
                  hint="Added for each item after the first."
                >
                  {({ id, describedBy, invalid }) => (
                    <MoneyInput
                      id={id}
                      currency={currency}
                      value={extraPerItem}
                      onChange={setExtraPerItem}
                      describedBy={describedBy}
                      invalid={invalid}
                    />
                  )}
                </Field>
              )}
            </div>
          </section>
        ) : (
          <button
            type="button"
            onClick={() => setShowLimits(true)}
            className="flex h-14 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-strong text-sm font-medium text-fg-muted hover:text-fg"
          >
            <Plus aria-hidden className="size-4" /> Limit to provinces, cities or order amount
          </button>
        )}
      </form>
    </Dialog>
  );
}
