import type { Permission } from "./permissions.js";

export interface StoreMembershipSummary {
  store_id: string;
  store_name: string;
  role_key: string;
  role_name: string;
  permissions: Permission[];
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
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
