import { Home, type LucideIcon } from "lucide-react";
import type { Permission } from "@cartforge/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Hidden unless the user has this permission in the active store. */
  permission?: Permission;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

/**
 * Admin navigation (Appendix A). Only routes that exist are listed — modules are
 * added here as they ship (Products in Sprint 1), never as dead links.
 */
export const NAV: NavSection[] = [{ items: [{ label: "Home", href: "/admin", icon: Home }] }];

export function findNavItem(pathname: string): NavItem | undefined {
  const all = NAV.flatMap((s) => s.items);
  return (
    all.find((i) => i.href === pathname) ??
    all
      .filter((i) => i.href !== "/admin" && pathname.startsWith(`${i.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]
  );
}
