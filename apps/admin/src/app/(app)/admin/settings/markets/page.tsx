"use client";

import { useEffect, useMemo, useState } from "react";
import { Earth, Pencil, Plus, Trash2 } from "lucide-react";
import { PERMISSIONS, type MarketView, type MarketsOverview } from "@cartforge/types";
import {
  convertPrice,
  formatMoney,
  ROUNDING_LABELS,
  ROUNDING_RULES,
  type MarketInput,
} from "@cartforge/validation";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  Dialog,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  useToast,
} from "@cartforge/ui";
import { ApiError } from "@/lib/api-client";
import { useMarketAction, useMarkets } from "@/lib/markets";
import { useSession } from "@/lib/session";
import { Toggle } from "@/components/toggle";

const CURRENCIES = [
  "PKR",
  "USD",
  "AED",
  "SAR",
  "QAR",
  "OMR",
  "KWD",
  "BHD",
  "GBP",
  "EUR",
  "CAD",
  "AUD",
  "NZD",
  "INR",
  "BDT",
  "LKR",
  "MYR",
  "SGD",
  "TRY",
  "CNY",
  "JPY",
  "CHF",
  "SEK",
];

/** Payment methods a market can offer; rupee-only ones need a PKR market. */
const METHODS: { key: string; label: string; pkrOnly?: boolean }[] = [
  { key: "cod", label: "Cash on delivery" },
  { key: "bank_transfer", label: "Bank transfer" },
  { key: "wallet_transfer", label: "JazzCash, Easypaisa or Raast transfer", pkrOnly: true },
  { key: "jazzcash", label: "JazzCash (gateway)", pkrOnly: true },
  { key: "easypaisa", label: "Easypaisa (gateway)", pkrOnly: true },
  { key: "safepay", label: "Safepay", pkrOnly: true },
  { key: "stripe", label: "Stripe (cards, Apple Pay, Google Pay)" },
];

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
const countryName = (c: string) => regionNames.of(c) ?? c;

function rateText(m: MarketView, store: string) {
  if (m.rate_source === "store") return `Prices in ${store}, as you set them`;
  if (m.rate_source === "unavailable")
    return m.pricing_mode === "live"
      ? "Live rate unavailable — this market is paused"
      : "No rate set — this market is paused";
  const r = m.rate!.toLocaleString("en", { maximumFractionDigits: 4 });
  return m.rate_source === "live"
    ? `1 ${m.currency} = ${r} ${store} · live rate${m.rate_updated_at ? `, updated ${new Date(m.rate_updated_at).toLocaleString()}` : ""}`
    : `1 ${m.currency} = ${r} ${store} · your rate`;
}

