/** Payment Hub (Next 5): online payment providers and how stores connect them. */

export const PAYMENT_ERROR_CODES = {
  PAYMENT_PROVIDER_ERROR: "PAYMENT_PROVIDER_ERROR",
  PAYMENT_NOT_CONFIGURED: "PAYMENT_NOT_CONFIGURED",
  PAYMENT_SIGNATURE_INVALID: "PAYMENT_SIGNATURE_INVALID",
  PAYMENT_NOT_PENDING: "PAYMENT_NOT_PENDING",
} as const;

export type OnlineProviderKey = "stripe" | "safepay" | "jazzcash" | "easypaisa";

export interface CredentialField {
  key: string;
  label: string;
  /** Secret values are write-only: the admin never sees them again. */
  secret: boolean;
  required: boolean;
  hint?: string;
}

export interface ProviderInfo {
  key: OnlineProviderKey;
  name: string;
  /** Shown to shoppers at checkout. */
  checkout_label: string;
  checkout_description: string;
  /** null = any currency the provider accepts. */
  currencies: string[] | null;
  refunds: boolean;
  /** "beta": built to the published spec, to be confirmed with the provider's sandbox. */
  maturity: "stable" | "beta";
  /** Where to get an account. */
  signup_url: string;
  notes: string;
  fields: CredentialField[];
}

export const PAYMENT_PROVIDERS_INFO: ProviderInfo[] = [
  {
    key: "safepay",
    name: "Safepay",
    checkout_label: "Card, wallet or Raast (Safepay)",
    checkout_description: "Pay securely with a debit/credit card, mobile wallet or Raast.",
    currencies: ["PKR"],
    refunds: false,
    maturity: "beta",
    signup_url: "https://getsafepay.com",
    notes: "Pakistan: cards, wallets and Raast through one hosted checkout.",
    fields: [
      { key: "api_key", label: "API key", secret: false, required: true },
      { key: "secret_key", label: "Secret key", secret: true, required: true },
    ],
  },
  {
    key: "jazzcash",
    name: "JazzCash",
    checkout_label: "JazzCash",
    checkout_description: "Pay with your JazzCash wallet or card on JazzCash's secure page.",
    currencies: ["PKR"],
    refunds: false,
    maturity: "beta",
    signup_url: "https://www.jazzcash.com.pk/corporate/online-payment-gateway/",
    notes: "Pakistan: JazzCash merchant account required (Page Redirection v1.1).",
    fields: [
      { key: "merchant_id", label: "Merchant ID", secret: false, required: true },
      { key: "password", label: "Password", secret: true, required: true },
      { key: "integrity_salt", label: "Integrity salt", secret: true, required: true },
    ],
  },
  {
    key: "easypaisa",
    name: "Easypaisa",
    checkout_label: "Easypaisa",
    checkout_description: "Pay with your Easypaisa account or card on Easypaisa's secure page.",
    currencies: ["PKR"],
    refunds: false,
    maturity: "beta",
    signup_url: "https://easypay.easypaisa.com.pk",
    notes: "Pakistan: Easypay merchant account required (hosted checkout).",
    fields: [
      { key: "store_id", label: "Store ID", secret: false, required: true },
      { key: "hash_key", label: "Hash key", secret: true, required: true, hint: "16 characters." },
      {
        key: "account_number",
        label: "Account number",
        secret: false,
        required: false,
        hint: "With the API login below, payments are confirmed automatically.",
      },
      { key: "api_username", label: "API username", secret: false, required: false },
      { key: "api_password", label: "API password", secret: true, required: false },
    ],
  },
  {
    key: "stripe",
    name: "Stripe",
    checkout_label: "Card, Apple Pay or Google Pay",
    checkout_description: "Pay securely by card or wallet on Stripe's checkout page.",
    currencies: null,
    refunds: true,
    maturity: "stable",
    signup_url: "https://dashboard.stripe.com/register",
    notes: "For stores outside Pakistan (Stripe doesn't onboard Pakistani businesses).",
    fields: [
      {
        key: "secret_key",
        label: "Secret key",
        secret: true,
        required: true,
        hint: "sk_test_… for test mode, sk_live_… for live.",
      },
      {
        key: "webhook_secret",
        label: "Webhook signing secret",
        secret: true,
        required: true,
        hint: "whsec_… from the webhook endpoint you add in Stripe (use the URL below).",
      },
    ],
  },
];

export function providerInfo(key: string): ProviderInfo | undefined {
  return PAYMENT_PROVIDERS_INFO.find((p) => p.key === key);
}

/** A store's connection, as the admin sees it (secrets never leave the API). */
export interface PaymentAccountView {
  provider: OnlineProviderKey;
  connected: boolean;
  mode: "test" | "live";
  enabled: boolean;
  /** Non-secret values (e.g. merchant id); secrets are only reported as set. */
  values: Record<string, string>;
  set_fields: string[];
  /** Give this to the provider for payment notifications. */
  webhook_url: string;
  /** Some providers need the return address registered too. */
  return_url: string;
  updated_at: string | null;
}

/** How the storefront sends the shopper to the payment page. */
export interface PaymentRedirect {
  method: "GET" | "POST";
  url: string;
  fields: Record<string, string>;
}
