import {
  Boxes,
  Building2,
  Contact,
  CreditCard,
  FolderTree,
  Earth,
  FileText,
  Globe,
  Home,
  Layers,
  Menu,
  Newspaper,
  Paintbrush,
  Package,
  Percent,
  Receipt,
  Tag,
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
  /** Sub-pages, shown under the item while you're in that part of the admin. */
  children?: NavItem[];
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

/**
 * Admin navigation (Appendix A). Only routes that exist are listed — modules are
 * added here as they ship, never as dead links. Everyday work first, then sales
 * channels, then settings.
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
        label: "Products",
        href: "/admin/products",
        icon: Package,
        permission: PERMISSIONS.PRODUCTS_READ,
        children: [
          {
            label: "Collections",
            href: "/admin/collections",
            icon: Layers,
            permission: PERMISSIONS.PRODUCTS_READ,
          },
          {
            label: "Categories",
            href: "/admin/categories",
            icon: FolderTree,
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
        label: "Customers",
        href: "/admin/customers",
        icon: Contact,
        permission: PERMISSIONS.CUSTOMERS_READ,
      },
      {
        label: "Discounts",
        href: "/admin/discounts",
        icon: Tag,
        permission: PERMISSIONS.STORE_READ,
        children: [
          {
            label: "Sales",
            href: "/admin/discounts/sales",
            icon: Percent,
            permission: PERMISSIONS.STORE_READ,
          },
        ],
      },
      {
        label: "Markets",
        href: "/admin/settings/markets",
        icon: Earth,
        permission: PERMISSIONS.STORE_READ,
      },
    ],
  },
  {
    label: "Sales channels",
    items: [
      {
        label: "Online store",
        href: "/admin/online-store",
        icon: Paintbrush,
        permission: PERMISSIONS.STORE_READ,
        children: [
          {
            label: "Themes",
            href: "/admin/online-store",
            icon: Paintbrush,
            permission: PERMISSIONS.STORE_READ,
          },
          {
            label: "Pages",
            href: "/admin/online-store/pages",
            icon: FileText,
            permission: PERMISSIONS.STORE_READ,
          },
          {
            label: "Blog posts",
            href: "/admin/online-store/blog",
            icon: Newspaper,
            permission: PERMISSIONS.STORE_READ,
          },
          {
            label: "Navigation",
            href: "/admin/online-store/navigation",
            icon: Menu,
            permission: PERMISSIONS.STORE_READ,
          },
        ],
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

/** Every item, sub-pages first so they win over a parent with the same address. */
function allItems(): NavItem[] {
  return NAV.flatMap((s) => s.items.flatMap((i) => [...(i.children ?? []), i]));
}

/** The menu entry for a page: an exact match, else the longest address the page sits under. */
export function findNavItem(pathname: string): NavItem | undefined {
  const all = allItems();
  return (
    all.find((i) => i.href === pathname) ??
    all
      .filter((i) => i.href !== "/admin" && pathname.startsWith(`${i.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]
  );
}
