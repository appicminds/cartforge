"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "../cn";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

/**
 * Accessible action menu: Enter/Space/ArrowDown opens, arrows move, Escape
 * closes and restores focus, click-outside closes (WAI-ARIA menu button).
 */
export function Menu({
  trigger,
  label,
  items,
  align = "end",
  triggerClassName,
}: {
  trigger: ReactNode;
  label: string;
  items: MenuItem[];
  align?: "start" | "end";
  /** Extra classes for the trigger button (e.g. on dark surfaces). */
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);

  const focusItem = (idx: number) => itemRefs.current[idx]?.focus();
  const close = (restore = true) => {
    setOpen(false);
    if (restore) buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    // Focus the first enabled item once the menu renders.
    itemRefs.current.find((el) => el && !el.disabled)?.focus();
    const onDown = (e: MouseEvent) =>
      !rootRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    const current = itemRefs.current.findIndex((el) => el === document.activeElement);
    const pos = enabled.indexOf(current);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(enabled[(pos + 1) % enabled.length]!);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(enabled[(pos - 1 + enabled.length) % enabled.length]!);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusItem(enabled[0]!);
    } else if (e.key === "End") {
      e.preventDefault();
      focusItem(enabled[enabled.length - 1]!);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-surface-sunken hover:text-fg [&_svg]:size-4",
          triggerClassName,
        )}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className={cn(
            "absolute top-9 z-(--cf-z-dropdown) min-w-44 rounded-lg border border-border bg-surface-raised p-1 shadow-lg",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item, i) => (
            <button
              key={item.label}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              role="menuitem"
              type="button"
              tabIndex={-1}
              disabled={item.disabled}
              onClick={() => {
                close(false);
                item.onSelect();
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm outline-none hover:bg-surface-sunken focus-visible:bg-surface-sunken disabled:opacity-50 [&_svg]:size-4",
                item.destructive ? "text-danger" : "text-fg",
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
