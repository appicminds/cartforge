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
  PRICE_RATE_REQUIRED: "PRICE_RATE_REQUIRED",
  SAME_STORE: "SAME_STORE",
  EMAIL_NOT_VERIFIED: "EMAIL_NOT_VERIFIED",
} as const;

export type Edition = "saas" | "self_hosted";

/** Public: tells the admin UI what to offer (sign-up link, subdomain hints). */
export interface PlatformConfig {
  edition: Edition;
  signup_enabled: boolean;
  /** "myshops.com" → stores live at <handle>.myshops.com. */
  platform_domain: string | null;
  /**
   * How account emails are delivered: "sent" (email provider configured), "logged"
   * (development: links are printed in the API log) or "off" (nothing is sent).
   */
  email: "sent" | "logged" | "off";
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

/** One batch of a platform admin product transfer (POST /platform/stores/:id/transfer-products). */
export interface StoreTransferResult {
  from: { id: string; name: string; currency: string };
  to: { id: string; name: string; currency: string };
  mode: "move" | "copy";
  /** Products handled in this batch. */
  done: { title: string; result: "copied" | "already_there" }[];
  failed: { title: string; message: string }[];
  /** Products still to do; call again until 0. */
  remaining: number;
}
