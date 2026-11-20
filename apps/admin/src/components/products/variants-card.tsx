"use client";

import { useEffect, useMemo, useState } from "react";
import {
  History,
  ImageIcon,
  MoreHorizontal,
  PackagePlus,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  PERMISSIONS,
  type ProductDetail,
  type ProductVariantSummary,
  type VariantPlan,
} from "@cartforge/types";
import {
  MAX_OPTIONS,
  MAX_VARIANTS,
  formatMoney,
  minorToDecimalString,
  parseMoneyToMinor,
  productOptionsSchema,
  type ProductOptionsInput,
} from "@cartforge/validation";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  Field,
  Input,
  Menu,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
  cn,
  useToast,
  type MenuItem,
} from "@cartforge/ui";
import { AdjustStockDialog, type AdjustTarget } from "@/components/inventory/adjust-stock-dialog";
import { TagInput } from "@/components/tag-input";
import { MovementsDialog } from "@/components/inventory/movements-dialog";
import { ApiError } from "@/lib/api-client";
import {
  STOCK_LABEL,
  STOCK_TONE,
  useApplyOptions,
  useBulkUpdateVariants,
  usePreviewOptions,
  useUpdateVariant,
} from "@/lib/inventory";
import { useSession } from "@/lib/session";

type DraftOption = { key: string; name: string; values: string[] };

const toDraft = (p: ProductDetail): DraftOption[] =>
  p.options.map((o) => ({ key: o.id, name: o.name, values: o.values.map((v) => v.value) }));
const normalize = (d: DraftOption[]): ProductOptionsInput =>
  d.map((o) => ({ name: o.name.trim(), values: o.values.map((v) => v.trim()).filter(Boolean) }));

