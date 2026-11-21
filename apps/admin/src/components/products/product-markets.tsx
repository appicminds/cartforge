"use client";

import { useEffect, useState } from "react";
import { PERMISSIONS, type ProductMarketsView } from "@cartforge/types";
import { formatMoney, minorToDecimalString, parseMoneyToMinor } from "@cartforge/validation";
import { Alert, Button, Card, CardBody, CardHeader, useToast } from "@cartforge/ui";
import { ApiError } from "@/lib/api-client";
import { useProductMarkets, useSaveProductMarkets } from "@/lib/markets";
import { useSession } from "@/lib/session";

type Draft = { hidden: string[]; prices: Record<string, string> };
const key = (marketId: string, variantId: string) => `${marketId}:${variantId}`;

function toDraft(v: ProductMarketsView): Draft {
  const prices: Record<string, string> = {};
  for (const m of v.markets)
    for (const r of m.rows)
      prices[key(m.id, r.variant_id)] =
        r.price_minor === null ? "" : minorToDecimalString(r.price_minor, m.currency);
  return { hidden: v.hidden_market_ids, prices };
}

/**
 * Product page: where this product is sold and, per market, an optional fixed
 * price (empty = the store price converted with the market's rate and rounding).
 */
export function ProductMarketsCard({ productId }: { productId: string }) {
  const { can } = useSession();
  const canEdit = can(PERMISSIONS.PRODUCTS_WRITE);
  const q = useProductMarkets(productId);
  const save = useSaveProductMarkets(productId);
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => {
    if (q.data) setDraft(toDraft(q.data));
  }, [q.data]);

  const others = q.data?.markets.filter((m) => !m.is_primary) ?? [];
  if (!q.data || !draft || others.length === 0) return null;

  const errors: Record<string, string> = {};
  for (const m of others)
    for (const r of m.rows) {
      const v = draft.prices[key(m.id, r.variant_id)]?.trim();
      if (v && Number.isNaN(parseMoneyToMinor(v, m.currency) ?? NaN))
        errors[key(m.id, r.variant_id)] = "Enter an amount";
    }
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(q.data));

  return (
    <Card className="mt-6">
      <CardHeader
        title="Markets"
        description="Where this product is sold, and fixed prices per market. Leave a price empty to use the converted price."
      />
      <CardBody className="flex flex-col gap-6">
        {save.error && (
          <Alert
            tone="danger"
            title={save.error instanceof ApiError ? save.error.message : "Couldn't save"}
          />
        )}
        {others.map((m) => {
          const sold = !draft.hidden.includes(m.id);
          return (
            <fieldset key={m.id} className="flex flex-col gap-3" disabled={!canEdit}>
              <legend className="sr-only">{m.name}</legend>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={sold}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      hidden: e.target.checked
                        ? draft.hidden.filter((id) => id !== m.id)
                        : [...draft.hidden, m.id],
                    })
                  }
                />
                Sell in {m.name} ({m.currency})
              </label>
              {sold && (
                <table className="w-full text-sm">
                  <caption className="sr-only">Prices in {m.name}</caption>
                  <thead className="text-left text-xs text-fg-muted">
                    <tr>
                      <th className="py-1 font-medium">Variant</th>
                      <th className="py-1 font-medium">Converted price</th>
                      <th className="py-1 font-medium">Fixed price ({m.currency})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.rows.map((r) => {
                      const k = key(m.id, r.variant_id);
                      return (
                        <tr key={r.variant_id} className="border-t border-border">
                          <td className="py-2 pr-3">{r.variant_title}</td>
                          <td className="py-2 pr-3 text-fg-muted">
                            {r.converted_minor === null
                              ? "—"
                              : formatMoney(r.converted_minor, m.currency)}
                          </td>
                          <td className="py-2">
                            <input
                              aria-label={`Fixed price in ${m.name} for ${r.variant_title}`}
                              inputMode="decimal"
                              className={`h-8 w-32 rounded-lg border bg-surface px-2 text-sm ${errors[k] ? "border-danger" : "border-border-strong"}`}
                              placeholder="Converted"
                              value={draft.prices[k] ?? ""}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  prices: { ...draft.prices, [k]: e.target.value },
                                })
                              }
                            />
                            {errors[k] && <p className="text-xs text-danger">{errors[k]}</p>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </fieldset>
          );
        })}
        {canEdit && dirty && (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDraft(toDraft(q.data))}>
              Discard
            </Button>
            <Button
              loading={save.isPending}
              disabled={Object.keys(errors).length > 0}
              onClick={() =>
                save.mutate(
                  {
                    hidden_market_ids: draft.hidden,
                    prices: others.flatMap((m) =>
                      m.rows.map((r) => {
                        const v = draft.prices[key(m.id, r.variant_id)]?.trim();
                        return {
                          market_id: m.id,
                          variant_id: r.variant_id,
                          price_minor: v ? parseMoneyToMinor(v, m.currency) : null,
                          compare_at_minor: null,
                        };
                      }),
                    ),
                  },
                  { onSuccess: () => toast.success("Market settings saved") },
                )
              }
            >
              Save markets
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
