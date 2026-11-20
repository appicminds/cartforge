import type { Permission } from "./permissions.js";

export interface StoreMembershipSummary {
  store_id: string;
  store_name: string;
  /** Subdomain label, e.g. "northwind". */
  store_handle: string;
  store_status: "active" | "suspended";
  /** Storefront address (primary domain), when one is set up. */
  store_url: string | null;
  /**
   * Preview address on the shared storefront (`<STOREFRONT_URL>/?store=<handle>`), for stores
   * without a domain yet. Not a public shop address: the storefront marks it as a preview.
   */
  store_preview_url: string | null;
  role_key: string;
  role_name: string;
  permissions: Permission[];
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  /** Operates the whole installation / platform. */
  is_platform_admin: boolean;
  /** May create another store from "Your stores". */
  can_create_stores: boolean;
  stores: StoreMembershipSummary[];
}

export interface StoreSummary {
  id: string;
  name: string;
  currency: string;
  locale: string;
  timezone: string;
  contact_email: string | null;
}
