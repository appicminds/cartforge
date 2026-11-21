import {
  Boxes,
  Building2,
  Contact,
  CreditCard,
  FolderTree,
  Earth,
  Globe,
  Home,
  Layers,
  Package,
  Receipt,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { PERMISSIONS, type Permission } from "@cartforge/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Hidden unless the user has this permission in the active store. */
  permission?: Permission;
  /** Only for platform administrators (works without an open store). */
  platformOnly?: boolean;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

/**
 * Admin navigation (Appendix A). Only routes that exist are listed — modules are
 * added here as they ship (Products in Sprint 1), never as dead links.
 */
export const NAV: NavSection[] = [
  {
    items: [
      { label: "Home", href: "/admin", icon: Home },
      {
        label: "Orders",
        href: "/admin/orders",
        icon: Receipt,
        permission: PERMISSIONS.ORDERS_READ,
      },
      {
        label: "Customers",
        href: "/admin/customers",
        icon: Contact,
        permission: PERMISSIONS.CUSTOMERS_READ,
      },
      {
        label: "Products",
        href: "/admin/products",
        icon: Package,
        permission: PERMISSIONS.PRODUCTS_READ,
      },
      {
        label: "Categories",
        href: "/admin/categories",
        icon: FolderTree,
        permission: PERMISSIONS.PRODUCTS_READ,
      },
      {
        label: "Collections",
        href: "/admin/collections",
        icon: Layers,
        permission: PERMISSIONS.PRODUCTS_READ,
      },
      {
        label: "Inventory",
        href: "/admin/inventory",
        icon: Boxes,
        permission: PERMISSIONS.INVENTORY_READ,
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        label: "Checkout",
        href: "/admin/settings/checkout",
        icon: CreditCard,
        permission: PERMISSIONS.STORE_READ,
      },
      {
        label: "Payments",
        href: "/admin/settings/payments",
        icon: Wallet,
        permission: PERMISSIONS.STORE_READ,
      },
      {
        label: "Markets",
        href: "/admin/settings/markets",
        icon: Earth,
        permission: PERMISSIONS.STORE_READ,
      },
      {
        label: "Domains",
        href: "/admin/settings/domains",
        icon: Globe,
        permission: PERMISSIONS.STORE_READ,
      },
      {
        label: "Team",
        href: "/admin/settings/team",
        icon: Users,
        permission: PERMISSIONS.STAFF_READ,
      },
    ],
  },
  {
    label: "Platform",
    items: [
      { label: "All stores", href: "/admin/platform/stores", icon: Building2, platformOnly: true },
    ],
  },
];

export function findNavItem(pathname: string): NavItem | undefined {
  const all = NAV.flatMap((s) => s.items);
  return (
    all.find((i) => i.href === pathname) ??
    all
      .filter((i) => i.href !== "/admin" && pathname.startsWith(`${i.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]
  );
}
