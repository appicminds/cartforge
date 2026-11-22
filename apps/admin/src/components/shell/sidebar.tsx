"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { cn, IconButton } from "@cartforge/ui";
import { useSession } from "@/lib/session";
import { NAV, findNavItem, type NavItem } from "./nav";

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link href="/admin" className="flex items-center gap-2 rounded-md px-1 text-nav-fg-active">
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary font-bold text-primary-fg"
      >
        C
      </span>
      <span className={cn("font-semibold tracking-tight", collapsed && "sr-only")}>CartForge</span>
    </Link>
  );
}

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can, user, store } = useSession();
  const active = findNavItem(pathname);
  const visible = (i: NavItem) =>
    i.platformOnly
      ? user.is_platform_admin
      : i.href === "/admin" || (store !== null && (!i.permission || can(i.permission)));

  return (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
      {NAV.map((section, si) => {
        const items = section.items.filter(visible);
        if (!items.length) return null;
        return (
          <div key={section.label ?? si} className="mb-5">
            {section.label &&
              (collapsed ? (
                <div aria-hidden className="mx-2 mb-2 border-t border-white/10" />
              ) : (
                <p className="mb-1 px-2 text-xs font-medium text-nav-fg/60">{section.label}</p>
              ))}
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => {
                const children = (item.children ?? []).filter(visible);
                const childActive = children.some((c) => c === active);
                const open = item === active || childActive;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={item === active ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex h-9 items-center gap-3 rounded-md px-2 text-sm text-nav-fg transition-colors hover:bg-nav-item-hover hover:text-nav-fg-active",
                        // A section you're in stands out; the exact page gets the fill
                        // (or the parent does when the menu is collapsed to icons).
                        open && "font-medium text-nav-fg-active",
                        (item === active || (collapsed && childActive)) && "bg-nav-item-active",
                        collapsed && "justify-center",
                      )}
                    >
                      <Icon aria-hidden className="size-4 shrink-0" />
                      <span className={cn(collapsed && "sr-only")}>{item.label}</span>
                    </Link>
                    {open && !collapsed && children.length > 0 && (
                      <ul aria-label={item.label} className="mt-0.5 flex flex-col gap-0.5">
                        {children.map((c) => (
                          <li key={`${c.href}-${c.label}`}>
                            <Link
                              href={c.href}
                              onClick={onNavigate}
                              aria-current={c === active ? "page" : undefined}
                              className={cn(
                                "flex h-8 items-center rounded-md pl-9 pr-2 text-sm text-nav-fg transition-colors hover:bg-nav-item-hover hover:text-nav-fg-active",
                                c === active && "bg-nav-item-active font-medium text-nav-fg-active",
                              )}
                            >
                              {c.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

/** Persistent desktop sidebar; collapses to icons (PRD §5.1). */
export function DesktopSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col bg-nav-bg transition-[width] duration-200 lg:flex",
        collapsed ? "w-(--cf-sidebar-width-collapsed)" : "w-(--cf-sidebar-width)",
      )}
    >
      <div
        className={cn(
          "flex h-(--cf-topbar-height) items-center px-4",
          collapsed && "justify-center px-0",
        )}
      >
        <Brand collapsed={collapsed} />
      </div>
      <NavList collapsed={collapsed} />
      <div className={cn("border-t border-white/10 p-3", collapsed && "flex justify-center")}>
        <IconButton
          label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          icon={collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          onClick={onToggle}
          className="text-nav-fg hover:bg-nav-item-hover hover:text-nav-fg-active"
        />
      </div>
    </aside>
  );
}

/** Off-canvas drawer for tablet/mobile. */
export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-(--cf-z-drawer) lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Navigation"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-nav-bg shadow-lg">
        <div className="flex h-(--cf-topbar-height) items-center justify-between px-4">
          <Brand collapsed={false} />
          <IconButton
            label="Close navigation"
            icon={<X />}
            onClick={onClose}
            autoFocus
            className="text-nav-fg hover:bg-nav-item-hover hover:text-nav-fg-active"
          />
        </div>
        <NavList collapsed={false} onNavigate={onClose} />
      </aside>
    </div>
  );
}
