"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Truck } from "lucide-react";
import { PERMISSIONS, type ShippingMethodView } from "@cartforge/types";
import {
  formatMoney,
  minorToDecimalString,
  parseMoneyToMinor,
  type CheckoutSettings,
} from "@cartforge/validation";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Dialog,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from "@cartforge/ui";
import { ApiError } from "@/lib/api-client";
import {
  useCheckoutSettings,
  useDeleteShippingMethod,
  useSaveCheckoutSettings,
  useSaveShippingMethod,
  useShippingMethods,
} from "@/lib/commerce";
import { useSession } from "@/lib/session";
import { useStoreSettings } from "@/lib/store";

type CustomField = CheckoutSettings["custom_fields"][number];

const fieldErrors = (err: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (err instanceof ApiError) for (const f of err.fields) out[f.path] ??= f.message;
  return out;
};

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 accent-[var(--cf-color-primary)]"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-fg-muted">{description}</span>}
      </span>
    </label>
  );
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "f_$1")
    .slice(0, 40) || "field";

function SettingsForm({ initial, canEdit }: { initial: CheckoutSettings; canEdit: boolean }) {
  const [s, setS] = useState<CheckoutSettings>(initial);
  const [rate, setRate] = useState(String(initial.tax_rate_bps / 100));
  const save = useSaveCheckoutSettings();
  const toast = useToast();
  const errors = fieldErrors(save.error);
  useEffect(() => {
    setS(initial);
    setRate(String(initial.tax_rate_bps / 100));
  }, [initial]);
  const set = <K extends keyof CheckoutSettings>(k: K, v: CheckoutSettings[K]) =>
    setS((p) => ({ ...p, [k]: v }));
  const setField = (i: number, patch: Partial<CustomField>) =>
    set(
      "custom_fields",
      s.custom_fields.map((f, j) => (j === i ? { ...f, ...patch } : f)),
    );
  const rateBps = Math.round(Number(rate.replace(",", ".")) * 100);
  const rateInvalid = !/^\d{1,3}([.,]\d{1,2})?$/.test(rate.trim()) || rateBps > 10_000;
  const dirty = JSON.stringify({ ...s, tax_rate_bps: rateBps }) !== JSON.stringify(initial);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rateInvalid) return;
    save.mutate(
      { ...s, tax_rate_bps: rateBps },
      {
        onSuccess: () => toast.success("Checkout settings saved"),
        onError: (err) =>
          toast.error(
            err instanceof ApiError && err.fields.length
              ? "Check the highlighted fields."
              : err.message,
          ),
      },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <fieldset disabled={!canEdit || save.isPending} className="flex flex-col gap-6">
        <Card>
          <CardHeader
            title="Payment methods"
            description="Offline methods available now. Card and wallet providers arrive with the Payment Hub."
          />
          <CardBody className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <Toggle
                label="Bank transfer"
                description="Customers pay by transfer; you mark the order paid when the money arrives."
                checked={s.bank_transfer_enabled}
                onChange={(v) => set("bank_transfer_enabled", v)}
              />
              {s.bank_transfer_enabled && (
                <Field
                  label="Bank details shown to customers"
                  required
                  error={errors.bank_transfer_instructions}
                  hint="The order number is added automatically as the payment reference."
                >
                  {({ id, describedBy, invalid }) => (
                    <Textarea
                      id={id}
                      aria-describedby={describedBy}
                      aria-invalid={invalid || undefined}
                      rows={3}
                      value={s.bank_transfer_instructions}
                      onChange={(e) => set("bank_transfer_instructions", e.target.value)}
                    />
                  )}
                </Field>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <Toggle
                label="Cash on delivery"
                description="Customers pay the courier when the order arrives."
                checked={s.cod_enabled}
                onChange={(v) => set("cod_enabled", v)}
              />
              {s.cod_enabled && (
                <Field label="Note for customers" error={errors.cod_instructions}>
                  {({ id, describedBy }) => (
                    <Textarea
                      id={id}
                      aria-describedby={describedBy}
                      rows={2}
                      value={s.cod_instructions}
                      onChange={(e) => set("cod_instructions", e.target.value)}
                    />
                  )}
                </Field>
              )}
            </div>
            {!s.cod_enabled && !s.bank_transfer_enabled && (
              <Alert tone="warning" title="Checkout is closed">
                Turn on at least one payment method so customers can place orders.
              </Alert>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Taxes"
            description="One rate for the whole store. Regional rules arrive with Tax Management."
          />
          <CardBody className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Tax rate (%)"
                required
                error={rateInvalid ? "Enter a percentage between 0 and 100" : errors.tax_rate_bps}
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    inputMode="decimal"
                    aria-describedby={describedBy}
                    invalid={invalid}
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Label at checkout" required error={errors.tax_label}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    value={s.tax_label}
                    onChange={(e) => set("tax_label", e.target.value)}
                  />
                )}
              </Field>
            </div>
            <Toggle
              label="Prices include tax"
              description="Common for VAT. Totals stay the same; tax is shown as included."
              checked={s.prices_include_tax}
              onChange={(v) => set("prices_include_tax", v)}
            />
            <Toggle
              label="Charge tax on shipping"
              checked={s.tax_shipping}
              onChange={(v) => set("tax_shipping", v)}
            />
            <p className="text-xs text-fg-muted">
              You’re responsible for configuring the right taxes for where you sell. CartForge
              calculates what you set up here.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Checkout form" description="What customers fill in before paying." />
          <CardBody className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone number">
                {({ id }) => (
                  <Select
                    id={id}
                    value={s.phone}
                    onChange={(e) => set("phone", e.target.value as CheckoutSettings["phone"])}
                  >
                    <option value="hidden">Don’t ask</option>
                    <option value="optional">Optional</option>
                    <option value="required">Required</option>
                  </Select>
                )}
              </Field>
              <Field
                label="Hold items in checkout for (minutes)"
                hint="Stock is reserved while a customer checks out."
                error={errors.reservation_minutes}
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    type="number"
                    min={5}
                    max={120}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    value={s.reservation_minutes}
                    onChange={(e) => set("reservation_minutes", Number(e.target.value) || 0)}
                  />
                )}
              </Field>
            </div>
            <div className="flex flex-col gap-3">
              <Toggle
                label="Require customers to accept terms"
                checked={s.terms_required}
                onChange={(v) => set("terms_required", v)}
              />
              {s.terms_required && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Checkbox text" error={errors.terms_label}>
                    {({ id, describedBy, invalid }) => (
                      <Input
                        id={id}
                        aria-describedby={describedBy}
                        invalid={invalid}
                        value={s.terms_label}
                        onChange={(e) => set("terms_label", e.target.value)}
                      />
                    )}
                  </Field>
                  <Field
                    label="Link to terms"
                    hint="/pages/terms or https://…"
                    error={errors.terms_url}
                  >
                    {({ id, describedBy, invalid }) => (
                      <Input
                        id={id}
                        aria-describedby={describedBy}
                        invalid={invalid}
                        value={s.terms_url}
                        onChange={(e) => set("terms_url", e.target.value)}
                      />
                    )}
                  </Field>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Custom fields</h3>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={s.custom_fields.length >= 5}
                  onClick={() =>
                    set("custom_fields", [
                      ...s.custom_fields,
                      {
                        key: `field_${s.custom_fields.length + 1}`,
                        label: "",
                        type: "text",
                        required: false,
                        options: [],
                        help: "",
                      },
                    ])
                  }
                >
                  <Plus aria-hidden /> Add field
                </Button>
              </div>
              {errors.custom_fields && (
                <p className="text-xs text-danger">{errors.custom_fields}</p>
              )}
              {s.custom_fields.length === 0 && (
                <p className="text-sm text-fg-muted">
                  Ask for extra details at checkout, like a gift message or delivery window (up to
                  5).
                </p>
              )}
              {s.custom_fields.map((f, i) => (
                <div
                  key={i}
                  className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_9rem_auto]"
                >
                  <Field label={`Field ${i + 1} label`} error={errors[`custom_fields.${i}.label`]}>
                    {({ id, describedBy, invalid }) => (
                      <Input
                        id={id}
                        aria-describedby={describedBy}
                        invalid={invalid}
                        value={f.label}
                        onChange={(e) =>
                          setField(i, { label: e.target.value, key: slug(e.target.value) })
                        }
                      />
                    )}
                  </Field>
                  <Field label="Type">
                    {({ id }) => (
                      <Select
                        id={id}
                        value={f.type}
                        onChange={(e) =>
                          setField(i, { type: e.target.value as CustomField["type"] })
                        }
                      >
                        <option value="text">Short text</option>
                        <option value="textarea">Long text</option>
                        <option value="checkbox">Checkbox</option>
                        <option value="select">Choice</option>
                      </Select>
                    )}
                  </Field>
                  <div className="flex items-end gap-3 pb-1">
                    <Toggle
                      label="Required"
                      checked={f.required}
                      onChange={(v) => setField(i, { required: v })}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove field ${f.label || i + 1}`}
                      onClick={() =>
                        set(
                          "custom_fields",
                          s.custom_fields.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                  {f.type === "select" && (
                    <div className="sm:col-span-3">
                      <Field
                        label="Choices (comma-separated)"
                        error={errors[`custom_fields.${i}.options`]}
                      >
                        {({ id, describedBy, invalid }) => (
                          <Input
                            id={id}
                            aria-describedby={describedBy}
                            invalid={invalid}
                            value={f.options.join(", ")}
                            onChange={(e) =>
                              setField(i, {
                                options: e.target.value
                                  .split(",")
                                  .map((x) => x.trim())
                                  .filter(Boolean),
                              })
                            }
                          />
                        )}
                      </Field>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </fieldset>
      {canEdit && (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!dirty || save.isPending}
            onClick={() => {
              setS(initial);
              setRate(String(initial.tax_rate_bps / 100));
              save.reset();
            }}
          >
            Discard
          </Button>
          <Button type="submit" disabled={!dirty || rateInvalid} loading={save.isPending}>
            Save settings
          </Button>
        </div>
      )}
    </form>
  );
}

function ShippingDialog({
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
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [freeOver, setFreeOver] = useState("");
  const [countries, setCountries] = useState("");
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!open) return;
    setName(method?.name ?? "");
    setDescription(method?.description ?? "");
    setPrice(method ? minorToDecimalString(method.price_minor, currency) : "");
    setFreeOver(
      method?.free_over_minor != null ? minorToDecimalString(method.free_over_minor, currency) : "",
    );
    setCountries(method?.countries.join(", ") ?? "");
    setActive(method?.active ?? true);
    save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when (re)opened
  }, [open, method]);
  const priceMinor = parseMoneyToMinor(price || "0", currency);
  const freeMinor = freeOver.trim() ? parseMoneyToMinor(freeOver, currency) : null;
  const errs = fieldErrors(save.error);
  const local: Record<string, string> = {};
  if (price && Number.isNaN(priceMinor ?? NaN)) local.price_minor = "Enter an amount like 5.00";
  if (freeOver.trim() && Number.isNaN(freeMinor ?? NaN))
    local.free_over_minor = "Enter an amount like 75.00";
  const codes = countries
    .split(/[\s,]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  if (codes.some((c) => !/^[A-Z]{2}$/.test(c)))
    local.countries = "Use two-letter country codes like US, CA, GB";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(local).length || priceMinor === null) return;
    save.mutate(
      {
        id: method?.id,
        body: {
          name,
          description: description || undefined,
          price_minor: priceMinor,
          free_over_minor: freeMinor,
          countries: codes,
          active,
        },
      },
      {
        onSuccess: () => {
          toast.success(method ? "Shipping method saved" : "Shipping method added");
          onClose();
        },
      },
    );
  };
  const e = { ...errs, ...local };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={method ? "Edit shipping method" : "Add shipping method"}
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
      <form id="shipping-form" onSubmit={submit} className="flex flex-col gap-4">
        {save.isError && !Object.keys(errs).length && (
          <Alert tone="danger" title={save.error.message} />
        )}
        <Field
          label="Name"
          required
          error={e.name}
          hint="Shown at checkout, e.g. Standard or Express."
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              value={name}
              onChange={(ev) => setName(ev.target.value)}
            />
          )}
        </Field>
        <Field
          label="Delivery estimate"
          error={e.description}
          hint="Optional, e.g. 3–5 business days."
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={description}
              onChange={(ev) => setDescription(ev.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Rate (${currency})`} required error={e.price_minor}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                inputMode="decimal"
                aria-describedby={describedBy}
                invalid={invalid}
                value={price}
                placeholder="0.00"
                onChange={(ev) => setPrice(ev.target.value)}
              />
            )}
          </Field>
          <Field
            label={`Free over (${currency})`}
            error={e.free_over_minor}
            hint="Leave empty for never free."
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                inputMode="decimal"
                aria-describedby={describedBy}
                invalid={invalid}
                value={freeOver}
                onChange={(ev) => setFreeOver(ev.target.value)}
              />
            )}
          </Field>
        </div>
        <Field
          label="Countries"
          error={e.countries}
          hint="Two-letter codes, comma-separated. Leave empty to ship everywhere."
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              value={countries}
              placeholder="US, CA"
              onChange={(ev) => setCountries(ev.target.value)}
            />
          )}
        </Field>
        <Toggle label="Offer at checkout" checked={active} onChange={setActive} />
      </form>
    </Dialog>
  );
}

