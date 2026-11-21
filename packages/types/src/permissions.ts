/**
 * Permission catalog (PRD §3, §23). Permissions are granular strings checked
 * server-side on every protected operation. System-critical permissions
 * (license, security settings, payment secrets) are separate so they can be
 * withheld from otherwise-powerful roles.
 */
export const PERMISSIONS = {
  STORE_READ: "store.read",
  STORE_SETTINGS_WRITE: "store.settings.write",

  STAFF_READ: "staff.read",
  STAFF_WRITE: "staff.write",

  PRODUCTS_READ: "products.read",
  PRODUCTS_WRITE: "products.write",
  PRODUCTS_PUBLISH: "products.publish",
  PRODUCTS_DELETE: "products.delete",

  CATEGORIES_WRITE: "categories.write",
  COLLECTIONS_WRITE: "collections.write",

  INVENTORY_READ: "inventory.read",
  INVENTORY_ADJUST: "inventory.adjust",

  MEDIA_READ: "media.read",
  MEDIA_WRITE: "media.write",
  MEDIA_DELETE: "media.delete",

  ORDERS_READ: "orders.read",
  ORDERS_WRITE: "orders.write",
  ORDERS_REFUND: "orders.refund",

  CUSTOMERS_READ: "customers.read",
  CUSTOMERS_WRITE: "customers.write",

  /** Discount codes, automatic discounts and sales (bulk price changes). */
  DISCOUNTS_WRITE: "discounts.write",

  CONTENT_WRITE: "content.write",
  THEMES_WRITE: "themes.write",

  DEVELOPER_API_KEYS: "developer.api_keys",
  DEVELOPER_WEBHOOKS: "developer.webhooks",

  // System-critical — controlled separately (PRD §3).
  PAYMENTS_SECRETS: "payments.secrets",
  SECURITY_SETTINGS: "security.settings",
  LICENSE_MANAGE: "license.manage",
  STORE_OWNERSHIP_TRANSFER: "store.ownership.transfer",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS);

export const SYSTEM_CRITICAL_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.PAYMENTS_SECRETS,
  PERMISSIONS.SECURITY_SETTINGS,
  PERMISSIONS.LICENSE_MANAGE,
  PERMISSIONS.STORE_OWNERSHIP_TRANSFER,
];

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(value);
}

const P = PERMISSIONS;

/** Built-in roles seeded for every store. Custom roles arrive with Next 1. */
export const SYSTEM_ROLES = {
  owner: {
    name: "Store Owner",
    permissions: ALL_PERMISSIONS,
  },
  admin: {
    name: "Store Administrator",
    permissions: ALL_PERMISSIONS.filter(
      (p) => p !== P.STORE_OWNERSHIP_TRANSFER && p !== P.LICENSE_MANAGE,
    ),
  },
  catalog_manager: {
    name: "Catalog Manager",
    permissions: [
      P.STORE_READ,
      P.PRODUCTS_READ,
      P.PRODUCTS_WRITE,
      P.PRODUCTS_PUBLISH,
      P.PRODUCTS_DELETE,
      P.CATEGORIES_WRITE,
      P.COLLECTIONS_WRITE,
      P.INVENTORY_READ,
      P.MEDIA_READ,
      P.MEDIA_WRITE,
      P.MEDIA_DELETE,
    ],
  },
  order_manager: {
    name: "Order Manager",
    permissions: [
      P.STORE_READ,
      P.PRODUCTS_READ,
      P.INVENTORY_READ,
      P.ORDERS_READ,
      P.ORDERS_WRITE,
      P.CUSTOMERS_READ,
    ],
  },
  content_designer: {
    name: "Content Designer",
    permissions: [
      P.STORE_READ,
      P.PRODUCTS_READ,
      P.CONTENT_WRITE,
      P.THEMES_WRITE,
      P.MEDIA_READ,
      P.MEDIA_WRITE,
      P.MEDIA_DELETE,
    ],
  },
} as const satisfies Record<string, { name: string; permissions: readonly Permission[] }>;

export type SystemRoleKey = keyof typeof SYSTEM_ROLES;
