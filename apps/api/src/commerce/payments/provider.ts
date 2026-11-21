import type { OnlineProviderKey, PaymentRedirect } from "@cartforge/types";

/** Outbound HTTP used by adapters; tests replace it so no real gateway is ever called. */
export interface PaymentHttp {
  request(
    url: string,
    init: { method: "GET" | "POST"; headers?: Record<string, string>; body?: string },
  ): Promise<{ status: number; text: string }>;
}
export const PAYMENT_HTTP = Symbol("PAYMENT_HTTP");

export const fetchHttp: PaymentHttp = {
  async request(url, init) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
    return { status: res.status, text: await res.text() };
  },
};

export interface ProviderContext {
  mode: "test" | "live";
  credentials: Record<string, string>;
  http: PaymentHttp;
}

export interface SessionRequest {
  payment_id: string;
  order_id: string;
  order_number: string;
  amount_minor: number;
  currency: string;
  email: string | null;
  phone: string | null;
  description: string;
  /** Storefront address the provider sends the shopper back to. */
  return_url: string;
  cancel_url: string;
  /** API address for server-to-server notifications. */
  webhook_url: string;
}

export interface SessionResult {
  /** Our handle for this attempt at the provider (session id, tracker, txn ref…). */
  reference: string;
  redirect: PaymentRedirect;
}

export type Outcome = "paid" | "failed" | "canceled" | "pending" | "refunded" | "ignored";

/** A verified statement from the provider about one payment attempt. */
export interface ProviderMessage {
  reference: string;
  /** Unique per provider message, for idempotency. */
  external_id: string;
  outcome: Outcome;
  amount_minor?: number;
  currency?: string;
  /** Provider's charge/payment id, kept for refunds. */
  charge_id?: string;
  reason?: string;
  /** What to keep as evidence (never secrets or card data). */
  evidence: Record<string, unknown>;
}

export type ReturnResult =
  | { kind: "message"; message: ProviderMessage }
  /** Multi-step providers: send the shopper on to the next page. */
  | { kind: "redirect"; reference: string; redirect: PaymentRedirect };

export interface WebhookResult {
  message: ProviderMessage | null;
  /** Some providers expect a specific acknowledgement. */
  respond?: { status: number; body: unknown };
}

export interface OnlineProvider {
  key: OnlineProviderKey;
  createSession(ctx: ProviderContext, req: SessionRequest): Promise<SessionResult>;
  handleReturn(ctx: ProviderContext, params: Record<string, string>): Promise<ReturnResult>;
  handleWebhook?(
    ctx: ProviderContext,
    raw: Buffer,
    headers: Record<string, string | undefined>,
  ): Promise<WebhookResult>;
  refund?(
    ctx: ProviderContext,
    p: { reference: string; charge_id: string | null; amount_minor: number; currency: string },
  ): Promise<{ reference: string }>;
}

/** Provider said no or answered nonsense; the message is safe to show to staff. */
export class ProviderError extends Error {}
/** A message claimed to come from the provider but its signature didn't match. */
export class SignatureError extends Error {}
