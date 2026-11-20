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
  /** False until the person confirms they own the address (link in the welcome email). */
  email_verified: boolean;
  /** Two-factor sign-in (authenticator app) is on. */
  mfa_enabled: boolean;
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

/** One signed-in browser or device (Your account → Signed-in devices). */
export interface SessionView {
  id: string;
  /** e.g. "Chrome on macOS". */
  device: string;
  ip: string | null;
  created_at: string;
  last_seen_at: string;
  current: boolean;
}

/** Login answer when the password was right but an authenticator code is still needed. */
export interface MfaChallenge {
  mfa_required: true;
  /** Short-lived (5 minutes); send with the code to POST /auth/login/mfa. */
  mfa_token: string;
}

export interface MfaSetup {
  /** Base32 secret, for typing into the app by hand. */
  secret: string;
  /** otpauth:// URL, shown as a QR code. */
  otpauth_url: string;
}