/** Options + variants for an existing product (PRD §8.4 F). Changes apply immediately. */
export function VariantsCard({
  product,
  formDirty,
}: {
  product: ProductDetail;
  formDirty: boolean;
}) {
  const { can } = useSession();
  const canWrite = can(PERMISSIONS.PRODUCTS_WRITE);
  const canAdjust = can(PERMISSIONS.INVENTORY_ADJUST);
  const [editing, setEditing] = useState(false);
  const [adjust, setAdjust] = useState<AdjustTarget | null>(null);
  const [history, setHistory] = useState<{ variant_id: string; label: string } | null>(null);
  const [editVariant, setEditVariant] = useState<ProductVariantSummary | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  const variable = product.product_type === "variable";
  useEffect(() => setSelected(new Set()), [product.id, product.variants.length]);

  const rowMenu = (v: ProductVariantSummary): MenuItem[] => [
    ...(canWrite
      ? [{ label: "Edit variant", icon: <Pencil />, onSelect: () => setEditVariant(v) }]
      : []),
    ...(canAdjust && v.inventory_tracking
      ? [
          {
            label: "Adjust stock",
            icon: <PackagePlus />,
            onSelect: () =>
              setAdjust({
                variant_id: v.id,
                label: `${product.title} — ${v.title}`,
                on_hand: v.inventory.on_hand,
              }),
          },
        ]
      : []),
    {
      label: "Stock history",
      icon: <History />,
      onSelect: () => setHistory({ variant_id: v.id, label: `${product.title} — ${v.title}` }),
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Variants"
        description={
          variable
            ? `${product.variants.length} variants from ${product.options.map((o) => o.name).join(", ")}`
            : "Options like size or color, each with its own price, SKU and stock."
        }
        actions={
          canWrite && !editing ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing(true)}
              disabled={formDirty}
              title={formDirty ? "Save or discard your other changes first" : undefined}
            >
              {variable ? (
                "Edit options"
              ) : (
                <>
                  <Plus aria-hidden /> Add options
                </>
              )}
            </Button>
          ) : undefined
        }
      />
      <CardBody className="flex flex-col gap-4">
        {formDirty && editing && (
          <Alert
            tone="warning"
            title="Save or discard your other changes before changing options."
          />
        )}
        {editing && <OptionsEditor product={product} onDone={() => setEditing(false)} />}

        {variable && (
          <>
            {selected.size > 0 && canWrite && (
              <div
                className="flex items-center gap-3 rounded-lg bg-surface-sunken px-3 py-2 text-sm"
                role="region"
                aria-label="Bulk actions"
              >
                <span className="font-medium">{selected.size} selected</span>
                <Button size="sm" variant="secondary" onClick={() => setBulkOpen(true)}>
                  Edit prices
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </div>
            )}
            <div className="-mx-4">
              <Table>
                <caption className="sr-only">Variants</caption>
                <THead>
                  <tr>
                    {canWrite && (
                      <Th className="w-10">
                        <input
                          type="checkbox"
                          aria-label="Select all variants"
                          className="size-4 accent-primary"
                          checked={selected.size === product.variants.length}
                          ref={(el) => {
                            if (el)
                              el.indeterminate =
                                selected.size > 0 && selected.size < product.variants.length;
                          }}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? new Set(product.variants.map((v) => v.id))
                                : new Set(),
                            )
                          }
                        />
                      </Th>
                    )}
                    <Th>Variant</Th>
                    <Th className="text-right">Price</Th>
                    <Th>Available</Th>
                    <Th>SKU</Th>
                    <Th className="w-12">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </THead>
                <TBody>
                  {product.variants.map((v) => {
                    const img = product.media.find((m) => m.media_asset_id === v.media_asset_id);
                    return (
                      <Tr key={v.id}>
                        {canWrite && (
                          <Td>
                            <input
                              type="checkbox"
                              aria-label={`Select ${v.title}`}
                              className="size-4 accent-primary"
                              checked={selected.has(v.id)}
                              onChange={(e) =>
                                setSelected((s) => {
                                  const next = new Set(s);
                                  if (e.target.checked) next.add(v.id);
                                  else next.delete(v.id);
                                  return next;
                                })
                              }
                            />
                          </Td>
                        )}
                        <Td>
                          <div className="flex items-center gap-2">
                            {img ? (
                              <img
                                src={img.thumb_url ?? img.url}
                                alt=""
                                className="size-8 rounded-md border border-border object-cover"
                              />
                            ) : (
                              <div className="flex size-8 items-center justify-center rounded-md border border-border bg-surface-sunken text-fg-subtle">
                                <ImageIcon aria-hidden className="size-3.5" />
                              </div>
                            )}
                            <span className="font-medium">{v.title}</span>
                          </div>
                        </Td>
                        <Td className="whitespace-nowrap text-right tabular-nums">
                          {v.price_minor === null ? (
                            <span className="text-danger">No price</span>
                          ) : (
                            formatMoney(v.price_minor, v.currency)
                          )}
                        </Td>
                        <Td>
                          {v.inventory_tracking ? (
                            <span className="flex items-center gap-2 tabular-nums">
                              {v.inventory.available}
                              {v.inventory.state !== "in_stock" && (
                                <Badge tone={STOCK_TONE[v.inventory.state]}>
                                  {STOCK_LABEL[v.inventory.state]}
                                </Badge>
                              )}
                            </span>
                          ) : (
                            <span className="text-fg-subtle">Not tracked</span>
                          )}
                        </Td>
                        <Td className="text-fg-muted">{v.sku ?? "—"}</Td>
                        <Td>
                          <Menu
                            label={`Actions for ${v.title}`}
                            trigger={<MoreHorizontal />}
                            items={rowMenu(v)}
                          />
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          </>
        )}

        {!variable && !editing && (
          <p className="text-sm text-fg-muted">
            This product has no options. Pricing and stock are set above.
          </p>
        )}
      </CardBody>

      <AdjustStockDialog target={adjust} onClose={() => setAdjust(null)} />
      <MovementsDialog target={history} onClose={() => setHistory(null)} />
      <VariantDialog product={product} variant={editVariant} onClose={() => setEditVariant(null)} />
      <BulkPriceDialog
        product={product}
        ids={bulkOpen ? [...selected] : null}
        onClose={() => setBulkOpen(false)}
        onDone={() => setSelected(new Set())}
      />
    </Card>
  );
}

// ───────────────────────────── Options editor ─────────────────────────────

function OptionsEditor({ product, onDone }: { product: ProductDetail; onDone: () => void }) {
  const [draft, setDraft] = useState<DraftOption[]>(() =>
    product.options.length
      ? toDraft(product)
      : [{ key: crypto.randomUUID(), name: "", values: [] }],
  );
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<VariantPlan | null>(null);
  const preview = usePreviewOptions(product.id);

  const input = normalize(draft);
  const count = input.length ? input.reduce((n, o) => n * Math.max(o.values.length, 1), 1) : 1;
  const unchanged = JSON.stringify(input) === JSON.stringify(normalize(toDraft(product)));

  const review = async () => {
    const parsed = productOptionsSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your options.");
      return;
    }
    if (input.some((o) => !o.name || !o.values.length)) {
      setError("Every option needs a name and at least one value.");
      return;
    }
    setError(null);
    try {
      setPlan(await preview.mutateAsync(parsed.data));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't preview changes.");
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      {draft.map((opt, i) => (
        <div
          key={opt.key}
          className="flex flex-col gap-2 rounded-lg bg-surface-sunken/60 p-3 sm:flex-row sm:items-start"
        >
          <div className="sm:w-44">
            <Field label={`Option ${i + 1} name`}>
              {({ id }) => (
                <Input
                  id={id}
                  value={opt.name}
                  maxLength={60}
                  placeholder={["Size", "Color", "Material"][i] ?? "Option"}
                  onChange={(e) =>
                    setDraft((d) =>
                      d.map((o) => (o.key === opt.key ? { ...o, name: e.target.value } : o)),
                    )
                  }
                />
              )}
            </Field>
          </div>
          <div className="min-w-0 flex-1">
            <TagInput
              label={`${opt.name || `Option ${i + 1}`} values`}
              values={opt.values}
              onChange={(values) =>
                setDraft((d) => d.map((o) => (o.key === opt.key ? { ...o, values } : o)))
              }
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove option ${opt.name || i + 1}`}
            className="self-end sm:mt-5 sm:self-start"
            onClick={() => setDraft((d) => d.filter((o) => o.key !== opt.key))}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      ))}

      {error && <Alert tone="danger" title={error} />}

      <div className="flex flex-wrap items-center gap-2">
        {draft.length < MAX_OPTIONS && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setDraft((d) => [...d, { key: crypto.randomUUID(), name: "", values: [] }])
            }
          >
            <Plus aria-hidden /> Add another option
          </Button>
        )}
        <span className={cn("text-xs", count > MAX_VARIANTS ? "text-danger" : "text-fg-subtle")}>
          {draft.length
            ? `${count} variant${count === 1 ? "" : "s"}`
            : "No options: the product becomes simple"}{" "}
          · max {MAX_VARIANTS}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void review()}
            loading={preview.isPending}
            disabled={unchanged}
          >
            Review changes
          </Button>
        </div>
      </div>

      <PlanDialog
        product={product}
        plan={plan}
        options={input}
        onClose={() => setPlan(null)}
        onApplied={onDone}
      />
    </div>
  );
}

function PlanDialog({
  product,
  plan,
  options,
  onClose,
  onApplied,
}: {
  product: ProductDetail;
  plan: VariantPlan | null;
  options: ProductOptionsInput;
  onClose: () => void;
  onApplied: () => void;
}) {
  const toast = useToast();
  const apply = useApplyOptions(product.id);
  const stockLost = plan?.remove.reduce((n, r) => n + r.on_hand, 0) ?? 0;

  return (
    <Dialog
      open={Boolean(plan)}
      onClose={() => !apply.isPending && onClose()}
      title="Review variant changes"
      description={
        plan
          ? `${product.variants.length} → ${plan.total_after} variant${plan.total_after === 1 ? "" : "s"}`
          : undefined
      }
      className="w-[min(34rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={apply.isPending}>
            Back
          </Button>
          <Button
            variant={plan?.remove.length ? "destructive" : "primary"}
            loading={apply.isPending}
            onClick={async () => {
              try {
                await apply.mutateAsync({
                  options,
                  confirm_removals: Boolean(plan?.remove.length),
                });
                toast.success("Variants updated");
                onClose();
                onApplied();
              } catch (err) {
                toast.error(err instanceof ApiError ? err.message : "Couldn't update variants.");
              }
            }}
          >
            {plan?.remove.length ? `Remove ${plan.remove.length} and apply` : "Apply changes"}
          </Button>
        </>
      }
    >
      {plan && (
        <div className="flex max-h-[50vh] flex-col gap-4 overflow-y-auto text-sm">
          {plan.remove.length > 0 && (
            <Alert
              tone="danger"
              title={`${plan.remove.length} variant${plan.remove.length === 1 ? "" : "s"} will be removed`}
            >
              {stockLost > 0 ? `${stockLost} units of stock are recorded on them. ` : ""}Past orders
              keep their copies.
            </Alert>
          )}
          <PlanList
            title="Keep (SKU, price and stock preserved)"
            items={plan.keep.map((k) =>
              k.from_title !== k.title ? `${k.from_title} → ${k.title}` : k.title,
            )}
          />
          <PlanList title="Create" items={plan.create.map((c) => c.title)} tone="success" />
          <PlanList
            title="Remove"
            items={plan.remove.map(
              (r) =>
                `${r.title}${r.sku ? ` (${r.sku})` : ""}${r.on_hand ? ` — ${r.on_hand} in stock` : ""}`,
            )}
            tone="danger"
          />
        </div>
      )}
    </Dialog>
  );
}

function PlanList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone?: "success" | "danger";
}) {
  if (!items.length) return null;
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
        {title} ({items.length})
      </h3>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((t) => (
          <li key={t}>
            <Badge tone={tone ?? "neutral"}>{t}</Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ───────────────────────────── Variant edit ─────────────────────────────

function useMoney(currency: string) {
  return useMemo(
    () => ({
      parse: (v: string) => parseMoneyToMinor(v, currency),
      show: (m: number | null) => minorToDecimalString(m, currency),
    }),
    [currency],
  );
}

function VariantDialog({
  product,
  variant,
  onClose,
}: {
  product: ProductDetail;
  variant: ProductVariantSummary | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const update = useUpdateVariant();
  const money = useMoney(product.currency);
  const [f, setF] = useState({
    sku: "",
    barcode: "",
    price: "",
    compare: "",
    cost: "",
    threshold: "",
    tracking: true,
    cont: false,
    media: "",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!variant) return;
    setError(null);
    setF({
      sku: variant.sku ?? "",
      barcode: variant.barcode ?? "",
      price: money.show(variant.price_minor),
      compare: money.show(variant.compare_at_minor),
      cost: money.show(variant.cost_minor),
      threshold: variant.inventory.low_stock_threshold?.toString() ?? "",
      tracking: variant.inventory_tracking,
      cont: variant.continue_selling,
      media: variant.media_asset_id ?? "",
    });
  }, [variant, money]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  const save = async () => {
    if (!variant) return;
    const price = money.parse(f.price);
    const compare = money.parse(f.compare);
    const cost = money.parse(f.cost);
    if ([price, compare, cost].some((x) => Number.isNaN(x)))
      return setError("Enter amounts like 19.99.");
    const threshold = f.threshold.trim() === "" ? null : Number(f.threshold);
    if (threshold !== null && (!Number.isInteger(threshold) || threshold < 0))
      return setError("Low-stock alert must be a whole number.");
    setError(null);
    try {
      await update.mutateAsync({
        id: variant.id,
        body: {
          sku: f.sku.trim() || null,
          barcode: f.barcode.trim() || null,
          price_minor: price,
          compare_at_minor: compare,
          cost_minor: cost,
          inventory_tracking: f.tracking,
          continue_selling: f.cont,
          low_stock_threshold: threshold,
          media_asset_id: f.media || null,
        },
      });
      toast.success(`Saved ${variant.title}`);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.fields[0]?.message ?? err.message)
          : "Couldn't save the variant.",
      );
    }
  };

  return (
    <Dialog
      open={Boolean(variant)}
      onClose={() => !update.isPending && onClose()}
      title={variant ? `Edit ${variant.title}` : "Edit variant"}
      className="w-[min(36rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={update.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
        {error && <Alert tone="danger" title={error} />}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Price">
            {({ id }) => (
              <Input id={id} inputMode="decimal" value={f.price} onChange={set("price")} />
            )}
          </Field>
          <Field label="Compare-at price">
            {({ id }) => (
              <Input id={id} inputMode="decimal" value={f.compare} onChange={set("compare")} />
            )}
          </Field>
          <Field label="Cost per item">
            {({ id }) => (
              <Input id={id} inputMode="decimal" value={f.cost} onChange={set("cost")} />
            )}
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="SKU">
            {({ id }) => <Input id={id} value={f.sku} maxLength={100} onChange={set("sku")} />}
          </Field>
          <Field label="Barcode">
            {({ id }) => (
              <Input id={id} value={f.barcode} maxLength={100} onChange={set("barcode")} />
            )}
          </Field>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={f.tracking}
              onChange={(e) => setF((s) => ({ ...s, tracking: e.target.checked }))}
            />
            Track quantity
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={f.cont}
              onChange={(e) => setF((s) => ({ ...s, cont: e.target.checked }))}
            />
            Continue selling when out of stock
          </label>
        </div>
        <div className="sm:w-48">
          <Field label="Low-stock alert at" hint="Leave blank for no alert.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                inputMode="numeric"
                value={f.threshold}
                onChange={set("threshold")}
              />
            )}
          </Field>
        </div>
        {product.media.length > 0 && (
          <fieldset>
            <legend className="mb-1 text-sm">Variant image</legend>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={!f.media}
                onClick={() => setF((s) => ({ ...s, media: "" }))}
                className={cn(
                  "flex size-14 items-center justify-center rounded-lg border-2 text-xs text-fg-muted",
                  !f.media ? "border-primary" : "border-border",
                )}
              >
                None
              </button>
              {product.media.map((m, i) => (
                <button
                  key={m.media_asset_id}
                  type="button"
                  aria-pressed={f.media === m.media_asset_id}
                  aria-label={m.alt_text || `Product image ${i + 1}`}
                  onClick={() => setF((s) => ({ ...s, media: m.media_asset_id }))}
                  className={cn(
                    "size-14 overflow-hidden rounded-lg border-2",
                    f.media === m.media_asset_id ? "border-primary" : "border-transparent",
                  )}
                >
                  <img src={m.thumb_url ?? m.url} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </div>
    </Dialog>
  );
}

function BulkPriceDialog({
  product,
  ids,
  onClose,
  onDone,
}: {
  product: ProductDetail;
  ids: string[] | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const bulk = useBulkUpdateVariants(product.id);
  const money = useMoney(product.currency);
  const [f, setF] = useState({ price: "", compare: "", cost: "" });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (ids) {
      setF({ price: "", compare: "", cost: "" });
      setError(null);
    }
  }, [ids]);

  const save = async () => {
    if (!ids) return;
    const set: { price_minor?: number; compare_at_minor?: number | null; cost_minor?: number } = {};
    const p = money.parse(f.price);
    const c = money.parse(f.compare);
    const k = money.parse(f.cost);
    if ([p, c, k].some((x) => Number.isNaN(x))) return setError("Enter amounts like 19.99.");
    if (p !== null) set.price_minor = p;
    if (c !== null) set.compare_at_minor = c;
    if (k !== null) set.cost_minor = k;
    if (!Object.keys(set).length) return setError("Enter at least one amount.");
    try {
      await bulk.mutateAsync({ variant_ids: ids, set });
      toast.success(`Updated ${ids.length} variant${ids.length === 1 ? "" : "s"}`);
      onDone();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.fields[0]?.message ?? err.message)
          : "Couldn't update prices.",
      );
    }
  };

  return (
    <Dialog
      open={Boolean(ids)}
      onClose={() => !bulk.isPending && onClose()}
      title={`Edit prices for ${ids?.length ?? 0} variants`}
      description="Only the amounts you fill in are changed."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={bulk.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={bulk.isPending}>
            Apply
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <Alert tone="danger" title={error} />}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Price">
            {({ id }) => (
              <Input
                id={id}
                inputMode="decimal"
                value={f.price}
                onChange={(e) => setF((s) => ({ ...s, price: e.target.value }))}
              />
            )}
          </Field>
          <Field label="Compare-at price">
            {({ id }) => (
              <Input
                id={id}
                inputMode="decimal"
                value={f.compare}
                onChange={(e) => setF((s) => ({ ...s, compare: e.target.value }))}
              />
            )}
          </Field>
          <Field label="Cost per item">
            {({ id }) => (
              <Input
                id={id}
                inputMode="decimal"
                value={f.cost}
                onChange={(e) => setF((s) => ({ ...s, cost: e.target.value }))}
              />
            )}
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
