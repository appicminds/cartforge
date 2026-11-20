"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Button, Dialog, Input, cn } from "@cartforge/ui";

export interface PickerOption {
  id: string;
  label: string;
  /** Shown as indentation (category trees). */
  depth?: number;
  hint?: string;
}

/**
 * Multi-select shown as removable chips, edited in a searchable dialog
 * (categories, collections). Keyboard- and screen-reader-friendly.
 */
export function ChipPicker({
  label,
  options,
  value,
  onChange,
  disabled,
  emptyText,
  addLabel = "Add",
}: {
  label: string;
  options: PickerOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  emptyText: string;
  addLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Set<string>>(new Set(value));
  const [q, setQ] = useState("");
  useEffect(() => {
    if (open) {
      setDraft(new Set(value));
      setQ("");
    }
  }, [open, value]);

  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const visible = options.filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm text-fg">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.length === 0 && <span className="text-xs text-fg-subtle">{emptyText}</span>}
        {value.map((id) => (
          <span
            key={id}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-surface-sunken px-2 py-0.5 text-xs"
          >
            <span className="truncate">{byId.get(id)?.label ?? "…"}</span>
            {!disabled && (
              <button
                type="button"
                aria-label={`Remove ${byId.get(id)?.label ?? "item"}`}
                onClick={() => onChange(value.filter((v) => v !== id))}
                className="rounded text-fg-muted hover:text-fg"
              >
                <X aria-hidden className="size-3" />
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <Button
            variant="link"
            size="sm"
            className="h-auto px-0"
            aria-label={`${addLabel} ${label.toLowerCase()}`}
            onClick={() => setOpen(true)}
          >
            {addLabel}
          </Button>
        )}
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                // Keep the original order of options for stable display.
                onChange(options.filter((o) => draft.has(o.id)).map((o) => o.id));
                setOpen(false);
              }}
            >
              Done
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
            />
            <Input
              aria-label={`Search ${label.toLowerCase()}`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8"
              autoFocus
            />
          </div>
          {visible.length === 0 ? (
            <p className="py-4 text-center text-sm text-fg-muted">Nothing found.</p>
          ) : (
            <ul className="max-h-[45vh] overflow-y-auto" aria-label={label}>
              {visible.map((o) => (
                <li key={o.id}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-sunken",
                    )}
                    style={{ paddingLeft: `${0.5 + (q ? 0 : (o.depth ?? 0)) * 1.25}rem` }}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={draft.has(o.id)}
                      onChange={(e) =>
                        setDraft((d) => {
                          const next = new Set(d);
                          if (e.target.checked) next.add(o.id);
                          else next.delete(o.id);
                          return next;
                        })
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.hint && <span className="text-xs text-fg-subtle">{o.hint}</span>}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>
    </div>
  );
}
