import { createHmac, timingSafeEqual } from "node:crypto";
import { toMajor } from "../amounts";
import { ProviderError, SignatureError, type OnlineProvider } from "../provider";

const HOSTS = {
  test: {
    api: "https://sandbox.api.getsafepay.com",
    checkout: "https://sandbox.api.getsafepay.com/components",
    env: "sandbox",
  },
  live: {
    api: "https://api.getsafepay.com",
    checkout: "https://api.getsafepay.com/components",
    env: "production",
  },
} as const;

/** Safepay signs the success redirect: sig = HMAC-SHA256(tracker, secret key), hex. */
export function safepaySignature(tracker: string, secret: string): string {
  return createHmac("sha256", secret).update(tracker).digest("hex");
}

/**
 * Safepay hosted checkout (Pakistan: cards, wallets, Raast). A tracker ("beacon") is
 * created server-side, the shopper pays on Safepay's page, and the signed redirect
 * back confirms the payment.
 */
export const safepay: OnlineProvider = {
  key: "safepay",

  async createSession(ctx, req) {
    if (req.currency !== "PKR") throw new ProviderError("Safepay accepts PKR only.");
    const host = HOSTS[ctx.mode];
    const res = await ctx.http.request(`${host.api}/order/v1/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client: ctx.credentials.api_key,
        amount: toMajor(req.amount_minor, req.currency),
        currency: "PKR",
        environment: host.env,
      }),
    });
    let token: string | undefined;
    try {
      token = (JSON.parse(res.text) as { data?: { token?: string } }).data?.token;
    } catch {
      /* handled below */
    }
    if (res.status >= 400 || !token)
      throw new ProviderError(`Safepay couldn't start the payment (${res.status}).`);
    const q = new URLSearchParams({
      env: host.env,
      beacon: token,
      source: "custom",
      order_id: req.order_number,
      redirect_url: req.return_url,
      cancel_url: req.cancel_url,
    });
    return {
      reference: token,
      redirect: { method: "GET", url: `${host.checkout}/?${q.toString()}`, fields: {} },
    };
  },

  async handleReturn(ctx, params) {
    const tracker = params.tracker ?? params.beacon ?? "";
    if (params.cancel === "1" || (!params.sig && tracker))
      return {
        kind: "message",
        message: {
          reference: tracker,
          external_id: `${tracker}:canceled`,
          outcome: "canceled",
          evidence: { source: "return", tracker },
        },
      };
    const secret = ctx.credentials.secret_key ?? "";
    const expected = Buffer.from(safepaySignature(tracker, secret));
    const got = Buffer.from(params.sig ?? "");
    if (!tracker || !secret || got.length !== expected.length || !timingSafeEqual(got, expected))
      throw new SignatureError("Safepay signature mismatch");
    return {
      kind: "message",
      message: {
        reference: tracker,
        external_id: `${tracker}:paid`,
        outcome: "paid",
        charge_id: params.reference || undefined,
        evidence: { source: "return", tracker, reference: params.reference ?? null },
      },
    };
  },
};
