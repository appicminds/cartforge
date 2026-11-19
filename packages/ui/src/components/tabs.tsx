"use client";

import { useRef, type KeyboardEvent } from "react";
import { cn } from "../cn";

export interface TabItem<V extends string> {
  value: V;
  label: string;
}

/**
 * Horizontal view tabs (e.g. All / Active / Draft) for filtering a resource
 * list. WAI-ARIA tabs: roving tabindex, Left/Right/Home/End to move.
 */
export function Tabs<V extends string>({
  items,
  value,
  onChange,
  label,
  controls,
  className,
}: {
  items: TabItem<V>[];
  value: V;
  onChange: (value: V) => void;
  label: string;
  /** id of the panel the tabs control. */
  controls?: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    items.findIndex((i) => i.value === value),
  );

  const onKey = (e: KeyboardEvent) => {
    const last = items.length - 1;
    const next =
      e.key === "ArrowRight"
        ? (index + 1) % items.length
        : e.key === "ArrowLeft"
          ? (index - 1 + items.length) % items.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    onChange(items[next]!.value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKey}
      className={cn("flex gap-1 overflow-x-auto", className)}
    >
      {items.map((item, i) => {
        const selected = i === index;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={controls}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            className={cn(
              "h-7 shrink-0 rounded-lg px-3 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg",
              selected && "bg-surface-sunken text-fg",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
