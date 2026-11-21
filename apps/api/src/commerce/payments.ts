import type { CheckoutSettings } from "@cartforge/checkout-engine";
import {
  providerInfo,
  type OnlineProviderKey,
  type PaymentOption,
  type PaymentStatus,
} from "@cartforge/types";

/**
 * Payment Hub adapter boundary (PRD §14.1). Checkout only talks to this
 * interface; provider-specific code lives in one adapter each. Next 4 ships the
 * two offline methods; Next 5 adds hosted/tokenized providers (Stripe, PayPal…)
 * with webhooks and server-side reconciliation behind the same contract.
 */
export interface PaymentInitiation {
  status: PaymentStatus;
  /** Shown on the confirmation page (e.g. bank details). */
  instructions: string | null;
  provider_reference: string | null;
  /** Hosted payment page to send the shopper to (online providers). */
  redirect_url: string | null;
}

export interface PaymentProvider {
  key: string;
  label: string;
  enabled(settings: CheckoutSettings, currency: string): boolean;
  describe(settings: CheckoutSettings): PaymentOption;
  initiate(args: {
    settings: CheckoutSettings;
    order_id: string;
    order_number: string;
    amount_minor: number;
    currency: string;
  }): Promise<PaymentInitiation>;
}

const offline = (
  key: string,
  label: string,
  description: string,
  enabled: (s: CheckoutSettings, currency: string) => boolean,
  instructions: (s: CheckoutSettings, number: string) => string,
): PaymentProvider => ({
  key,
  label,
  enabled,
  describe: () => ({ key, label, description }),
  async initiate({ settings, order_number }) {
    return {
      status: "pending",
      instructions: instructions(settings, order_number) || null,
      provider_reference: null,
      redirect_url: null,
    };
  },
});

/** 0300 1234567 */
const spaced = (n: string) => (n.length === 11 ? `${n.slice(0, 4)} ${n.slice(4)}` : n);
/** PK36 SCBL 0000 0011 2345 6702 */
const ibanGroups = (v: string) => v.replace(/(.{4})/g, "$1 ").trim();

function walletInstructions(s: CheckoutSettings, orderNumber: string): string {
  const lines = [
    "Send the order total to any of these:",
    s.wallet_jazzcash && `• JazzCash: ${spaced(s.wallet_jazzcash)}`,
    s.wallet_easypaisa && `• Easypaisa: ${spaced(s.wallet_easypaisa)}`,
    s.wallet_raast_id && `• Raast ID: ${spaced(s.wallet_raast_id)}`,
    s.wallet_iban && `• IBAN: ${ibanGroups(s.wallet_iban)}`,
    `Account title: ${s.wallet_account_title}`,
    `Reference: order ${orderNumber}`,
    s.wallet_note,
  ];
  return lines.filter(Boolean).join("\n");
}

export const PAYMENT_PROVIDERS: PaymentProvider[] = [
  offline(
    "bank_transfer",
    "Bank transfer",
    "Pay by bank transfer. Your order ships once the payment arrives.",
    (s) => s.bank_transfer_enabled,
    (s, n) =>
      `${s.bank_transfer_instructions}\n\nUse order number ${n} as the payment reference.`.trim(),
  ),
  offline(
    "wallet_transfer",
    "JazzCash, Easypaisa or Raast transfer",
    "Send the amount from your mobile wallet or banking app. Your order ships once it arrives.",
    // JazzCash, Easypaisa and Raast move rupees only.
    (s, currency) => s.wallet_enabled && currency === "PKR",
    walletInstructions,
  ),
  offline(
    "cod",
    "Cash on delivery",
    "Pay when your order is delivered.",
    (s) => s.cod_enabled,
    (s) => s.cod_instructions,
  ),
];

/**
 * Online providers (Next 5): the shopper pays on the provider's page after the order
 * is placed, so placing it only records a pending payment.
 */
function online(key: OnlineProviderKey): PaymentProvider {
  const info = providerInfo(key)!;
  return {
    key,
    label: info.checkout_label,
    enabled: () => true,
    describe: () => ({ key, label: info.checkout_label, description: info.checkout_description }),
    async initiate() {
      return {
        status: "pending",
        instructions: null,
        provider_reference: null,
        redirect_url: null,
      };
    },
  };
}

/** Offline methods switched on in settings, then the store's connected online providers. */
export function enabledProviders(
  settings: CheckoutSettings,
  onlineKeys: readonly OnlineProviderKey[],
  currency: string,
): PaymentProvider[] {
  return [
    ...PAYMENT_PROVIDERS.filter((p) => p.enabled(settings, currency)),
    ...onlineKeys.map(online),
  ];
}

export function providerFor(
  settings: CheckoutSettings,
  key: string | null,
  onlineKeys: readonly OnlineProviderKey[],
  currency: string,
): PaymentProvider | null {
  return enabledProviders(settings, onlineKeys, currency).find((p) => p.key === key) ?? null;
}
