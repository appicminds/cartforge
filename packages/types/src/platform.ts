/** Editions, sign-up, domains and platform administration (P1). */

export const PLATFORM_ERROR_CODES = {
  SIGNUP_DISABLED: "SIGNUP_DISABLED",
  EMAIL_TAKEN: "EMAIL_TAKEN",
  HANDLE_TAKEN: "HANDLE_TAKEN",
  STORE_CREATION_DISABLED: "STORE_CREATION_DISABLED",
  DOMAIN_TAKEN: "DOMAIN_TAKEN",
  DOMAIN_NOT_FOUND: "DOMAIN_NOT_FOUND",
  DOMAIN_NOT_VERIFIED: "DOMAIN_NOT_VERIFIED",
  DOMAIN_RESERVED: "DOMAIN_RESERVED",
  PLATFORM_ADMIN_REQUIRED: "PLATFORM_ADMIN_REQUIRED",
} as const;

export type Edition = "saas" | "self_hosted";

/** Public: tells the admin UI what to offer (sign-up link, subdomain hints). */
export interface PlatformConfig {
  edition: Edition;
  signup_enabled: boolean;
  /** "myshops.com" → stores live at <handle>.myshops.com. */
  platform_domain: string | null;
}

export interface StoreDomainView {
  id: string;
  hostname: string;
  kind: "platform" | "custom";
  status: "pending" | "active";
  is_primary: boolean;
  verified_at: string | null;
  last_error: string | null;
  /** DNS records the merchant must create (custom domains). */
  dns: { type: "TXT" | "CNAME"; name: string; value: string; purpose: string }[];
}

export interface CreatedStore {
  store_id: string;
  name: string;
  handle: string;
  url: string | null;
}

export interface PlatformStoreRow {
  id: string;
  name: string;
  handle: string;
  status: "active" | "suspended";
  plan: string;
  currency: string;
  owner_email: string | null;
  primary_domain: string | null;
  product_count: number;
  order_count: number;
  created_at: string;
  suspended_at: string | null;
  suspension_reason: string | null;
}

/** Public store lookup used by the shared storefront (host → store). */
export interface ResolvedStore {
  store_id: string;
  name: string;
  /** https://<primary domain>, used for canonical links and sitemaps. */
  url: string | null;
}