function MarketDialog({
  open,
  market,
  overview,
  onClose,
}: {
  open: boolean;
  market: MarketView | null;
  overview: MarketsOverview;
  onClose: () => void;
}) {
  const store = overview.store_currency;
  const action = useMarketAction();
  const toast = useToast();
  const primary = market?.is_primary ?? false;
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("");
  const [countries, setCountries] = useState("");
  const [mode, setMode] = useState<"manual" | "live">("manual");
  const [rate, setRate] = useState("");
  const [adjust, setAdjust] = useState("0");
  const [rounding, setRounding] = useState<NonNullable<MarketInput["rounding"]>>("x99");
  const [methods, setMethods] = useState<string[]>([]);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(market?.name ?? "");
    setCurrency(market?.currency ?? (store === "PKR" ? "AED" : "USD"));
    setCountries(market?.countries.join(", ") ?? "");
    setMode(market?.pricing_mode ?? "manual");
    setRate(market?.manual_rate != null ? String(market.manual_rate) : "");
    setAdjust(String((market?.adjustment_bps ?? 0) / 100));
    setRounding(market?.rounding ?? "x99");
    setMethods(market?.payment_methods ?? []);
    setActive(market?.active ?? true);
    action.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset each time it opens
  }, [open, market]);

  const codes = countries
    .split(/[\s,]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  const local: Record<string, string> = {};
  if (codes.some((c) => !/^[A-Z]{2}$/.test(c)))
    local.countries = "Use two-letter country codes like AE, SA, GB";
  const rateNum = Number(rate.replace(",", "."));
  const sameCurrency = currency === store;
  if (!primary && !sameCurrency && mode === "manual" && !(rateNum > 0))
    local.manual_rate = `Enter how many ${store} one ${currency} is worth`;
  const adjNum = Number(adjust.replace(",", "."));
  if (!Number.isFinite(adjNum) || adjNum < -50 || adjNum > 100)
    local.adjustment_bps = "Between -50% and 100%";

  const server: Record<string, string> = {};
  if (action.error instanceof ApiError)
    for (const f of action.error.fields) server[f.path] ??= f.message;
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => setSubmitted(false), [open]);
  const e = { ...server, ...(submitted ? local : {}) };

  // Live example with the values being edited.
  const sample = overview.markets.find((m) => m.example)?.example?.store_minor ?? null;
  const exampleRate = primary || sameCurrency ? 1 : mode === "manual" ? rateNum : market?.rate;
  const example =
    sample !== null && exampleRate && exampleRate > 0
      ? convertPrice(sample, {
          store_currency: store,
          currency,
          rate: 1 / exampleRate,
          adjustment_bps: primary ? 0 : Math.round(adjNum * 100) || 0,
          rounding: primary ? "none" : rounding,
        })
      : null;

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setSubmitted(true);
    if (Object.keys(local).length) return;
    action.mutate(
      {
        kind: "save",
        id: market?.id,
        body: {
          name,
          currency: primary ? store : currency,
          countries: codes,
          active,
          pricing_mode: sameCurrency ? "manual" : mode,
          manual_rate: !sameCurrency && mode === "manual" ? rateNum : null,
          adjustment_bps: Math.round(adjNum * 100),
          rounding,
          payment_methods: methods.filter(
            (k) => currency === "PKR" || !METHODS.find((m) => m.key === k)?.pkrOnly,
          ),
        },
      },
      {
        onSuccess: () => {
          toast.success(market ? `${name} saved` : `${name} added`);
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={market ? `Edit ${market.name}` : "Add market"}
      description={
        primary
          ? `Your main market. It sells in ${store}, the store's currency.`
          : "A group of countries that buy in one currency."
      }
      className="max-h-[92vh] w-[min(40rem,calc(100vw-2rem))] overflow-y-auto"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="market-form" loading={action.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="market-form" noValidate onSubmit={submit} className="flex flex-col gap-5">
        {action.isError && !Object.keys(server).length && (
          <Alert tone="danger" title={action.error.message} />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Market name" required error={e.name}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                value={name}
                placeholder="Gulf"
                onChange={(ev) => setName(ev.target.value)}
              />
            )}
          </Field>
          <Field
            label="Currency"
            required
            error={e.currency}
            hint={primary ? "The store currency." : undefined}
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={primary ? store : currency}
                disabled={primary}
                onChange={(ev) => setCurrency(ev.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field
          label="Countries"
          required={!primary}
          error={e.countries}
          hint={
            codes.length && codes.every((c) => /^[A-Z]{2}$/.test(c))
              ? codes.map(countryName).join(", ")
              : primary
                ? "Two-letter codes, e.g. PK. Leave empty to cover every country no other market lists."
                : "Two-letter codes, comma-separated, e.g. AE, SA, QA."
          }
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

        {!primary && (
          <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-4">
            <legend className="px-1 text-sm font-semibold">Prices</legend>
            {sameCurrency ? (
              <p className="text-sm text-fg-muted">
                Same currency as the store: prices stay as you set them (adjustment and rounding
                still apply).
              </p>
            ) : (
              <>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === "manual"}
                    onChange={() => setMode("manual")}
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span>
                    <span className="font-medium">Your own rate</span>
                    <span className="block text-fg-muted">
                      Prices only change when you change the rate.
                    </span>
                  </span>
                </label>
                {mode === "manual" && (
                  <Field label={`1 ${currency} equals (${store})`} required error={e.manual_rate}>
                    {({ id, describedBy, invalid }) => (
                      <Input
                        id={id}
                        inputMode="decimal"
                        aria-describedby={describedBy}
                        invalid={invalid}
                        value={rate}
                        placeholder={store === "PKR" && currency === "AED" ? "76" : ""}
                        onChange={(ev) => setRate(ev.target.value)}
                      />
                    )}
                  </Field>
                )}
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === "live"}
                    disabled={!overview.live_rates_available}
                    onChange={() => setMode("live")}
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span>
                    <span className="font-medium">Live exchange rate</span>
                    <span className="block text-fg-muted">
                      {overview.live_rates_available
                        ? "Updated automatically twice a day."
                        : "Not set up on this server yet (needs an Open Exchange Rates key)."}
                    </span>
                  </span>
                </label>
                {e.pricing_mode && <p className="text-xs text-danger">{e.pricing_mode}</p>}
              </>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Price adjustment (%)"
                error={e.adjustment_bps}
                hint="e.g. 10 to cover shipping and fees abroad."
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    inputMode="decimal"
                    aria-describedby={describedBy}
                    invalid={invalid}
                    value={adjust}
                    onChange={(ev) => setAdjust(ev.target.value)}
                  />
                )}
              </Field>
              <Field label="Rounding">
                {({ id }) => (
                  <Select
                    id={id}
                    value={rounding}
                    onChange={(ev) =>
                      setRounding(ev.target.value as NonNullable<MarketInput["rounding"]>)
                    }
                  >
                    {ROUNDING_RULES.map((r) => (
                      <option key={r} value={r}>
                        {ROUNDING_LABELS[r]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            {example !== null && sample !== null && (
              <p
                className="rounded-lg bg-surface-sunken px-3 py-2 text-sm"
                data-testid="market-example"
              >
                Example: {formatMoney(sample, store)} →{" "}
                <strong>{formatMoney(example, currency)}</strong>
              </p>
            )}
            <p className="text-xs text-fg-muted">
              You can also fix the price of any product in this market on its product page.
            </p>
          </fieldset>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Payment methods</legend>
          <p className="text-xs text-fg-muted">
            Tick the ones to offer here. None ticked = every method you&apos;ve turned on that works
            in {primary ? store : currency}.
          </p>
          {METHODS.map((m) => {
            const blocked = !!m.pkrOnly && (primary ? store : currency) !== "PKR";
            return (
              <label
                key={m.key}
                className={`flex items-center gap-2 text-sm ${blocked ? "text-fg-subtle" : ""}`}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  disabled={blocked}
                  checked={!blocked && methods.includes(m.key)}
                  onChange={(ev) =>
                    setMethods(
                      ev.target.checked ? [...methods, m.key] : methods.filter((k) => k !== m.key),
                    )
                  }
                />
                {m.label}
                {blocked && <span className="text-xs">(PKR only)</span>}
              </label>
            );
          })}
          {e.payment_methods && <p className="text-xs text-danger">{e.payment_methods}</p>}
        </fieldset>

        {!primary && (
          <Toggle
            label="Active"
            description="Shoppers in these countries see this market. Turn off to pause it."
            checked={active}
            onChange={setActive}
          />
        )}
      </form>
    </Dialog>
  );
}

/** Settings → Markets: sell to other countries in their own currency. */
export default function MarketsPage() {
  const { can } = useSession();
  const canEdit = can(PERMISSIONS.STORE_SETTINGS_WRITE);
  const q = useMarkets();
  const action = useMarketAction();
  const toast = useToast();
  const [editing, setEditing] = useState<MarketView | null | "new">(null);
  const [removing, setRemoving] = useState<MarketView | null>(null);
  const markets = useMemo(() => q.data?.markets ?? [], [q.data]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Markets"
        description="Sell to other countries in their own currency, with prices, products and payment methods per market."
        primaryAction={
          canEdit ? (
            <Button onClick={() => setEditing("new")}>
              <Plus aria-hidden /> Add market
            </Button>
          ) : undefined
        }
      />
      {q.isError ? (
        <Alert tone="danger" title="Couldn't load markets">
          {q.error.message}
        </Alert>
      ) : !q.data ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          {markets.length === 1 && (
            <Alert tone="info" title="Selling abroad?">
              Add a market for the countries you want to reach, e.g. &quot;Gulf&quot; in AED for the
              UAE and Saudi Arabia. Your {q.data.store_currency} prices are converted with your own
              rate or a live rate, and you can fix any price by hand.
            </Alert>
          )}
          <ul className="flex flex-col gap-4" aria-label="Markets">
            {markets.map((m) => (
              <li key={m.id}>
                <Card>
                  <CardBody className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Earth aria-hidden className="size-5 text-fg-muted" />
                      <h2 className="text-base font-semibold">{m.name}</h2>
                      <Badge>{m.currency}</Badge>
                      {m.is_primary && <Badge tone="info">Primary</Badge>}
                      {!m.is_primary &&
                        (m.rate_source === "unavailable" ? (
                          <Badge tone="warning">Paused</Badge>
                        ) : m.active ? (
                          <Badge tone="success">Active</Badge>
                        ) : (
                          <Badge>Off</Badge>
                        ))}
                      {canEdit && (
                        <span className="ml-auto flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Edit ${m.name}`}
                            onClick={() => setEditing(m)}
                          >
                            <Pencil aria-hidden />
                          </Button>
                          {!m.is_primary && (
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Delete ${m.name}`}
                              onClick={() => setRemoving(m)}
                            >
                              <Trash2 aria-hidden />
                            </Button>
                          )}
                        </span>
                      )}
                    </div>
                    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[9rem_1fr]">
                      <dt className="text-fg-muted">Countries</dt>
                      <dd>
                        {m.countries.length
                          ? m.countries.map(countryName).join(", ")
                          : "Every country not in another market"}
                      </dd>
                      <dt className="text-fg-muted">Prices</dt>
                      <dd>
                        {rateText(m, q.data.store_currency)}
                        {!m.is_primary &&
                          m.adjustment_bps !== 0 &&
                          ` · ${m.adjustment_bps > 0 ? "+" : ""}${m.adjustment_bps / 100}%`}
                        {!m.is_primary &&
                          m.rounding !== "none" &&
                          ` · ${ROUNDING_LABELS[m.rounding].split(" (")[0]!.toLowerCase()}`}
                      </dd>
                      {m.example && !m.is_primary && (
                        <>
                          <dt className="text-fg-muted">Example</dt>
                          <dd>
                            {formatMoney(m.example.store_minor, q.data.store_currency)} →{" "}
                            {formatMoney(m.example.market_minor, m.currency)}
                          </dd>
                        </>
                      )}
                      <dt className="text-fg-muted">Payment methods</dt>
                      <dd>
                        {m.payment_methods.length
                          ? m.payment_methods
                              .map((k) => METHODS.find((x) => x.key === k)?.label ?? k)
                              .join(", ")
                          : `All that work in ${m.currency}`}
                      </dd>
                    </dl>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>
          <MarketDialog
            open={editing !== null}
            market={editing === "new" ? null : editing}
            overview={q.data}
            onClose={() => setEditing(null)}
          />
        </>
      )}
      <ConfirmDialog
        open={removing !== null}
        title={`Delete ${removing?.name ?? "market"}?`}
        description="Shoppers in its countries go back to your primary market. Fixed prices for this market are deleted. Past orders aren't affected."
        confirmLabel="Delete"
        destructive
        pending={action.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() =>
          removing &&
          action.mutate(
            { kind: "remove", id: removing.id },
            {
              onSuccess: () => {
                toast.success(`${removing.name} deleted`);
                setRemoving(null);
              },
              onError: (err) => toast.error(err.message),
            },
          )
        }
      />
    </div>
  );
}
