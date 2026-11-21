import { createHmac, timingSafeEqual } from "node:crypto";
import { fromUnits, stripeDigits, toUnits } from "../amounts";
import {
  ProviderError,
  SignatureError,
  type OnlineProvider,
  type ProviderContext,
  type ProviderMessage,
} from "../provider";

const API = "https://api.stripe.com/v1";
/** Stripe rejects webhook timestamps older than this to stop replays. */
const TOLERANCE_S = 300;

function form(obj: Record<string, string | number | undefined | null>): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

async function call(ctx: ProviderContext, method: "GET" | "POST", path: string, body?: string) {
  const key = ctx.credentials.secret_key ?? "";
  if (ctx.mode === "live" ? !key.startsWith("sk_live_") : !key.startsWith("sk_test_"))
    throw new ProviderError(
      `Stripe ${ctx.mode} mode needs a ${ctx.mode === "live" ? "sk_live_" : "sk_test_"} secret key.`,
    );
  const res = await ctx.http.request(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2024-06-20",
    },
    body,
  });
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(res.text) as Record<string, unknown>;
  } catch {
    throw new ProviderError(`Stripe answered ${res.status}.`);
  }
  if (res.status >= 400) {
    const err = json.error as { message?: string } | undefined;
    throw new ProviderError(`Stripe: ${err?.message ?? `error ${res.status}`}`);
  }
  return json;
}

/** Stripe-Signature: "t=<unix>,v1=<hex hmac of `${t}.${body}`>" (possibly several v1). */
export function verifyStripeSignature(
  raw: Buffer,
  header: string | undefined,
  secret: string,
  nowS = Math.floor(Date.now() / 1000),
): void {
  if (!header || !secret) throw new SignatureError("Missing Stripe signature");
  const parts = header.split(",").map((p) => p.split("=", 2) as [string, string]);
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length) throw new SignatureError("Malformed Stripe signature");
  if (Math.abs(nowS - t) > TOLERANCE_S) throw new SignatureError("Stale Stripe signature");
  const expected = createHmac("sha256", secret).update(`${t}.`).update(raw).digest();
  const ok = sigs.some((s) => {
    const got = Buffer.from(s, "hex");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
  if (!ok) throw new SignatureError("Stripe signature mismatch");
}

type Session = {
  id: string;
  url?: string;
  payment_status?: string;
  status?: string;
  amount_total?: number;
  currency?: string;
  payment_intent?: string | null;
};

const fromSession = (s: Session, external: string, source: string): ProviderMessage => ({
  reference: s.id,
  external_id: external,
  outcome: s.payment_status === "paid" ? "paid" : s.status === "expired" ? "canceled" : "pending",
  amount_minor:
    s.amount_total !== undefined && s.currency
      ? fromUnits(s.amount_total, s.currency.toUpperCase(), stripeDigits(s.currency))
      : undefined,
  currency: s.currency?.toUpperCase(),
  charge_id: s.payment_intent ?? undefined,
  evidence: { source, session: s.id, payment_status: s.payment_status, status: s.status },
});

/** Stripe Checkout (hosted page): cards, Apple Pay, Google Pay… */
export const stripe: OnlineProvider = {
  key: "stripe",

  async createSession(ctx, req) {
    const json = (await call(
      ctx,
      "POST",
      "/checkout/sessions",
      form({
        mode: "payment",
        "line_items[0][quantity]": 1,
        "line_items[0][price_data][currency]": req.currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": toUnits(
          req.amount_minor,
          req.currency,
          stripeDigits(req.currency),
        ),
        "line_items[0][price_data][product_data][name]": req.description,
        client_reference_id: req.order_id,
        customer_email: req.email,
        "metadata[order_id]": req.order_id,
        "metadata[payment_id]": req.payment_id,
        "payment_intent_data[metadata][order_id]": req.order_id,
        success_url: `${req.return_url}${req.return_url.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: req.cancel_url,
      }),
    )) as unknown as Session;
    if (!json.id || !json.url) throw new ProviderError("Stripe didn't return a checkout page.");
    return { reference: json.id, redirect: { method: "GET", url: json.url, fields: {} } };
  },

  async handleReturn(ctx, params) {
    const id = params.session_id;
    if (!id || !/^cs_[A-Za-z0-9_]+$/.test(id)) throw new SignatureError("Missing Stripe session");
    // Never trust the redirect: ask Stripe.
    const s = (await call(ctx, "GET", `/checkout/sessions/${id}`)) as unknown as Session;
    return {
      kind: "message",
      message: fromSession(s, `${s.id}:return:${s.payment_status}`, "return"),
    };
  },

  async handleWebhook(ctx, raw, headers) {
    verifyStripeSignature(raw, headers["stripe-signature"], ctx.credentials.webhook_secret ?? "");
    const event = JSON.parse(raw.toString("utf8")) as {
      id: string;
      type: string;
      data: { object: Session };
    };
    const s = event.data.object;
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.expired":
        return { message: fromSession(s, event.id, "webhook") };
      case "checkout.session.async_payment_failed":
        return { message: { ...fromSession(s, event.id, "webhook"), outcome: "failed" } };
      default:
        return { message: null };
    }
  },

  async refund(ctx, p) {
    if (!p.charge_id) throw new ProviderError("This payment has no Stripe payment to refund.");
    const r = (await call(
      ctx,
      "POST",
      "/refunds",
      form({
        payment_intent: p.charge_id,
        amount: toUnits(p.amount_minor, p.currency, stripeDigits(p.currency)),
      }),
    )) as { id?: string; status?: string };
    if (!r.id || r.status === "failed" || r.status === "canceled")
      throw new ProviderError("Stripe couldn't refund this payment.");
    return { reference: r.id };
  },
};
