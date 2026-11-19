"use client";

import { Alert, Dialog, Skeleton } from "@cartforge/ui";
import { formatDateTime } from "@/lib/format";
import { REASON_LABEL, useMovements } from "@/lib/inventory";

/** Immutable stock movement history for one variant (PRD §9 INV-006). */
export function MovementsDialog({
  target,
  onClose,
}: {
  target: { variant_id: string; label: string } | null;
  onClose: () => void;
}) {
  const moves = useMovements(target?.variant_id ?? null);
  return (
    <Dialog
      open={Boolean(target)}
      onClose={onClose}
      title="Stock history"
      description={target?.label}
      className="w-[min(40rem,calc(100vw-2rem))]"
    >
      {moves.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : moves.isError ? (
        <Alert tone="danger" title="Couldn't load history">
          {moves.error.message}
        </Alert>
      ) : moves.data.data.length === 0 ? (
        <p className="py-6 text-center text-sm text-fg-muted">No stock movements yet.</p>
      ) : (
        <ol
          className="max-h-[55vh] divide-y divide-border overflow-y-auto"
          aria-label="Stock movements"
        >
          {moves.data.data.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-4 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{REASON_LABEL[m.movement_type] ?? m.movement_type}</p>
                <p className="text-xs text-fg-muted">
                  {formatDateTime(m.created_at)}
                  {m.actor && <> · {m.actor.name}</>} · {m.location_name}
                </p>
                {m.reason && <p className="mt-0.5 text-xs text-fg-subtle">{m.reason}</p>}
              </div>
              <div className="shrink-0 text-right tabular-nums">
                <p
                  className={
                    m.quantity_delta > 0
                      ? "font-semibold text-success"
                      : "font-semibold text-danger"
                  }
                >
                  {m.quantity_delta > 0 ? `+${m.quantity_delta}` : m.quantity_delta}
                </p>
                <p className="text-xs text-fg-muted">
                  {m.quantity_before} → {m.quantity_after}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}