function ShippingCard({ canEdit, currency }: { canEdit: boolean; currency: string }) {
  const list = useShippingMethods();
  const del = useDeleteShippingMethod();
  const toast = useToast();
  const [editing, setEditing] = useState<ShippingMethodView | null | "new">(null);
  const [deleting, setDeleting] = useState<ShippingMethodView | null>(null);
  const money = (m: number) => formatMoney(m, currency);
  return (
    <Card>
      <CardHeader
        title="Shipping"
        description="Flat rates by destination. Checkout only offers methods that ship to the customer’s country."
        actions={
          canEdit ? (
            <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
              <Plus aria-hidden /> Add method
            </Button>
          ) : undefined
        }
      />
      <CardBody>
        {list.isError ? (
          <Alert tone="danger" title="Couldn't load shipping methods">
            {list.error.message}
          </Alert>
        ) : !list.data ? (
          <Skeleton className="h-20 w-full" />
        ) : list.data.length === 0 ? (
          <div className="flex flex-col items-start gap-2 py-2 text-sm text-fg-muted">
            <Truck aria-hidden className="size-5" />
            No shipping methods yet. Customers can’t check out physical products until you add one.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {list.data.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {m.name} {!m.active && <Badge>Off</Badge>}
                  </p>
                  <p className="text-xs text-fg-muted">
                    {m.price_minor === 0 ? "Free" : money(m.price_minor)}
                    {m.free_over_minor !== null && ` · free over ${money(m.free_over_minor)}`}
                    {" · "}
                    {m.countries.length ? m.countries.join(", ") : "All countries"}
                    {m.description && ` · ${m.description}`}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Edit ${m.name}`}
                      onClick={() => setEditing(m)}
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${m.name}`}
                      onClick={() => setDeleting(m)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      <ShippingDialog
        open={editing !== null}
        method={editing === "new" ? null : editing}
        currency={currency}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "shipping method"}?`}
        description="Customers in the middle of checkout will need to choose another method."
        confirmLabel="Delete"
        destructive
        pending={del.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.id, {
            onSuccess: () => {
              toast.success("Shipping method deleted");
              setDeleting(null);
            },
            onError: (err) => toast.error(err.message),
          })
        }
      />
    </Card>
  );
}

export default function CheckoutSettingsPage() {
  const { can } = useSession();
  const canEdit = can(PERMISSIONS.STORE_SETTINGS_WRITE);
  const settings = useCheckoutSettings();
  const store = useStoreSettings();
  const currency = store.data?.currency ?? "USD";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Checkout"
        description="How customers pay and what they see when they check out."
      />
      {!canEdit && (
        <Alert tone="info" title="View only">
          Your role can see these settings but not change them.
        </Alert>
      )}
      <ShippingCard canEdit={canEdit} currency={currency} />
      {settings.isError ? (
        <Alert tone="danger" title="Couldn't load checkout settings">
          {settings.error.message}
        </Alert>
      ) : settings.data ? (
        <SettingsForm initial={settings.data} canEdit={canEdit} />
      ) : (
        <Skeleton className="h-96 w-full" />
      )}
    </div>
  );
}
