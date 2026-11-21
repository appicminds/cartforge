"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DetailResponse, PlatformStoreRow, StoreCurrencyResult } from "@cartforge/types";
import { Alert, Button, Dialog, Field, Select, useToast } from "@cartforge/ui";
import { apiRequest } from "@/lib/api-client";
import { CURRENCIES } from "@/lib/platform";

/**
 * Platform admin: switch a store's currency before its first order. Prices keep
 * the numbers people see (4,799.00 USD → Rs 4,799); it is not an exchange-rate conversion.
 */
export function CurrencyDialog({
  store,
  onClose,
}: {
  store: PlatformStoreRow | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [currency, setCurrency] = useState("");
  const change = useMutation({
    mutationFn: (body: { id: string; currency: string }) =>
      apiRequest<DetailResponse<StoreCurrencyResult>>(`/platform/stores/${body.id}/currency`, {
        method: "POST",
        body: { currency: body.currency },
      }).then((r) => r.data),
  });
  useEffect(() => {
    setCurrency(store?.currency === "PKR" ? "" : "PKR");
    change.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when opened for a store
  }, [store?.id]);

  const options = CURRENCIES.filter((c) => c !== store?.currency);
  return (
    <Dialog
      open={store !== null}
      onClose={onClose}
      title={`Change currency of ${store?.name ?? "store"}`}
      description="Prices keep their numbers: 4,799.00 USD becomes Rs 4,799. Nothing is converted at an exchange rate."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="currency-form"
            loading={change.isPending}
            disabled={!currency || (store?.order_count ?? 0) > 0}
          >
            Change to {currency || "…"}
          </Button>
        </>
      }
    >
      <form
        id="currency-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!store || !currency) return;
          change.mutate(
            { id: store.id, currency },
            {
              onSuccess: (r) => {
                toast.success(
                  `${store.name} now sells in ${r.to}` +
                    (r.rounded ? ` (${r.rounded} amounts rounded to whole units)` : ""),
                );
                void qc.invalidateQueries({ queryKey: ["platform", "stores"] });
                onClose();
              },
            },
          );
        }}
      >
        {store && store.order_count > 0 && (
          <Alert tone="warning" title="This store already has orders">
            The currency can only change before the first order.
          </Alert>
        )}
        {change.error && <Alert tone="danger" title={change.error.message} />}
        <p className="text-sm">
          Currently <strong>{store?.currency}</strong>. Open carts are emptied; shoppers add items
          again.
        </p>
        <Field label="New currency" required>
          {({ id }) => (
            <Select id={id} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="" disabled>
                Choose…
              </option>
              {options.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </form>
    </Dialog>
  );
}
