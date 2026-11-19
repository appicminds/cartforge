"use client";

import { useEffect, useId, useState } from "react";
import { ADJUSTMENT_REASONS } from "@cartforge/validation";
import {
  Alert,
  Button,
  Dialog,
  Field,
  Input,
  Select,
  Tabs,
  Textarea,
  useToast,
} from "@cartforge/ui";
import { ApiError } from "@/lib/api-client";
import { REASON_LABEL, useAdjustStock } from "@/lib/inventory";

export interface AdjustTarget {
  variant_id: string;
  label: string;
  on_hand: number;
}

type Mode = "delta" | "set";

/**
 * Stock adjustment (PRD §9.2): quantity change or counted quantity, location,
 * mandatory reason. Never edits "available" directly.
 */
export function AdjustStockDialog({
  target,
  onClose,
}: {
  target: AdjustTarget | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const adjust = useAdjustStock();
  const noteId = useId();
  const [mode, setMode] = useState<Mode>("delta");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<(typeof ADJUSTMENT_REASONS)[number]>("received");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setMode("delta");
    setQty("");
    setReason("received");
    setNote("");
    setError(null);
  }, [target]);

  const n = qty.trim() === "" ? null : Number(qty);
  const valid = n !== null && Number.isInteger(n) && (mode === "set" ? n >= 0 : n !== 0);
  const after = target && valid ? (mode === "set" ? n! : target.on_hand + n!) : null;

  const submit = async () => {
    if (!target || !valid) {
      setError(
        mode === "set"
          ? "Enter the counted quantity (0 or more)."
          : "Enter a whole number, e.g. 5 or -2.",
      );
      return;
    }
    setError(null);
    try {
      await adjust.mutateAsync({
        variant_id: target.variant_id,
        mode,
        quantity: n!,
        reason,
        ...(note.trim() && { note: note.trim() }),
      });
      toast.success(`Stock updated: ${target.label} now ${after}`);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.fields[0]?.message ?? err.message)
          : "Couldn't update stock.",
      );
    }
  };

  return (
    <Dialog
      open={Boolean(target)}
      onClose={() => !adjust.isPending && onClose()}
      title="Adjust stock"
      description={target ? `${target.label} · ${target.on_hand} on hand` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={adjust.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={adjust.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Tabs<Mode>
          label="Adjustment type"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setReason(m === "set" ? "correction" : "received");
          }}
          items={[
            { value: "delta", label: "Add or remove" },
            { value: "set", label: "Set counted quantity" },
          ]}
        />
        {error && <Alert tone="danger" title={error} />}
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={mode === "set" ? "Counted quantity" : "Change by"}
            hint={mode === "delta" ? "Use a minus sign to remove, e.g. -2" : undefined}
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                inputMode="numeric"
                autoFocus
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^\d-]/g, ""))}
                placeholder={mode === "set" ? "0" : "+5"}
              />
            )}
          </Field>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-fg">New on hand</span>
            <span
              className="flex h-8 items-center text-sm font-semibold tabular-nums"
              aria-live="polite"
            >
              {after === null ? "—" : after}
              {after !== null && after < 0 && (
                <span className="ml-2 text-xs font-normal text-danger">below zero</span>
              )}
            </span>
          </div>
        </div>
        <Field label="Reason">
          {({ id }) => (
            <Select
              id={id}
              value={reason}
              onChange={(e) => setReason(e.target.value as typeof reason)}
            >
              {ADJUSTMENT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REASON_LABEL[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex flex-col gap-1">
          <label htmlFor={noteId} className="text-sm text-fg">
            Note{" "}
            {reason === "other" ? (
              <span className="text-danger">*</span>
            ) : (
              <span className="text-fg-subtle">(optional)</span>
            )}
          </label>
          <Textarea
            id={noteId}
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            className="min-h-16"
          />
        </div>
      </form>
    </Dialog>
  );
}
