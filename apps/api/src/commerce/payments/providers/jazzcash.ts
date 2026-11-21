import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { fromUnits, toUnits } from "../amounts";
import { ProviderError, SignatureError, type OnlineProvider } from "../provider";

const FORM_URL = {
  test: "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/",
  live: "https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/",
} as const;

/**
 * pp_SecureHash: HMAC-SHA256, keyed with the integrity salt, over
 * `salt&v1&v2…` where v are the non-empty pp_/ppmpf_ values sorted by field name.
 * Uppercase hex. (Page Redirection v1.1.)
 */
export function jazzcashHash(fields: Record<string, string>, salt: string): string {
  const values = Object.keys(fields)
    .filter((k) => (k.startsWith("pp_") || k.startsWith("ppmpf_")) && k !== "pp_SecureHash")
    .sort()
    .map((k) => fields[k] ?? "")
    .filter((v) => v !== "");
  return createHmac("sha256", salt)
    .update([salt, ...values].join("&"))
    .digest("hex")
    .toUpperCase();
}

/** yyyyMMddHHmmss in Pakistan time (UTC+5, no daylight saving). */
export function pkTime(d: Date): string {
  const t = new Date(d.getTime() + 5 * 3600_000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}`;
}

const verify = (fields: Record<string, string>, salt: string) => {
  const expected = Buffer.from(jazzcashHash(fields, salt));
  const got = Buffer.from((fields.pp_SecureHash ?? "").toUpperCase());
  if (!salt || got.length !== expected.length || !timingSafeEqual(got, expected))
    throw new SignatureError("JazzCash secure hash mismatch");
};

const outcomeOf = (code: string | undefined) =>
  code === "000"
    ? "paid"
    : code === "121" || code === "124" || code === "157"
      ? "pending"
      : "failed";

const messageFrom = (f: Record<string, string>, source: string) => ({
  reference: f.pp_TxnRefNo ?? "",
  external_id: `${f.pp_TxnRefNo}:${f.pp_ResponseCode}:${source}`,
  outcome: outcomeOf(f.pp_ResponseCode) as "paid" | "pending" | "failed",
  amount_minor: f.pp_Amount ? fromUnits(Number(f.pp_Amount), "PKR", 2) : undefined,
  currency: f.pp_TxnCurrency || "PKR",
  charge_id: f.pp_RetreivalReferenceNo || f.pp_TxnRefNo,
  reason: f.pp_ResponseCode === "000" ? undefined : f.pp_ResponseMessage,
  evidence: {
    source,
    code: f.pp_ResponseCode ?? null,
    message: f.pp_ResponseMessage ?? null,
    txn: f.pp_TxnRefNo ?? null,
  },
});

/** JazzCash Page Redirection (v1.1): the shopper pays on JazzCash's page. Beta. */
export const jazzcash: OnlineProvider = {
  key: "jazzcash",

  async createSession(ctx, req) {
    if (req.currency !== "PKR") throw new ProviderError("JazzCash accepts PKR only.");
    const { merchant_id, password, integrity_salt } = ctx.credentials;
    if (!merchant_id || !password || !integrity_salt)
      throw new ProviderError("JazzCash isn't fully set up.");
    const now = new Date();
    const ref = `T${pkTime(now)}${randomInt(100, 999)}`;
    const fields: Record<string, string> = {
      pp_Version: "1.1",
      pp_TxnType: "",
      pp_Language: "EN",
      pp_MerchantID: merchant_id,
      pp_SubMerchantID: "",
      pp_Password: password,
      pp_BankID: "",
      pp_ProductID: "",
      pp_TxnRefNo: ref,
      // JazzCash counts in paisa.
      pp_Amount: String(toUnits(req.amount_minor, "PKR", 2)),
      pp_TxnCurrency: "PKR",
      pp_TxnDateTime: pkTime(now),
      pp_BillReference: `order${req.order_number}`.replace(/[^A-Za-z0-9]/g, "").slice(0, 20),
      pp_Description: req.description.slice(0, 100),
      pp_TxnExpiryDateTime: pkTime(new Date(now.getTime() + 24 * 3600_000)),
      pp_ReturnURL: req.return_url,
      ppmpf_1: req.order_id,
      ppmpf_2: "",
      ppmpf_3: "",
      ppmpf_4: "",
      ppmpf_5: "",
    };
    fields.pp_SecureHash = jazzcashHash(fields, integrity_salt);
    return { reference: ref, redirect: { method: "POST", url: FORM_URL[ctx.mode], fields } };
  },

  async handleReturn(ctx, params) {
    verify(params, ctx.credentials.integrity_salt ?? "");
    return { kind: "message", message: messageFrom(params, "return") };
  },

  /** IPN (Instant Payment Notification): same signed fields; JazzCash expects a signed reply. */
  async handleWebhook(ctx, raw) {
    const text = raw.toString("utf8");
    const fields: Record<string, string> = text.trim().startsWith("{")
      ? (JSON.parse(text) as Record<string, string>)
      : Object.fromEntries(new URLSearchParams(text));
    const salt = ctx.credentials.integrity_salt ?? "";
    verify(fields, salt);
    const ack: Record<string, string> = {
      pp_ResponseCode: "000",
      pp_ResponseMessage: "IPN received",
    };
    ack.pp_SecureHash = jazzcashHash(ack, salt);
    return { message: messageFrom(fields, "ipn"), respond: { status: 200, body: ack } };
  },
};
