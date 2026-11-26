"use client";

import { useEffect, useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { DetailResponse, PlatformStoreRow, StoreTransferResult } from "@cartforge/types";
import { Alert, Button, Dialog, Field, Input, Select } from "@cartforge/ui";
import { apiRequest } from "@/lib/api-client";
import { usePlatformStores } from "@/lib/platform";

type Mode = "move" | "copy";
interface Progress {
  done: StoreTransferResult["done"];
  failed: StoreTransferResult["failed"];
  remaining: number | null;
  finished: boolean;
}

/**
 * Platform admin: move (or copy) every draft/active product of one store into
 * another. The API works in small batches; this dialog repeats the call until
 * nothing is left, showing progress, and stops at the first failed batch.
 */
export function TransferDialog({
  store,
  onClose,
}: {
  store: PlatformStoreRow | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const stores = usePlatformStores({ page: 1, page_size: 100, status: "active" });
  const [targetId, setTargetId] = useState("");
  const [mode, setMode] = useState<Mode>("move");
  const [rate, setRate] = useState("1");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const modeName = useId();

  useEffect(() => {
    // Fresh form each time the dialog opens for a store.
    setTargetId("");
    setMode("move");
    setRate("1");
    setError(null);
    setProgress(null);
  }, [store?.id]);

  const targets = (stores.data?.data ?? []).filter((s) => s.id !== store?.id);
  const target = targets.find((s) => s.id === targetId);
  const currenciesDiffer = !!store && !!target && store.currency !== target.currency;
  const rateNumber = Number(rate);
  const rateInvalid = currenciesDiffer && !(rateNumber > 0);

  async function run() {
    if (!store || !target || rateInvalid) return;
    setRunning(true);
    setError(null);
    const acc: Progress = { done: [], failed: [], remaining: null, finished: false };
    setProgress({ ...acc });
    try {
      for (let guard = 0; guard < 500; guard++) {
        const res = await apiRequest<DetailResponse<StoreTransferResult>>(
          `/platform/stores/${store.id}/transfer-products`,
          {
            method: "POST",
            body: {
              to_store_id: target.id,
              mode,
              ...(currenciesDiffer ? { price_rate: rateNumber } : {}),
            },
          },
        );
        acc.done.push(...res.data.done);
        acc.failed.push(...res.data.failed);
        acc.remaining = res.data.remaining;
        setProgress({ ...acc });
        if (res.data.remaining === 0 || res.data.failed.length > 0) break;
      }
      acc.finished = true;
      setProgress({ ...acc });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setRunning(false);
      void qc.invalidateQueries({ queryKey: ["platform", "stores"] });
    }
  }

  const copied = progress?.done.filter((d) => d.result === "copied").length ?? 0;
  const already = progress?.done.filter((d) => d.result === "already_there").length ?? 0;
  const finished = progress?.finished && !running;

  return (
    <Dialog
      open={store !== null}
      onClose={running ? () => {} : onClose}
      title={`Move products from ${store?.name ?? "store"}`}
      description="Copies every draft and active product — images, variants, stock, prices, categories and collections — into another store. Orders stay where they are."
      footer={
        finished ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={running}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="transfer-form"
              loading={running}
              disabled={!target || rateInvalid}
            >
              {mode === "move" ? "Move products" : "Copy products"}
            </Button>
          </>
        )
      }
    >
      <form
        id="transfer-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <Field label="Send products to" required>
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={targetId}
              disabled={running || !!finished}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">Choose a store…</option>
              {targets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.handle}, {s.currency})
                </option>
              ))}
            </Select>
          )}
        </Field>

        <fieldset className="flex flex-col gap-2" disabled={running || !!finished}>
          <legend className="mb-1 text-sm font-medium">What happens to the originals</legend>
          {(
            [
              ["move", "Move", `Archive them in ${store?.name ?? "this store"} after copying`],
              ["copy", "Copy", "Keep them in both stores"],
            ] as const
          ).map(([value, label, hint]) => (
            <label key={value} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name={modeName}
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
                className="mt-0.5 size-4 accent-[var(--color-primary)]"
              />
              <span>
                <span className="font-medium">{label}</span>
                <span className="block text-fg-muted">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {currenciesDiffer && (
          <Field
            label={`Price rate (${store?.currency} → ${target?.currency})`}
            required
            error={rateInvalid ? "Enter a number above 0" : undefined}
            hint={`Every price is multiplied by this. 1 keeps the same numbers (48.00 ${store?.currency} → 48.00 ${target?.currency}).`}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                inputMode="decimal"
                aria-describedby={describedBy}
                invalid={invalid}
                value={rate}
                disabled={running || !!finished}
                onChange={(e) => setRate(e.target.value)}
              />
            )}
          </Field>
        )}

        {error && <Alert tone="danger" title={error} />}
        {progress && (
          <div role="status" aria-live="polite" className="flex flex-col gap-2 text-sm">
            <p>
              {running ? "Working… " : ""}
              {copied} copied
              {already ? `, ${already} already there` : ""}
              {progress.remaining !== null && progress.remaining > 0
                ? `, ${progress.remaining} to go`
                : ""}
              .
            </p>
            {finished && progress.failed.length === 0 && (
              <Alert tone="success" title="All products are in the new store">
                {mode === "move"
                  ? `The originals are archived in ${store?.name}.`
                  : "The originals are unchanged."}
              </Alert>
            )}
            {progress.failed.length > 0 && (
              <Alert tone="danger" title="Some products couldn't be moved">
                <ul className="list-disc pl-5">
                  {progress.failed.map((f) => (
                    <li key={f.title}>
                      {f.title}: {f.message}
                    </li>
                  ))}
                </ul>
                Nothing was archived for these. Fix the cause and run it again — finished products
                are skipped.
              </Alert>
            )}
          </div>
        )}
      </form>
    </Dialog>
  );
}
