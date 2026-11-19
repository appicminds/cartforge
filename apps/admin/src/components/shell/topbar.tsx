"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut, Menu, Store } from "lucide-react";
import { Breadcrumb, IconButton, cn, type BreadcrumbItem } from "@cartforge/ui";
import { useSession } from "@/lib/session";
import { findNavItem } from "./nav";

function useBreadcrumbs(): BreadcrumbItem[] {
  const pathname = usePathname();
  const item = findNavItem(pathname);
  if (!item || item.href === "/admin") return [{ label: "Home" }];
  const crumbs: BreadcrumbItem[] = [
    { label: "Home", href: "/admin" },
    { label: item.label, href: item.href },
  ];
  if (pathname !== item.href) crumbs.push({ label: "Details" });
  return crumbs;
}

function StoreSwitcher() {
  const { user, store, setStoreId } = useSession();
  if (user.stores.length <= 1) {
    return (
      <span className="hidden items-center gap-2 text-sm text-fg-muted sm:flex">
        <Store aria-hidden className="size-4" />
        {store?.store_name}
      </span>
    );
  }
  return (
    <label className="flex items-center gap-2 text-sm">
      <Store aria-hidden className="size-4 text-fg-muted" />
      <span className="sr-only">Active store</span>
      <select
        value={store?.store_id ?? ""}
        onChange={(e) => setStoreId(e.target.value)}
        className="h-8 max-w-44 rounded-md border border-border-strong bg-surface px-2 text-sm"
      >
        {user.stores.map((s) => (
          <option key={s.store_id} value={s.store_id}>
            {s.store_name}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProfileMenu() {
  const { user, store, logout } = useSession();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.name}`}
        onClick={() => setOpen((o) => !o)}
        className="flex size-8 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary hover:ring-2 hover:ring-primary/20"
      >
        {initials}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 z-(--cf-z-dropdown) w-64 rounded-lg border border-border bg-surface-raised p-1 shadow-lg"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-fg-muted">{user.email}</p>
            {store && <p className="mt-1 text-xs text-fg-subtle">{store.role_name}</p>}
          </div>
          <button
            role="menuitem"
            type="button"
            disabled={pending}
            autoFocus
            onClick={async () => {
              setPending(true);
              try {
                await logout();
              } finally {
                setPending(false);
              }
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-surface-sunken focus-visible:bg-surface-sunken disabled:opacity-50"
          >
            <LogOut aria-hidden className="size-4" />
            {pending ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const crumbs = useBreadcrumbs();
  return (
    <header
      className={cn(
        "sticky top-0 z-(--cf-z-sticky) flex h-(--cf-topbar-height) items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur sm:px-6",
      )}
    >
      <IconButton
        label="Open navigation"
        icon={<Menu />}
        onClick={onOpenNav}
        className="lg:hidden"
      />
      <div className="min-w-0 flex-1">
        <Breadcrumb
          items={crumbs}
          renderLink={(item, className) => (
            <Link href={item.href} className={className}>
              {item.label}
            </Link>
          )}
        />
      </div>
      <StoreSwitcher />
      <ProfileMenu />
    </header>
  );
}
